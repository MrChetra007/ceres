<template>
  <div id="aoi-editor" class="aoi-editor-overlay" v-show="state.aoiEditorVisible" @click.self="close">
    <div class="aoi-editor-modal">
      <h3>{{ t('aoi.new_area') }}</h3>
      <p class="aoi-editor-desc">{{ t('aoi.desc') }}</p>

      <div class="aoi-editor-field">
        <label class="aoi-editor-label" for="ae-name">{{ t('aoi.name') }}</label>
        <input id="ae-name" type="text" v-model="name" :placeholder="t('aoi.name_example')" />
      </div>

      <div class="aoi-editor-tabs">
        <button
          class="aoi-editor-tab"
          :class="{ active: mode === 'place' }"
          @click="mode = 'place'"
        >{{ t('aoi.tab_place') }}</button>
        <button
          class="aoi-editor-tab"
          :class="{ active: mode === 'manual' }"
          @click="mode = 'manual'"
        >{{ t('aoi.tab_manual') }}</button>
        <button
          v-if="state.fields.length > 0"
          class="aoi-editor-tab"
          :class="{ active: mode === 'field' }"
          @click="mode = 'field'"
        >{{ t('aoi.tab_field') }}</button>
      </div>

      <div v-if="mode === 'place'" class="aoi-editor-field">
        <label class="aoi-editor-label" for="ae-query">{{ t('aoi.find_place') }}</label>
        <div class="aoi-search-row">
          <input id="ae-query" type="text" v-model="query" :placeholder="t('aoi.search_place')" @keydown.enter="doSearch" />
          <button class="aoi-search-btn" @click="doSearch">{{ t('common.search') }}</button>
        </div>
      </div>

      <div v-else-if="mode === 'field'" class="aoi-editor-field">
        <label class="aoi-editor-label">{{ t('aoi.pick_field') }}</label>
        <div class="aoi-field-list">
          <div
            v-for="f in state.fields"
            :key="f.id"
            class="aoi-field-item"
            :class="{ active: selectedFieldId === f.id }"
            @click="pickField(f)"
          >
            <span class="aoi-field-name">{{ f.name }}</span>
            <span class="aoi-field-area">{{ fieldArea(f) }}</span>
          </div>
        </div>
      </div>

      <p v-if="searchInfo" class="aoi-editor-hint">{{ searchInfo }}</p>

      <div class="aoi-editor-grid">
        <label>{{ t('aoi.west') }}: <input type="number" step="0.001" v-model.number="w" /></label>
        <label>{{ t('aoi.south') }}: <input type="number" step="0.001" v-model.number="s" /></label>
        <label>{{ t('aoi.east') }}: <input type="number" step="0.001" v-model.number="e" /></label>
        <label>{{ t('aoi.north') }}: <input type="number" step="0.001" v-model.number="n" /></label>
      </div>
      <div class="aoi-editor-hint">{{ t('aoi.hint_rect') }}</div>

      <div class="aoi-editor-footer">
        <button id="ae-cancel" @click="close">{{ t('common.cancel') }}</button>
        <button class="ae-apply-btn" :disabled="creating" @click="create">{{ creating ? t('aoi.creating') : t('aoi.create') }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { bbox as turfBBox } from '@turf/turf'
import { state } from '../store'
import * as store from '../store'
import { useI18n } from '../i18n'

const { t } = useI18n()
const name = ref('')
const query = ref('')
const searchInfo = ref('')
const w = ref(0)
const s = ref(0)
const e = ref(0)
const n = ref(0)
const creating = ref(false)
const mode = ref('place')
const selectedFieldId = ref(null)

watch(() => state.aoiEditorVisible, (open) => {
  if (open) {
    name.value = ''
    query.value = ''
    searchInfo.value = ''
    mode.value = 'place'
    selectedFieldId.value = null
    w.value = state.aoiCoords[0]
    s.value = state.aoiCoords[1]
    e.value = state.aoiCoords[2]
    n.value = state.aoiCoords[3]
  }
})

function fieldArea(f) {
  return store.formatHectares(store.getOrComputeArea(f))
}

function pickField(f) {
  if (!f) return
  selectedFieldId.value = f.id
  const geom = f.geojson && (f.geojson.geometry || f.geojson)
  if (!geom || !geom.coordinates) {
    searchInfo.value = t('aoi.no_fields_left')
    return
  }
  const b = turfBBox(geom)
  w.value = b[0]
  s.value = b[1]
  e.value = b[2]
  n.value = b[3]
  searchInfo.value = t('aoi.filled_field', { name: f.name })
}

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
      if (!data || data.length === 0) { searchInfo.value = t('aoi.not_found'); return }
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
      searchInfo.value = t('aoi.filled_place', { name: loc.display_name.split(',')[0] })
    })
    .catch(() => { searchInfo.value = t('aoi.search_failed') })
}

async function create() {
  if (!name.value.trim()) {
    store.showToast(t('toast.area_name_first'))
    return
  }
  if ([w.value, s.value, e.value, n.value].some((v) => isNaN(v))) {
    store.showToast(t('toast.valid_coords'))
    return
  }
  creating.value = true
  const aoi = await store.createAoi(name.value.trim(), [w.value, s.value, e.value, n.value])
  creating.value = false
  if (aoi) close()
}
</script>