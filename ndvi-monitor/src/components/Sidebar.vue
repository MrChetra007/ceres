<template>
  <div class="drawer-account">
    <i class="ti ti-user"></i>
    <span>{{ userLabel }}</span>
  </div>

  <div class="sidebar-settings-list">
    <button
      class="drawer-item"
      :class="{ on: state.compareMode }"
      :title="t('topbar.compare_title')"
      @click="toggleCompare"
    >
      <i class="ti ti-columns-3"></i><span>{{ t('topbar.compare') }}</span>
      <i class="ti ti-check drawer-check" v-if="state.compareMode"></i>
    </button>

    <div class="drawer-item lang-toggle">
      <i class="ti ti-map"></i>
      <span>{{ t('band.base_layer') }}</span>
      <div class="lang-seg">
        <button :class="{ on: state.currentBase === 'street' }" @click="store.setBaseLayer('street')">{{ t('topbar.street') }}</button>
        <button :class="{ on: state.currentBase === 'satellite' }" @click="store.setBaseLayer('satellite')">{{ t('topbar.satellite') }}</button>
      </div>
    </div>

    <button class="drawer-item" :title="t('topbar.export_png')" @click="doExport('png')">
      <i class="ti ti-photo"></i><span>{{ t('topbar.export_png') }}</span>
    </button>
    <button class="drawer-item" :title="t('topbar.export_pdf')" @click="doExport('pdf')">
      <i class="ti ti-file-text"></i><span>{{ t('topbar.export_pdf') }}</span>
    </button>

    <button
      class="drawer-item"
      :class="{ on: state.telegramChatId }"
      :title="t('common.telegram_alerts')"
      @click="openTelegram"
    >
      <i class="ti ti-brand-telegram"></i><span>{{ t('common.telegram_alerts') }}</span>
      <span class="tg-status-dot" :class="{ on: state.telegramChatId }"></span>
    </button>

    <button class="drawer-item" :title="t('topbar.how_this_works')" @click="openHelp">
      <i class="ti ti-help"></i><span>{{ t('topbar.help') }}</span>
    </button>

    <div class="drawer-item lang-toggle">
      <i class="ti ti-language"></i>
      <span>{{ t('common.language') }}</span>
      <div class="lang-seg">
        <button :class="{ on: state.preferredLanguage === 'en' }" @click="setLang('en')">EN</button>
        <button :class="{ on: state.preferredLanguage === 'km' }" @click="setLang('km')">ខ្មែរ</button>
      </div>
    </div>

    <button v-if="state.supabaseUser" class="drawer-item sign-out" @click="store.signOut()">
      <i class="ti ti-logout"></i><span>{{ t('common.sign_out') }}</span>
    </button>
    <button v-else class="drawer-item" @click="store.showAuthOverlay()">
      <i class="ti ti-login"></i><span>{{ t('topbar.sign_in') }}</span>
    </button>
  </div>

  <div class="sidebar-fields">
    <div class="sidebar-header">
      <div>
        <h3>{{ t('sidebar.monitored_fields') }}</h3>
        <span class="sidebar-count mono">{{ state.fields.length }} {{ t('sidebar.parcels') }} · {{ totalHaText }}</span>
      </div>
    </div>

    <div class="sidebar-search">
      <i class="ti ti-search"></i>
      <input type="text" v-model="query" :placeholder="t('sidebar.search')" />
    </div>

    <div class="filter-tabs">
      <button
        v-for="t2 in tabsLabeled"
        :key="t2.key"
        class="filter-tab"
        :class="{ active: filter === t2.key }"
        @click="filter = t2.key"
      >{{ t2.label }}</button>
    </div>

    <button
      v-if="state.fields.length > 0 && !state.currentFieldId"
      class="ai-hint"
      :title="t('field.ai_agronomist')"
      @click="openFirstField"
    >
      <i class="ti ti-sparkles"></i>
      <span>{{ t('sidebar.ai_hint') }}</span>
    </button>

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
            <button class="plant-date-btn" :title="t('sidebar.set_planting_date')" @click.stop="setPlantingDate(f)"><i class="ti ti-calendar-plus"></i></button>
            <button class="plant-date-btn" :title="t('sidebar.edit_field')" @click.stop="store.startFieldEdit(f)"><i class="ti ti-pencil"></i></button>
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
import { toKhmerDigits } from '../services/format'

const { t } = useI18n()
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

const userLabel = computed(() =>
  state.supabaseUser ? (state.supabaseUser.email || t('topbar.signed_in')) : t('topbar.sign_in')
)

const totalHa = computed(() => {
  let ha = 0
  state.fields.forEach((f) => { ha += getOrComputeArea(f) })
  return ha.toFixed(1)
})

const totalHaText = computed(() => {
  if (state.preferredLanguage === 'km') return toKhmerDigits(totalHa.value) + ' ហិកតា'
  return totalHa.value + ' ha'
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

function openFirstField() {
  if (state.fields.length > 0 && !state.currentFieldId) {
    store.loadFieldById(state.fields[0].id)
  }
}

function setPlantingDate(f) {
  store.promptDate(f.plantingDate, (newDate) => {
    if (newDate === undefined) return
    // A manual overwrite supersedes any satellite-estimated date.
    store.updateField(f.id, { planting_date: newDate, planting_date_source: 'manual' })
  })
}

// --- Drawer actions (reused from the desktop header) ---
function toggleCompare() {
  state.compareMode = !state.compareMode
}

function doExport(fmt) {
  if (fmt === 'png') store.exportChart()
  else store.exportPdf()
}

function openTelegram() {
  if (!state.supabaseUser) {
    store.showAuthOverlay()
    return
  }
  store.openTelegramModal()
}

function openHelp() {
  state.helpVisible = true
}

function setLang(lang) {
  store.setLanguage(lang)
}
</script>