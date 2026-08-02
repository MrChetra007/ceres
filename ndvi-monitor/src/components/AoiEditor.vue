<template>
  <div id="aoi-editor" class="aoi-editor-overlay" v-show="state.aoiEditorVisible" @click.self="close">
    <div class="aoi-editor-modal">
      <h3>New area</h3>
      <p class="aoi-editor-desc">Define a bounding box for satellite analysis. Type coordinates or search for a place.</p>

      <div class="aoi-editor-field">
        <label class="aoi-editor-label" for="ae-name">Name</label>
        <input id="ae-name" type="text" v-model="name" placeholder="e.g. Battambang (default)" />
      </div>

      <div class="aoi-editor-field">
        <label class="aoi-editor-label" for="ae-query">Find a place</label>
        <div class="aoi-search-row">
          <input id="ae-query" type="text" v-model="query" placeholder="Search place name..." @keydown.enter="doSearch" />
          <button class="aoi-search-btn" @click="doSearch">Search</button>
        </div>
        <p v-if="searchInfo" class="aoi-editor-hint">{{ searchInfo }}</p>
      </div>

      <div class="aoi-editor-grid">
        <label>West (lng): <input type="number" step="0.001" v-model.number="w" /></label>
        <label>South (lat): <input type="number" step="0.001" v-model.number="s" /></label>
        <label>East (lng): <input type="number" step="0.001" v-model.number="e" /></label>
        <label>North (lat): <input type="number" step="0.001" v-model.number="n" /></label>
      </div>
      <div class="aoi-editor-hint">The map shows the active area as a red dashed rectangle.</div>

      <div class="aoi-editor-footer">
        <button id="ae-cancel" @click="close">Cancel</button>
        <button class="ae-apply-btn" :disabled="creating" @click="create">{{ creating ? 'Creating...' : 'Create' }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { state } from '../store'
import * as store from '../store'

const name = ref('')
const query = ref('')
const searchInfo = ref('')
const w = ref(0)
const s = ref(0)
const e = ref(0)
const n = ref(0)
const creating = ref(false)

watch(() => state.aoiEditorVisible, (open) => {
  if (open) {
    name.value = ''
    query.value = ''
    searchInfo.value = ''
    w.value = state.aoiCoords[0]
    s.value = state.aoiCoords[1]
    e.value = state.aoiCoords[2]
    n.value = state.aoiCoords[3]
  }
})

function close() {
  state.aoiEditorVisible = false
}

function doSearch() {
  const q = query.value.trim()
  if (!q) return
  searchInfo.value = ''
  fetch('https://nominatim.openstreetmap.org/search?format=json&q=' + encodeURIComponent(q))
    .then((r) => r.json())
    .then((data) => {
      if (!data || data.length === 0) { searchInfo.value = 'Location not found'; return }
      const loc = data[0]
      if (loc.boundingbox && loc.boundingbox.length === 4) {
        w.value = parseFloat(loc.boundingbox[2])
        s.value = parseFloat(loc.boundingbox[0])
        e.value = parseFloat(loc.boundingbox[3])
        n.value = parseFloat(loc.boundingbox[1])
      } else {
        const lat = parseFloat(loc.lat)
        const lon = parseFloat(loc.lon)
        const d = 0.02
        w.value = lon - d
        s.value = lat - d
        e.value = lon + d
        n.value = lat + d
      }
      searchInfo.value = 'Filled bounds from \u201c' + loc.display_name.split(',')[0] + '\u201d'
    })
    .catch(() => { searchInfo.value = 'Search failed \u2014 check your connection' })
}

async function create() {
  if (!name.value.trim()) {
    store.showToast('Give this area a name first')
    return
  }
  if ([w.value, s.value, e.value, n.value].some((v) => isNaN(v))) {
    store.showToast('All four coordinates must be valid numbers')
    return
  }
  creating.value = true
  const aoi = await store.createAoi(name.value.trim(), [w.value, s.value, e.value, n.value])
  creating.value = false
  if (aoi) close()
}
</script>
