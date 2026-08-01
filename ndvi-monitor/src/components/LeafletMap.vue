<template>
  <div class="map-container">
    <div id="map" ref="mapEl"></div>
    <div id="map-right" ref="mapRightEl" class="map-right" v-show="state.compareMode"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import {
  state, mapReg, onMapClick, onFieldCreated, onFieldEdited,
  loadIndexForMonthRight, setBaseLayer, updateAoiRectangle,
  showToast,
} from '../store'
import { MAP_CENTER, MAP_ZOOM } from '../config'

const L = window.L
const mapEl = ref(null)
const mapRightEl = ref(null)

function makeMainMap() {
  const map = L.map(mapEl.value, { center: MAP_CENTER, zoom: MAP_ZOOM })
  const baseLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
  }).addTo(map)
  const drawnItems = new L.FeatureGroup()
  map.addLayer(drawnItems)
  const drawControl = new L.Control.Draw({
    position: 'topright',
    draw: {
      polygon: { showArea: true, metric: ['ha'] },
      rectangle: { showArea: true, metric: ['ha'] },
      marker: false,
      circle: false,
      circlemarker: false,
      polyline: false,
    },
    edit: { featureGroup: drawnItems },
  })
  map.addControl(drawControl)

  map.on('click', (e) => onMapClick(e.latlng.lat, e.latlng.lng))
  map.on(L.Draw.Event.CREATED, (e) => onFieldCreated(e.layer))
  map.on(L.Draw.Event.EDITED, () => onFieldEdited())
  map.on(L.Draw.Event.EDITSTART, () => {
    if (drawnItems.getLayers().length === 0) {
      showToast('Draw a field on the map first, then edit')
      if (drawControl._toolbars && drawControl._toolbars.edit) drawControl._toolbars.edit.disable()
    }
  })

  mapReg.map = map
  mapReg.baseLayer = baseLayer
  mapReg.drawnItems = drawnItems
  mapReg.drawControl = drawControl
  updateAoiRectangle()
  if (state.eeReady) {
    map.invalidateSize()
    map.setView(MAP_CENTER, MAP_ZOOM)
  }
}

function makeRightMap() {
  if (mapReg.mapRight) return
  const mapRight = L.map(mapRightEl.value, { center: MAP_CENTER, zoom: MAP_ZOOM })
  const baseLayerRight = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
  }).addTo(mapRight)
  mapRight.on('move', syncLeftFromRight)
  mapReg.map.on('move', syncRightFromLeft)
  mapReg.mapRight = mapRight
  mapReg.baseLayerRight = baseLayerRight
}

function syncRightFromLeft() {
  if (mapReg.syncing || !mapReg.mapRight) return
  mapReg.syncing = true
  mapReg.mapRight.setView(mapReg.map.getCenter(), mapReg.map.getZoom())
  mapReg.syncing = false
}

function syncLeftFromRight() {
  if (mapReg.syncing || !mapReg.mapRight) return
  mapReg.syncing = true
  mapReg.map.setView(mapReg.mapRight.getCenter(), mapReg.mapRight.getZoom())
  mapReg.syncing = false
}

watch(() => state.compareMode, (on) => {
  if (on) {
    makeRightMap()
    mapReg.mapRight.setView(mapReg.map.getCenter(), mapReg.map.getZoom())
    mapReg.map.invalidateSize()
    mapReg.mapRight.invalidateSize()
    loadIndexForMonthRight(state.rightMonth)
  } else {
    mapReg.map.invalidateSize()
  }
})

watch(() => state.currentBase, (type) => setBaseLayer(type))

onMounted(() => {
  makeMainMap()
})
</script>
