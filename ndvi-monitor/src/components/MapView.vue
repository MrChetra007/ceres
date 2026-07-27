<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import ee from '@google/earthengine'

const EE_PROJECT_ID = 'ee-mengtong2025'
const CLIENT_ID = '355514869488-q3v52vvkb7c3gikr0og89o26m51ev403.apps.googleusercontent.com'

const mapContainer = ref(null)
let map = null
let ndviLayer = null

const eeStatus = ref('loading')
const eeStatusText = ref('Loading...')

onMounted(() => {
  initMap()
  eeStatus.value = 'auth'
  eeStatusText.value = 'Sign in with Google to view NDVI data'
})

onUnmounted(() => {
  if (map) map.remove()
})

function initMap() {
  map = L.map(mapContainer.value, {
    center: [13.05, 103.175],
    zoom: 11,
    zoomControl: true,
  })

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
  }).addTo(map)
}

function registerClientId() {
  try {
    ee.data.authenticateViaOauth(
      CLIENT_ID,
      null,
      null,
      null,
      () => {
        eeStatus.value = 'auth'
        eeStatusText.value = 'Sign in with Google to view NDVI data'
      },
      true
    )
  } catch {
    eeStatus.value = 'auth'
    eeStatusText.value = 'Sign in with Google to view NDVI data'
  }
}

function authenticate() {
  eeStatus.value = 'authenticating'
  eeStatusText.value = 'Signing in...'

  ee.data.authenticateViaOauth(
    CLIENT_ID,
    () => {
      eeStatus.value = 'initializing'
      eeStatusText.value = 'Initializing Earth Engine...'

      ee.initialize(
        null,
        null,
        () => {
          eeStatus.value = 'computing'
          eeStatusText.value = 'Computing NDVI...'
          computeAndShowNdvi()
        },
        (err) => {
          eeStatus.value = 'error'
          eeStatusText.value = `Init failed: ${err?.message || err || 'unknown error'}`
        },
        null,
        EE_PROJECT_ID
      )
    },
    (err) => {
      eeStatus.value = 'error'
      eeStatusText.value = `Auth failed: ${err?.message || err || 'unknown error'}`
    },
    null // extraScopes — not needed for read access
  )
}

function computeAndShowNdvi() {
  const battambang = ee.Geometry.Rectangle([103.10, 12.95, 103.25, 13.05])

  const s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(battambang)
    .filterDate('2026-06-01', '2026-07-01')
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
    .median()

  const ndvi = s2.normalizedDifference(['B8', 'B4']).rename('NDVI')
  const ndviVis = { min: -0.2, max: 0.8, palette: ['red', 'yellow', 'green'] }

  const mapId = ndvi.getMap(ndviVis)

  if (!mapId?.urlFormat) {
    eeStatus.value = 'error'
    eeStatusText.value = 'Could not get tile URL from Earth Engine'
    return
  }

  removeNdviLayer()
  ndviLayer = L.tileLayer(mapId.urlFormat, {
    attribution: 'Sentinel-2 / Google Earth Engine',
    opacity: 0.8,
  }).addTo(map)

  eeStatus.value = 'ready'
  eeStatusText.value = 'NDVI layer loaded — June 2026'
}

function removeNdviLayer() {
  if (ndviLayer) {
    map.removeLayer(ndviLayer)
    ndviLayer = null
  }
}
</script>

<template>
  <div class="map-wrapper">
    <div ref="mapContainer" class="map-container" />

    <div v-if="eeStatus === 'auth' || eeStatus === 'loading'" class="auth-overlay" @click="authenticate">
      <div class="auth-card">
        <h2>NDVI Rice Crop Health Monitor</h2>
        <p class="subtitle">Battambang, Cambodia</p>
        <p class="desc">Click to sign in with your Google account and view live satellite vegetation health data</p>
        <button class="sign-in-btn">
          <span class="g-icon">G</span>
          Sign in with Google
        </button>
      </div>
    </div>

    <div v-if="eeStatus === 'error'" class="auth-overlay" @click="authenticate">
      <div class="auth-card">
        <h2>Connection Issue</h2>
        <p class="desc">{{ eeStatusText }}</p>
        <p class="desc" style="font-size:13px;color:#888">Click to try again</p>
      </div>
    </div>

    <div v-if="eeStatus !== 'auth' && eeStatus !== 'loading'" :class="['status-bar', eeStatus]">
      <span class="status-dot" />
      {{ eeStatusText }}
    </div>
  </div>
</template>

<style scoped>
.map-wrapper {
  width: 100%;
  height: 100%;
  position: relative;
}

.map-container {
  width: 100%;
  height: 100%;
}

.auth-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  cursor: pointer;
}

.auth-card {
  background: #fff;
  border-radius: 16px;
  padding: 40px;
  text-align: center;
  max-width: 400px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.auth-card h2 {
  font-size: 22px;
  font-weight: 600;
  margin: 0 0 4px;
  color: #111;
}

.subtitle {
  color: #555;
  font-size: 14px;
  margin: 0 0 16px;
}

.desc {
  color: #666;
  font-size: 14px;
  line-height: 1.5;
  margin: 0 0 24px;
}

.sign-in-btn {
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 24px;
  padding: 12px 32px;
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  transition: box-shadow 0.2s;
}

.sign-in-btn:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.g-icon {
  background: #4285f4;
  color: #fff;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 700;
}

.status-bar {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.75);
  color: #fff;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
  backdrop-filter: blur(4px);
  z-index: 1000;
  white-space: nowrap;
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
}

.status-bar.authenticating .status-dot { background: #f59e0b; animation: pulse 1s infinite; }
.status-bar.initializing .status-dot { background: #f59e0b; animation: pulse 1s infinite; }
.status-bar.computing .status-dot { background: #f59e0b; animation: pulse 1s infinite; }
.status-bar.ready .status-dot { background: #22c55e; }
.status-bar.error .status-dot { background: #ef4444; }

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
</style>
