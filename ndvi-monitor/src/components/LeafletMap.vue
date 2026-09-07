<template>
  <div class="map-container" ref="containerEl">
    <div id="map" ref="mapEl"></div>
    <template v-if="state.compareMode">
      <div
        class="map-divider"
        :title="t('map.resize')"
        @mousedown="startResize"
        @dblclick="resetSplit"
      ></div>
      <div id="map-right" ref="mapRightEl" class="map-right" :style="{ width: rightWidth + '%' }"></div>
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, nextTick } from 'vue'
import {
  state, mapReg, onMapClick, onFieldCreated, onFieldEdited,
  onAoiRectangleCreated,
  loadIndexForMonthRight, setBaseLayer, updateAoiRectangle,
  showToast,
} from '../store'
import { MAP_CENTER, MAP_ZOOM } from '../config'
import { useI18n } from '../i18n'

const L = window.L
const { t } = useI18n()

// --- Mobile polygon-close patch for leaflet-draw 1.0.4 ---
// leaflet-draw only finishes a polygon on touch when the tap lands within a
// HARDCODED 10px of the first point (_endPoint -> _calculateFinishDistance,
// which measures container-pixel distance to this._markers[0]). A finger tap
// routinely lands 10-30px off, so on a phone the shape either never closes or
// silently grows a tiny stray vertex (a thin slit spike) when the user
// miss-clicks the starting point. Re-implement the endpoint handler on the
// shared Polyline prototype (Polygon inherits it) with a much more generous
// close radius for touch/pointer input. Desktop behavior is unchanged: it
// still closes only via the first-vertex marker click / double-click, since
// the proximity-finish branch below only ever fires for touch input.
const TOUCH_CLOSE_PX = 28
if (L.Draw && L.Draw.Polyline && typeof L.Draw.Polyline.prototype._endPoint === 'function') {
  L.Draw.Polyline.prototype._endPoint = function (clientX, clientY, e) {
    if (!this._mouseDownOrigin) return
    const dragCheckDistance = L.point(clientX, clientY).distanceTo(this._mouseDownOrigin)
    const lastPtDistance = this._calculateFinishDistance(e.latlng)
    const isTouch = L.Browser.touch ||
      (e.originalEvent && (e.originalEvent.pointerType === 'touch' || e.originalEvent.touches != null))
    if (this.options.maxPoints > 1 && this.options.maxPoints === this._markers.length + 1) {
      this.addVertex(e.latlng)
      this._finishShape()
    } else if (isTouch && lastPtDistance < TOUCH_CLOSE_PX) {
      this._finishShape()
    } else if (Math.abs(dragCheckDistance) < 9 * (window.devicePixelRatio || 1)) {
      this.addVertex(e.latlng)
    }
    this._enableNewMarkers()
    this._mouseDownOrigin = null
  }
}
const mapEl = ref(null)
const mapRightEl = ref(null)
const containerEl = ref(null)
const rightWidth = ref(50)
const resizing = ref(false)

function baseTileConfig() {
  const satellite = state.currentBase === 'satellite'
  return {
    url: satellite
      ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
      : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: satellite ? 'Tiles &copy; Esri' : '&copy; OpenStreetMap contributors',
  }
}

const LONG_PRESS_MS = 600
const LONG_PRESS_MOVE_TOLERANCE = 8
let pressTimer = null
let pressStart = null
let pressLatLng = null

function cancelLongPress() {
  if (pressTimer) { clearTimeout(pressTimer); pressTimer = null }
  pressStart = null
  pressLatLng = null
}

function onMapPointerDown(map, e) {
  if (e.pointerType === 'mouse' && e.button !== 0) return
  if (state.isDrawing || state.isAoiDraw || state.aoiEditMode) return
  if (e.target && e.target.closest && e.target.closest('.leaflet-control')) return
  cancelLongPress()
  const pt = map.mouseEventToContainerPoint(e)
  pressStart = pt
  pressLatLng = map.containerPointToLatLng(pt)
  pressTimer = setTimeout(() => {
    pressTimer = null
    const ll = pressLatLng
    pressStart = null
    pressLatLng = null
    onMapClick(ll.lat, ll.lng)
  }, LONG_PRESS_MS)
}

function onMapPointerMove(map, e) {
  if (!pressTimer || !pressStart) return
  const pt = map.mouseEventToContainerPoint(e)
  if (Math.hypot(pt.x - pressStart.x, pt.y - pressStart.y) > LONG_PRESS_MOVE_TOLERANCE) {
    cancelLongPress()
  }
}

function makeMainMap() {
  const map = L.map(mapEl.value, { center: MAP_CENTER, zoom: MAP_ZOOM })
  const baseConfig = baseTileConfig()
  const baseLayer = L.tileLayer(baseConfig.url, {
    attribution: baseConfig.attribution,
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

  const mapContainer = map.getContainer()
  mapContainer.addEventListener('pointerdown', (e) => onMapPointerDown(map, e))
  mapContainer.addEventListener('pointermove', (e) => onMapPointerMove(map, e))
  mapContainer.addEventListener('pointerup', cancelLongPress)
  mapContainer.addEventListener('pointercancel', cancelLongPress)
  mapContainer.addEventListener('pointerleave', cancelLongPress)
  map.on(L.Draw.Event.CREATED, (e) => {
    // A rectangle drawn in AOI-draw mode defines the analysis area, not a
    // saved field — route it to the AOI handler instead of the field flow.
    if (state.isAoiDraw) { onAoiRectangleCreated(e.layer); return }
    onFieldCreated(e.layer)
  })
  map.on(L.Draw.Event.EDITED, () => onFieldEdited())
  map.on(L.Draw.Event.EDITSTART, () => {
    if (drawnItems.getLayers().length === 0) {
      showToast(t('toast.draw_first'))
      if (drawControl._toolbars && drawControl._toolbars.edit) drawControl._toolbars.edit.disable()
    }
  })
  map.on(L.Draw.Event.DRAWSTART, () => { state.isDrawing = true })
  map.on(L.Draw.Event.DRAWSTOP, () => { state.isDrawing = false })

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
  const baseConfig = baseTileConfig()
  const baseLayerRight = L.tileLayer(baseConfig.url, {
    attribution: baseConfig.attribution,
    maxZoom: 19,
  }).addTo(mapRight)
  mapReg.mapRight = mapRight
  mapReg.baseLayerRight = baseLayerRight
}

function destroyRightMap() {
  if (mapReg.mapRight) {
    try { mapReg.mapRight.remove() } catch (e) {}
  }
  mapReg.mapRight = null
  mapReg.baseLayerRight = null
  mapReg.ndviLayerRight = null
  state.sceneCount.right = 0
  state.cloudBlock.right = null
}

function startResize(e) {
  e.preventDefault()
  resizing.value = true
  const startX = e.clientX
  const startW = rightWidth.value
  const containerW = containerEl.value ? containerEl.value.getBoundingClientRect().width : 0
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'

  function onMove(ev) {
    if (!containerW) return
    const delta = ev.clientX - startX
    let w = startW - (delta / containerW) * 100
    rightWidth.value = Math.min(80, Math.max(20, w))
    if (mapReg.map) mapReg.map.invalidateSize()
    if (mapReg.mapRight) mapReg.mapRight.invalidateSize()
  }

  function onUp() {
    resizing.value = false
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }

  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

function resetSplit() {
  rightWidth.value = 50
  if (mapReg.map) mapReg.map.invalidateSize()
  if (mapReg.mapRight) mapReg.mapRight.invalidateSize()
}

watch(() => state.compareMode, (on) => {
  if (on) {
    nextTick(() => {
      makeRightMap()
      mapReg.mapRight.setView(mapReg.map.getCenter(), mapReg.map.getZoom())
      mapReg.mapRight.invalidateSize()
      mapReg.map.invalidateSize()
      loadIndexForMonthRight(state.rightMonth)
    })
  } else {
    destroyRightMap()
    requestAnimationFrame(() => {
      if (mapReg.map) mapReg.map.invalidateSize()
    })
  }
})

watch(() => state.currentBase, (type) => setBaseLayer(type))

onMounted(() => {
  makeMainMap()
})
</script>
