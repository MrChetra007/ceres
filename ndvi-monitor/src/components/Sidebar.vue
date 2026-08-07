<template>
  <div id="sidebar" class="sidebar" v-show="open">
    <div class="sidebar-header">
      <div>
        <h3>{{ t('sidebar.monitored_fields') }}</h3>
        <span class="sidebar-count mono">{{ state.fields.length }} {{ t('sidebar.parcels') }} · {{ totalHa }} ha</span>
      </div>
      <button class="close-btn" @click="open = false">&times;</button>
    </div>

    <div class="sidebar-search">
      <i class="ti ti-search"></i>
      <input type="text" v-model="query" :placeholder="t('sidebar.search')" />
    </div>

    <div class="filter-tabs">
      <button
        v-for="t in tabsLabeled"
        :key="t.key"
        class="filter-tab"
        :class="{ active: filter === t.key }"
        @click="filter = t.key"
      >{{ t.label }}</button>
    </div>

    <div id="field-list" class="sidebar-list">
      <div
        v-for="f in filtered"
        :key="f.id"
        class="field-card"
        :class="{ active: f.id === state.currentFieldId }"
        :data-id="f.id"
        @click="onCardClick(f)"
      >
        <div class="field-card-header">
          <div>
            <p class="field-card-name">{{ f.name }}</p>
            <p class="field-card-meta mono">{{ formatHectares(getOrComputeArea(f)).toUpperCase() }} · {{ stageLine(f) }}</p>
          </div>
          <div class="field-card-badges">
            <span class="status-badge" :class="badgeClass(f)">{{ status(f) ? status(f).badgeText : '\u2014' }}</span>
            <ConfidenceBadge v-if="conf(f)" :tier="conf(f).tier" :reason="conf(f).reason" class="card-conf" />
          </div>
        </div>

        <div class="field-card-row">
          <svg class="field-sparkline" :class="sparkClass(f)" viewBox="0 0 100 28" preserveAspectRatio="none">
            <polyline v-if="sparkPoints(f)" :points="sparkPoints(f)" fill="none" stroke-linejoin="round" stroke-linecap="round" />
            <line v-else x1="0" y1="14" x2="100" y2="14" stroke-dasharray="3 3" />
          </svg>
          <div class="field-card-stats">
            <span class="mono">{{ valueLine(f) }}</span>
            <button class="plant-date-btn" :title="t('sidebar.set_planting_date')" @click.stop="setPlantingDate(f)"><i class="ti ti-edit"></i></button>
          </div>
        </div>

        <div v-if="areaWarning(f)" class="field-area-warning">{{ areaWarning(f) }}</div>
        <button class="delete-btn" @click.stop="store.deleteField(f.id)" :title="t('sidebar.delete_field')">&#10005;</button>
      </div>

      <p v-if="state.fields.length === 0" class="sidebar-hint">{{ t('sidebar.no_fields') }}</p>
      <p v-else-if="filtered.length === 0" class="sidebar-hint">{{ t('sidebar.no_match') }}</p>
    </div>

    <div class="sidebar-footer">
      <button class="draw-btn" :class="{ drawing: state.isDrawing }" @click="store.startDraw()">
        <i class="ti ti-plus"></i>
        <template v-if="state.isDrawing">{{ t('sidebar.cancel_draw') }}</template>
        <template v-else>{{ t('sidebar.add_field') }}</template>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { state, fieldStatus, fieldTrends } from '../store'
import * as store from '../store'
import { getOrComputeArea, formatHectares, getAreaWarning, fieldConfidence } from '../store'
import ConfidenceBadge from './ConfidenceBadge.vue'
import { useI18n } from '../i18n'

const { t } = useI18n()
const open = ref(false)
const query = ref('')
const filter = ref('all')

const tabs = [
  { key: 'all', label: 'All' },
  { key: 'healthy', label: 'Healthy' },
  { key: 'alerts', label: 'Alerts' },
]
const tAbs = (en, kh) => (state.preferredLanguage === 'km' ? kh : en)
const tabsLabeled = computed(() => tabs.map((x) => ({
  key: x.key,
  label: tAbs(x.label, { all: 'ទាំងអស់', healthy: 'ល្អ', alerts: 'ព្រមាន' }[x.key]),
})))

const totalHa = computed(() => {
  let ha = 0
  state.fields.forEach((f) => { ha += getOrComputeArea(f) })
  return ha.toFixed(1)
})

const filtered = computed(() => {
  let list = state.fields
  if (query.value.trim()) {
    const q = query.value.trim().toLowerCase()
    list = list.filter((f) => f.name.toLowerCase().includes(q))
  }
  if (filter.value === 'healthy') {
    list = list.filter((f) => { const s = status(f); return s && s.badgeClass === 'healthy' })
  } else if (filter.value === 'alerts') {
    list = list.filter((f) => { const s = status(f); return s && s.badgeClass !== 'healthy' && s.badgeClass !== '' })
  }
  return list
})

function status(f) {
  return fieldStatus[f.id] || null
}

function conf(f) {
  const c = fieldConfidence(f)
  return c && c.tier ? c : null
}

function badgeClass(f) {
  const s = status(f)
  return s && s.badgeClass ? 'status-' + s.badgeClass : ''
}

function stageLine(f) {
  const s = status(f)
  if (!s) return 'Loading\u2026'
  if (s.stageLabel) return s.stageLabel
  return s.value != null ? 'NDVI ' + s.value.toFixed(2) : '\u2014'
}

function valueLine(f) {
  const s = status(f)
  return s && s.value != null ? 'NDVI ' + s.value.toFixed(2) : '\u2014'
}

function sparkPoints(f) {
  const data = fieldTrends[f.id]
  if (!data || data.length < 2) return null
  const values = data.filter((d) => d.value != null)
  if (values.length < 2) return null
  let min = Infinity, max = -Infinity
  values.forEach((d) => { if (d.value < min) min = d.value; if (d.value > max) max = d.value })
  const range = (max - min) || 0.1
  return values.map((d, i) => {
    const x = (i / (values.length - 1)) * 100
    const y = 25 - ((d.value - min) / range) * 22
    return x.toFixed(1) + ',' + y.toFixed(1)
  }).join(' ')
}

function sparkClass(f) {
  const s = status(f)
  return s && s.badgeClass ? 'spark-' + s.badgeClass : 'spark-healthy'
}

function areaWarning(f) {
  return getAreaWarning(getOrComputeArea(f), state.preferredLanguage)
}

function onCardClick(f) {
  if (f.id === state.currentFieldId) {
    store.clearFieldSelection()
    return
  }
  store.loadFieldById(f.id)
}

function setPlantingDate(f) {
store.promptDate(f.plantingDate, (newDate) => {
      if (newDate === undefined) return
      // A manual overwrite supersedes any satellite-estimated date.
      store.updateField(f.id, { planting_date: newDate, planting_date_source: 'manual' })
    })
}

defineExpose({ open })
</script>
