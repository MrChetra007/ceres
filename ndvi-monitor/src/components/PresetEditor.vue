<template>
  <div id="preset-editor" class="preset-editor-overlay" v-show="state.presetEditorVisible" @click.self="state.presetEditorVisible = false">
    <div class="preset-editor-modal">
      <h3>{{ t('preset.manage') }}</h3>
      <div id="preset-editor-list">
        <div v-for="(p, i) in draft" :key="i" class="preset-editor-row">
          <input class="pe-name" v-model="p.label" :placeholder="t('preset.label')" />
          <input class="pe-lat" type="number" step="0.0001" v-model.number="p.lat" placeholder="Lat" />
          <input class="pe-lng" type="number" step="0.0001" v-model.number="p.lng" placeholder="Lng" />
          <input class="pe-zoom" type="number" min="1" max="19" v-model.number="p.zoom" placeholder="Zoom" />
          <button class="pe-delete" @click="draft.splice(i, 1)"><i class="ti ti-trash"></i></button>
        </div>
      </div>
      <div class="preset-editor-actions">
        <button @click="addCurrent"><i class="ti ti-plus"></i> {{ t('preset.add_current') }}</button>
        <button @click="resetDefaults"><i class="ti ti-refresh"></i> {{ t('preset.reset') }}</button>
      </div>
      <div class="preset-editor-footer">
        <button id="pe-cancel" @click="state.presetEditorVisible = false">{{ t('common.cancel') }}</button>
        <button class="pe-save-btn" @click="save">{{ t('common.save') }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { state, mapReg } from '../store'
import * as store from '../store'
import { useI18n } from '../i18n'

const { t } = useI18n()
const draft = ref([])

function clone() {
  return state.presets.map((p) => ({ ...p }))
}

watch(() => state.presetEditorVisible, (open) => {
  if (open) draft.value = clone()
})

function addCurrent() {
  const c = mapReg.map.getCenter()
  draft.value.push({ label: t('preset.new_location'), lat: c.lat, lng: c.lng, zoom: mapReg.map.getZoom() })
}

function resetDefaults() {
  store.resetPresets()
  draft.value = clone()
}

function save() {
  store.savePresetList(draft.value.map((p) => ({
    label: p.label,
    lat: parseFloat(p.lat) || 0,
    lng: parseFloat(p.lng) || 0,
    zoom: parseInt(p.zoom) || 14,
  })))
  state.presetEditorVisible = false
}
</script>
