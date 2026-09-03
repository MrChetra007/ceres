<template>
  <div id="aoi-editor" class="aoi-editor-overlay" v-show="state.aoiEditorVisible">
    <div class="aoi-editor-modal aoi-editor-sheet" @click.self="doCancel">
      <div class="ae-sheet-header">
        <div>
          <h3>{{ isEdit ? t('aoi.edit_area') : t('aoi.new_area') }}</h3>
          <p class="aoi-editor-desc">{{ isEdit ? t('aoi.edit_hint') : t('aoi.draw_hint') }}</p>
        </div>
        <button class="ae-sheet-close" @click="doCancel"><i class="ti ti-x"></i></button>
      </div>

      <div class="aoi-editor-field">
        <label class="aoi-editor-label" for="ae-name">{{ t('aoi.name') }}</label>
        <input id="ae-name" type="text" v-model="name" :placeholder="t('aoi.name_example')" />
      </div>

      <!-- Live readout of the working polygon -->
      <div class="ae-panel" v-if="points.length >= 3">
        <div class="ae-panel-row">
          <span class="ae-point">{{ t('aoi.points_count', { n: points.length }) }}</span>
          <span class="ae-area">{{ t('aoi.area') }} · {{ areaText }}</span>
        </div>
        <div class="ae-panel-actions">
          <button class="ae-action" @click="beginDraw">
            <i class="ti ti-map-2"></i> {{ t('aoi.redraw') }}
          </button>
          <button class="ae-action danger" :disabled="points.length <= 3" @click="removeLast">
            <i class="ti ti-corner-up-left"></i> {{ t('aoi.remove_last') }}
          </button>
          <button class="ae-action" @click="doClear">
            <i class="ti ti-trash"></i> {{ t('aoi.clear') }}
          </button>
        </div>
        <div class="ae-hint-line">
          <span>{{ t('aoi.move_hint') }}</span>
          <span>{{ t('aoi.add_hint') }}</span>
          <span v-if="isEdit">{{ t('aoi.remove_hint') }}</span>
        </div>
      </div>
      <div class="ae-panel empty" v-else>
        <p class="aoi-editor-hint">{{ t('aoi.draw_first_hint') }}</p>
      </div>

      <div class="aoi-editor-footer">
        <button id="ae-cancel" @click="doCancel">{{ t('common.cancel') }}</button>
        <button class="ae-apply-btn" :disabled="busy || points.length < 3" @click="submit">
          {{ busy ? (isEdit ? t('aoi.saving') : t('aoi.creating')) : (isEdit ? t('aoi.save_changes') : t('aoi.create')) }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onBeforeUnmount, nextTick } from 'vue'
import { state, mapReg } from '../store'
import * as store from '../store'
import { useI18n } from '../i18n'

const { t } = useI18n()

const name = ref('')
const busy = ref(false)
const points = ref([])

let vertexMarkers = []
let polygonLayer = null
let midMarkers = []

const isEdit = computed(() => !!state.aoiEditorEditId)

function areaHectares(pts) {
  if (pts.length < 3) return 0
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i]
    const [x2, y2] = pts[(i + 1) % pts.length]
    a += (x1 * y2 - x2 * y1)
  }
  a = Math.abs(a / 2)
  // crude lat-lng to metres: scale x by cos(meanLat)
  const meanLat = pts.reduce((s, p) => s + p[1], 0) / pts.length
  const latScale = Math.cos((meanLat * Math.PI) / 180)
  const sqm = a * (111320 * latScale) * 111320
  return sqm / 10000
}

const areaText = computed(() => {
  const h = areaHectares(points.value)
  if (!h || h < 0) return '0 ha'
  if (h < 10) return h.toFixed(2) + ' ha'
  return Math.round(h) + ' ha'
})

function openEditor() {
  const editAoi = isEdit.value ? state.aois.find((a) => a.id === state.aoiEditorEditId) : null
  name.value = editAoi ? editAoi.name : ''
  const existing = store.getAoiWorkingPolygon(state.aoiEditorEditId)
  if (existing && existing.length >= 3) points.value = existing.map((p) => [p[0] * 1, p[1] * 1])
  else if (isEdit.value && editAoi) {
    const norm = store.normalizeAoiBounds(editAoi.bounds)
    if (norm.polygon) points.value = norm.polygon.map((p) => [p[0] * 1, p[1] * 1])
    else if (norm.rect) {
      const [w, s, e, n] = norm.rect
      points.value = [[w, s], [e, s], [e, n], [w, n]]
    }
  }
  else points.value = []

  state.aoiEditMode = true
  nextTick(() => {
    renderPolygon()
  })
}

function latlngs() {
  return points.value.map((p) => [p[1], p[0]])
}

function renderPolygon() {
  const map = mapReg.map
  if (!map) return
  clearEditLayers()

  if (points.value.length < 3) return
  polygonLayer = window.L.polygon([...latlngs(), latlngs()[0]], {
    color: '#ff4444', weight: 2, fill: true, fillColor: '#ff4444', fillOpacity: 0.12, dashArray: '4 4',
  }).addTo(map)

  points.value.forEach((p, i) => {
    const m = window.L.marker([p[1], p[0]], { draggable: true, icon: vertexIcon(i + 1) })
    m.on('dragend', (e) => onVertexMoved(i, e))
    m.on('dblclick', () => removeVertex(i))
    vertexMarkers.push(m)
    m.addTo(map)
  })

  // mid-edge markers = add-a-point affordance
  for (let i = 0; i < points.value.length; i++) {
    const a = points.value[i]
    const b = points.value[(i + 1) % points.value.length]
    const midLat = (a[1] + b[1]) / 2
    const midLng = (a[0] + b[0]) / 2
    const mm = window.L.marker([midLat, midLng], {
      draggable: false,
      icon: window.L.divIcon({
        className: 'ae-add-point',
        html: '+',
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      }),
    })
    mm.on('click', () => addVertex(i + 1, [midLng, midLat]))
    midMarkers.push(mm)
    mm.addTo(map)
  }
}

function clearEditLayers() {
  const map = mapReg.map
  if (!map) return
  for (const m of [...vertexMarkers, ...midMarkers]) { map.removeLayer(m) }
  if (polygonLayer) map.removeLayer(polygonLayer)
  vertexMarkers = []
  midMarkers = []
  polygonLayer = null
}

function onVertexMoved(i, e) {
  const ll = e.target.getLatLng()
  points.value[i] = [ll.lng, ll.lat]
  clearEditLayers()
  renderPolygon()
}

function addVertex(idx, latlng) {
  points.value.splice(idx, 0, [latlng[0], latlng[1]])
  clearEditLayers()
  renderPolygon()
}

function removeVertex(i) {
  if (points.value.length <= 3) return
  points.value.splice(i, 1)
  clearEditLayers()
  renderPolygon()
}


function vertexIcon(n) {
  return window.L.divIcon({
    className: 'ae-vertex',
    html: String(n),
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  })
}

function beginDraw() {
  store.cancelAoiDraw()
  store.startAoiDraw()
}

function removeLast() {
  if (points.value.length <= 3) return
  points.value.pop()
  clearEditLayers()
  renderPolygon()
}

function doClear() {
  points.value = []
  clearEditLayers()
  store.clearAoiPolygonDraft()
}

function doCancel() {
  clearEditLayers()
  store.clearAoiPolygonDraft()
  state.aoiEditMode = false
  state.aoiEditorVisible = false
  state.aoiEditorEditId = null
}

async function submit() {
  if (!name.value.trim()) {
    store.showToast(t('toast.area_name_first'))
    return
  }
  if (points.value.length < 3) {
    store.showToast(t('toast.area_points_first'))
    return
  }
  busy.value = true
  const nameToSave = name.value.trim()
  const pts = points.value.map((p) => [p[0] * 1, p[1] * 1])
  if (isEdit.value) {
    const ok = await store.saveAoiPolygon(state.aoiEditorEditId, nameToSave, pts)
    busy.value = false
    if (ok) doCancel()
    return
  }
  const aoi = await store.createAoi(nameToSave, { polygon: pts })
  busy.value = false
  if (aoi) doCancel()
}

watch(() => state.aoiEditorVisible, (open) => {
  if (open) {
    openEditor()
  } else {
    clearEditLayers()
    store.clearAoiPolygonDraft()
    if (!state.isAoiDraw) state.aoiEditMode = false
  }
})

watch(() => state.aoiPolygonDraft, (draft) => {
  if (draft && draft.length >= 3) {
    points.value = draft.map((p) => [p[0] * 1, p[1] * 1])
    clearEditLayers()
    renderPolygon()
  }
})

onBeforeUnmount(() => {
  clearEditLayers()
  state.aoiEditMode = false
})
</script>

<style scoped>
.ae-sheet-close { background: transparent; border: none; color: #666; font-size: 1.2rem; cursor: pointer; padding: 4px; }
.ae-sheet-close:hover { color: #333; }
.ae-sheet-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 0.5rem; }
.aoi-editor-sheet {
  position: fixed;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  width: 92%;
  max-width: 460px;
  max-height: 70vh;
  overflow-y: auto;
}
.ae-panel {
  background: #f7f8fa;
  border: 1px solid #e2e6ea;
  border-radius: 10px;
  padding: 10px 12px;
  margin-bottom: 0.75rem;
}
.ae-panel.empty { text-align: center; padding: 16px; }
.ae-panel-row { display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem; color: #444; margin-bottom: 8px; }
.ae-point { font-weight: 600; }
.ae-area { color: #78808a; }
.ae-panel-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.ae-action {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 5px 10px; border: 1px solid #d6dae0; border-radius: 7px;
  background: #fff; color: #444; font-size: 0.75rem; font-weight: 600; cursor: pointer;
}
.ae-action:hover { background: #eff2f5; }
.ae-action.danger:hover { background: #fdeceb; border-color: #f0b9b5; color: #b3261e; }
.ae-action:disabled { opacity: 0.45; cursor: not-allowed; }
.ae-hint-line { margin-top: 8px; font-size: 0.7rem; color: #8a929c; display: flex; gap: 12px; flex-wrap: wrap; }
</style>