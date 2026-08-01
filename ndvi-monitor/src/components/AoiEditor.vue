<template>
  <div id="aoi-editor" class="aoi-editor-overlay" v-show="state.aoiEditorVisible" @click.self="state.aoiEditorVisible = false">
    <div class="aoi-editor-modal">
      <h3>Area of Interest (AOI)</h3>
      <p class="aoi-editor-desc">Bounding box coordinates (west, south, east, north) used for Earth Engine queries.</p>
      <div class="aoi-editor-grid">
        <label>West (lng): <input type="number" step="0.001" v-model.number="w" /></label>
        <label>South (lat): <input type="number" step="0.001" v-model.number="s" /></label>
        <label>East (lng): <input type="number" step="0.001" v-model.number="e" /></label>
        <label>North (lat): <input type="number" step="0.001" v-model.number="n" /></label>
      </div>
      <div class="aoi-editor-hint">The map shows a red dashed rectangle for the current AOI.</div>
      <div class="aoi-editor-actions">
        <button @click="reset"><i class="ti ti-refresh"></i> Reset defaults</button>
      </div>
      <div class="aoi-editor-footer">
        <button id="ae-cancel" @click="state.aoiEditorVisible = false">Cancel</button>
        <button class="ae-apply-btn" @click="apply">Apply</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { state } from '../store'
import * as store from '../store'

const w = ref(0)
const s = ref(0)
const e = ref(0)
const n = ref(0)

watch(() => state.aoiEditorVisible, (open) => {
  if (open) {
    w.value = state.aoiCoords[0]
    s.value = state.aoiCoords[1]
    e.value = state.aoiCoords[2]
    n.value = state.aoiCoords[3]
  }
})

function apply() {
  if ([w.value, s.value, e.value, n.value].some((v) => isNaN(v))) {
    store.showToast('All four coordinates must be valid numbers')
    return
  }
  store.applyAoi([w.value, s.value, e.value, n.value])
  state.aoiEditorVisible = false
}

function reset() {
  store.resetAoi()
  state.aoiEditorVisible = false
}
</script>
