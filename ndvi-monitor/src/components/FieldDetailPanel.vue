<template>
  <div id="field-detail" class="panel detail-panel" v-show="state.infoPanelVisible">
    <div class="detail-header">
      <div class="detail-heading">
        <p class="detail-title">{{ title }}</p>
        <p class="detail-subtitle mono">{{ state.chartSubtitle }}</p>
      </div>
      <button class="close-btn" @click="onClose">&times;</button>
    </div>

    <template v-if="isField">
      <div class="detail-section hero-card">
        <div class="hero-main">
          <div class="hero-value mono" :class="statusTone">{{ heroValue }}</div>
          <span class="status-badge" :class="statusTone">{{ statusText }}</span>
        </div>
        <div class="hero-sub mono">{{ stageText }}</div>
        <p v-if="showHeroStaleNote" class="hero-stale-note">{{ t('field.last_clear_reading', { date: heroLastClearDate }) }}</p>
        <div class="hero-bench">
          <span class="bench-dot"></span> {{ t('field.aoi_benchmark') }}
          <b class="mono">{{ benchmarkText }}</b>
        </div>
        <ConfidenceBadge v-if="conf && conf.tier" :tier="conf.tier" :reason="conf.reason" showReason class="detail-conf" />
      </div>

      <div v-if="radarMapNote" class="detail-section radar-map-note">
        <p class="radar-map-note-text">{{ t('field.radar_map_note') }}</p>
      </div>

      <!-- Growth stage is planting-date based, not band-derived, so it stays
           identical across the NDVI/NDWI/LSWI tabs (intentional). -->
      <div class="detail-section stage-card">
        <p class="detail-card-label">{{ t('field.growth_stage') }}</p>
        <p class="stage-name">{{ stageName }}</p>
        <div class="stage-bar">
          <span class="stage-fill" :style="{ width: stagePct + '%' }"></span>
        </div>
        <p class="stage-days mono">{{ stageDaysText }}</p>
      </div>

      <!-- Stress Alert is a NDVI-only health signal (no NDWI/LSWI thresholds
           exist yet) — hide the card on non-NDVI tabs instead of showing stale
           NDVI text. -->
      <div v-if="isField && state.currentIndex === 'ndvi'" class="detail-section stress-card" :class="stressTone">
        <p class="detail-card-label">{{ t('field.stress_alert') }}</p>
        <p class="stress-msg">{{ stressMsg }}</p>
      </div>

      <div class="detail-section ai-card">
        <button class="ai-consult-btn" :disabled="consultingAi || noSceneData" @click="consultAi">
          <span v-if="consultingAi" class="ai-spinner"></span>
          <i v-else class="ti ti-sparkles"></i>
          {{ consultingAi ? t('field.consulting_ai') : t('field.consult_ai') }}
        </button>
        <p v-if="noSceneData" class="ai-note no-scene-note">{{ t('field.no_scene_note') }}</p>
        <div v-if="aiExplanation" class="ai-answer">
          <p class="detail-card-label">{{ t('field.ai_agronomist') }}</p>
          <p class="ai-text">{{ aiExplanation }}</p>
          <p class="ai-note">{{ t('field.ai_generated') }}</p>
        </div>
      </div>
    </template>

    <!-- Rainfall-watch stress note is built from the NDVI trend (checkStress only
           ever populates state.stressAlert for the ndvi index) — gate it so it
           never renders NDVI wording on the NDWI/LSWI tabs. -->
    <div v-if="state.stressAlert && state.currentIndex === 'ndvi'" class="detail-section stress-card alert-msg">
      <p class="detail-card-label">{{ t('field.rainfall_watch') }}</p>
      <p class="stress-msg">{{ state.stressAlert }}</p>
    </div>

    <div class="detail-section chart-card">
      <div class="chart-card-header">
        <span class="chart-card-title">{{ title }}</span>
        <button class="icon-btn" :title="t('field.enlarge_chart')" @click="state.chartModalVisible = true"><i class="ti ti-arrows-maximize"></i></button>
      </div>
      <canvas id="trend-chart" ref="chartCanvas"></canvas>
    </div>

    <div class="detail-section rain-card">
      <p class="detail-card-label">{{ t('field.rainfall') }} <span class="mono">({{ t('field.days_21') }})</span></p>
      <p class="rain-value mono" :class="{ 'rain-unavailable': state.rainfallMm == null }">{{ rainText }}</p>
    </div>

    <template v-if="isField">
      <div class="detail-section meta-card">
        <p class="detail-card-label">{{ t('field.metadata') }}</p>
        <div class="meta-row"><span>{{ t('field.planting_date') }}</span><b class="mono">{{ plantingText }}</b></div>
        <div class="meta-row"><span>{{ t('field.area') }}</span><b class="mono">{{ formatHectares(areaHa).toUpperCase() }}</b></div>
        <div class="meta-row"><span>{{ t('field.added') }}</span><b class="mono">{{ addedText }}</b></div>
      </div>

      <div class="detail-section photo-card" v-if="currentField">
        <p class="detail-card-label">{{ t('field.photos') }} <span v-if="photos.length" class="mono">{{ photos.length }}</span></p>
        <div class="photo-strip" v-if="photos.length">
          <button
            v-for="(p, i) in photos"
            :key="p.id"
            class="photo-thumb"
            :class="{ 'inhale': p.loading }"
            @click="openPhoto(i)"
          >
            <img v-if="p.url" :src="p.url" :alt="t('field.photo')" loading="lazy" />
          </button>
        </div>
        <p v-else class="photo-empty">{{ t('field.no_photos') }}</p>
      </div>
    </template>

    <div v-if="state.photosLightboxIndex != null" class="photo-lightbox" @click.self="closePhoto">
      <img :src="photos[state.photosLightboxIndex].url" :alt="t('field.photo')" />
      <button class="lightbox-close" @click="closePhoto">&times;</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import Chart from 'chart.js/auto'
import { state, fieldStatus, fieldTrends, setInfoChart, getStageAtDate, fieldConfidence } from '../store'
import * as store from '../store'
import { getOrComputeArea, formatHectares } from '../store'
import ConfidenceBadge from './ConfidenceBadge.vue'
import { buildChartConfig } from '../services/chart'
import { INDICES, MONTHS, CONSULT_AI_URL } from '../config'
import { sb, requireSession } from '../services/supabase'
import { loadFieldPhotos, createSignedPhotoUrl } from '../services/supabase'
import { getRecentIndexValue, getRainfallMm } from '../services/earthEngine'
import { useI18n } from '../i18n'

const chartCanvas = ref(null)
const consultingAi = ref(false)
const aiExplanation = ref('')
const photos = ref([])
let chart = null

const currentField = computed(() => state.fields.find((f) => f.id === state.currentFieldId) || null)
const isField = computed(() => !!currentField.value)
const { km, t } = useI18n()
const status = computed(() => fieldStatus[state.currentFieldId] || null)
const trend = computed(() => fieldTrends[state.currentFieldId] || null)
const conf = computed(() => {
  if (!currentField.value) return null
  return fieldConfidence(currentField.value)
})
const noSceneData = computed(() => !state.loading && state.sceneCount.main === 0)

// The active observation for the currently-scrubbed month. `state.chartData` is
// the per-scene (cloud-free, same collection the map monthly composite uses)
// series that drives the trend chart — deriving the hero from THIS, rather than
// the one-shot 90-day `fieldStatus` query, is what makes the sidebar follow the
// slider date exactly like the map does.
const selectedMonthWindow = computed(() => {
  const m = MONTHS[state.mainMonth]
  if (!m) return null
  // Compute in UTC so the comparison lines up with chartData's ISO dates
  // (e.g. '2025-11-08' parses as UTC midnight, not local midnight).
  const start = Date.UTC(m.year, m.month - 1, 1)
  const end = Date.UTC(m.year, m.month, 1)
  return { start, end }
})

const activeObservation = computed(() => {
  const data = state.chartData
  if (!Array.isArray(data) || !data.length) return null
  const w = selectedMonthWindow.value
  if (!w) return null
  const within = data.filter((d) => {
    const ts = new Date(d.date).getTime()
    return ts >= w.start && ts < w.end
  })
  if (!within.length) return null
  const sorted = within.slice().sort((a, b) => a.date.localeCompare(b.date))
  const last = sorted[sorted.length - 1]
  return { value: last.value, date: last.date }
})

// Reconstruct a date-only string without the ISO UTC shift that could roll a
// boundary month start to the previous day in UTC.
function monthStartISO(m) {
  const y = m.year
  const mm = String(m.month).padStart(2, '0')
  return y + '-' + mm + '-01'
}

const asOfDate = computed(() => {
  const obs = activeObservation.value
  if (obs && obs.date) return obs.date
  const m = MONTHS[state.mainMonth]
  if (m) return monthStartISO(m)
  return new Date().toISOString().slice(0, 10)
})

// Primary month-scoped status -> falls back to the one-shot latest reading only
// while the trend series is still loading (chartData not yet populated).
const monthStatus = computed(() => {
  const f = currentField.value
  const obs = activeObservation.value
  if (!f || !obs || obs.value == null) return null
  return store.buildStatusObject(f, obs.value, state.currentIndex, asOfDate.value)
})

const heroStatus = computed(() => monthStatus.value || (Array.isArray(state.chartData) && state.chartData.length ? null : status.value))

// ONE shared "is the selected date before planting" check, reused by the Growth
// Stage box, the Stress Alert box AND the hero badge so all three always agree
// on pre-planting state (instead of each independently deciding).
const prePlanting = computed(() => {
  const f = currentField.value
  if (!f || !f.plantingDate) return false
  return new Date(asOfDate.value).getTime() < new Date(f.plantingDate).getTime()
})

const title = computed(() => (isField.value ? currentField.value.name : INDICES[state.chartIndex].name + ' ' + t('index.trend')))
const statusText = computed(() => {
  if (heroStatus.value && heroStatus.value.badgeText === '\u2014') return '\u2014'
  if (prePlanting.value) return t('field.pre_planting')
  return (heroStatus.value && heroStatus.value.badgeText) || '\u2014'
})
const statusTone = computed(() => {
  if (prePlanting.value) return 'tone-blue'
  return (heroStatus.value && heroStatus.value.badgeClass) || 'healthy'
})
const stageText = computed(() => (monthStatus.value && monthStatus.value.stageLabel) || (status.value && status.value.stageLabel) || '')
const benchmarkText = computed(() => (state.benchmarkValue != null ? state.benchmarkValue.toFixed(3) : '\u2014'))
const heroValue = computed(() => {
  const obs = activeObservation.value
  // Same loading rule as heroStatus: fall back to the latest fieldStatus value
  // ONLY while the trend series hasn't loaded yet. Once chartData is present,
  // the hero reflects the scrubbed month — a cloud-blocked month shows '—'
  // together with the "Last clear reading (fixed reference)" note below.
  if (obs && obs.value != null) return obs.value.toFixed(3)
  if (!Array.isArray(state.chartData) || !state.chartData.length) {
    if (status.value && status.value.value != null) return status.value.value.toFixed(3)
  }
  return '\u2014'
})
const radarMapNote = computed(() => !!state.radarFallback.main)
const heroLastClearDate = computed(() => {
  if (status.value && status.value.date) return status.value.date
  const b = state.cloudBlock.main
  return b && b.lastValidDate ? b.lastValidDate : null
})
const showHeroStaleNote = computed(() => {
  const stale = !!state.radarFallback.main || !!state.cloudBlock.main || !!(status.value && status.value.cloudBlocked)
  // Only surface the note when the scrubbed month has no clear reading of its
  // own (cloud-blocked / radar fallback), so "Last clear reading" unambiguously
  // reads as a fixed reference point, never as the hero value.
  return stale && !!heroLastClearDate.value && !monthStatus.value
})

// Growth stage is a property of the crop's age (planting date), NOT of the
// selected band — it intentionally does not change when switching between the
// NDVI/NDWI/LSWI tabs. Computed here directly from the planting date instead of
// from status.stageLabel, because stageLabel only carries the band value (e.g.
// "NDWI 0.72") on the non-NDVI tabs.
// Day count uses the scrubbed month's as-of date, NOT the current calendar date,
// so the stage card tracks the slider like every other date-driven surface.
const growthStageDays = computed(() => {
  const f = currentField.value
  if (!f || !f.plantingDate) return null
  const d = Math.floor((new Date(asOfDate.value).getTime() - new Date(f.plantingDate).getTime()) / 86400000)
  return d
})
const stageName = computed(() => {
  const d = growthStageDays.value
  if (d == null) return t('field.no_planting_date')
  if (prePlanting.value) return t('field.stage_future')
  return store.getGrowthStage(d).stage
})
const stageDaysText = computed(() => {
  const d = growthStageDays.value
  if (d == null || d < 0) return '\u2014'
  return t('field.day_since_planting', { day: d })
})
const stagePct = computed(() => {
  const d = growthStageDays.value
  if (d == null || d < 0) return 0
  return Math.min(100, Math.round((d / 120) * 100))
})

const stressTone = computed(() => {
  if (prePlanting.value) return 'tone-blue'
  const cls = heroStatus.value && heroStatus.value.badgeClass
  return cls === 'stressed' ? 'tone-red' : cls === 'moderate' ? 'tone-amber' : 'tone-green'
})
const stressMsg = computed(() => {
  if (prePlanting.value) {
    const f = currentField.value
    return t('field.no_active_crop', { date: f && f.plantingDate ? f.plantingDate : '\u2014' })
  }
  const cls = heroStatus.value && heroStatus.value.badgeClass
  if (cls === 'stressed') return t('field.stress_high')
  if (cls === 'moderate') return t('field.stress_moderate')
  return t('field.stress_healthy')
})

const rainText = computed(() => {
  if (state.rainfallMm != null) return state.rainfallMm.toFixed(0) + ' mm'
  if (!state.eeReady) return t('field.loading')
  return t('field.data_unavailable')
})

const plantingText = computed(() => {
  const f = currentField.value
  if (!f || !f.plantingDate) return '\u2014'
  if (f.plantingDateSource === 'estimated') return f.plantingDate + ' (' + t('field.estimated_from_sat') + ')'
  return f.plantingDate
})
const addedText = computed(() => (currentField.value && currentField.value.createdAt ? new Date(currentField.value.createdAt).toLocaleDateString() : '\u2014'))
const areaHa = computed(() => (currentField.value ? getOrComputeArea(currentField.value) : 0))

function render(data) {
  const ctx = chartCanvas.value.getContext('2d')
  if (chart) chart.destroy()
  chart = new Chart(ctx, buildChartConfig(ctx, data, state.chartIndex, false, (date) => getStageAtDate(date), state.benchmarkValue))
  setInfoChart(chart)
  updateMarker()
}

function updateMarker() {
  if (!chart) return
  const m = MONTHS[state.mainMonth]
  chart.options.plugins.currentDateMarker = {
    xValue: new Date(m.year, m.month - 1, 1).getTime(),
    label: m.label,
  }
  chart.update('none')
}

function onClose() {
  // Just hide the panel — keep the field selected/drawn so the map's edit
  // control and the field's clip stay active. Deselect happens via the card
  // (click again) or the sidebar delete action instead.
  state.infoPanelVisible = false
}

async function loadPhotos() {
  const field = currentField.value
  if (!field || !state.supabaseUser) { photos.value = []; return }
  try {
    const rows = await loadFieldPhotos(field.id)
    photos.value = rows.map((r) => ({ ...r, url: null, loading: true }))
    rows.forEach(async (r, i) => {
      try {
        const url = await createSignedPhotoUrl(r.storage_path)
        if (photos.value[i]) photos.value[i].url = url
      } catch (e) {
        // leave a dead thumb placeholder rather than breaking the panel
      } finally {
        if (photos.value[i]) photos.value[i].loading = false
      }
    })
  } catch (e) {
    photos.value = []
  }
}

function openPhoto(i) {
  state.photosLightboxIndex = i
}

function closePhoto() {
  state.photosLightboxIndex = null
}

function recentValue(geometry, index) {
  return new Promise((resolve) => {
    getRecentIndexValue(geometry, index, ({ value }) => resolve(value))
  })
}

function getRainfall(geometry) {
  return new Promise((resolve) => {
    getRainfallMm(geometry, 21, (mm) => resolve(mm))
  })
}

async function consultAi() {
  if (consultingAi.value) return
  const field = currentField.value
  if (!field) return
  if (!state.supabaseUser) {
    store.showToast(t('toast.sign_in_consult'))
    return
  }
  if (!state.eeReady) {
    store.showToast(t('toast.ee_loading'))
    return
  }
  if (noSceneData.value) {
    store.showToast(t('toast.no_scene'))
    return
  }
  const geom = field.geojson && (field.geojson.geometry || field.geojson)
  if (!geom || !geom.coordinates) {
    store.showToast(t('toast.cant_explain'))
    return
  }
  const geometry = window.ee.Geometry.Polygon(geom.coordinates)

  consultingAi.value = true
  aiExplanation.value = ''
  let ndviValue = null
  let lswiValue = null
  let rainfallMm = state.rainfallMm
  try {
    const [ndvi, lswi] = await Promise.all([recentValue(geometry, 'ndvi'), recentValue(geometry, 'lswi')])
    ndviValue = ndvi
    lswiValue = lswi
    if (rainfallMm == null) rainfallMm = await getRainfall(geometry)
    if (ndviValue == null) {
      consultingAi.value = false
      store.showToast(t('toast.no_sat_data'))
      return
    }
  } catch (e) {
    consultingAi.value = false
    store.showToast(t('toast.explain_failed'))
    return
  }

  let growthStage = null
  let dayCount = null
  if (field.plantingDate) {
    const days = Math.floor((new Date(asOfDate.value).getTime() - new Date(field.plantingDate).getTime()) / 86400000)
    if (days >= 0) {
      dayCount = days
      growthStage = store.getGrowthStage(days).stage
    }
  }
  const healthStatus = heroStatus.value && heroStatus.value.badgeText ? heroStatus.value.badgeText : ''
  const confidence = conf.value && conf.value.tier ? conf.value : null

  let token
  try {
    const session = await requireSession()
    token = session.access_token
  } catch (e) {
    consultingAi.value = false
    store.showToast(t('toast.sign_in_continue'))
    return
  }

  try {
    const res = await fetch(CONSULT_AI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({
        fieldId: field.id,
        ndviValue,
        lswiValue,
        rainfallMm,
        status: healthStatus,
        growthStage,
        dayCount,
        confidenceTier: confidence ? confidence.tier : null,
        confidenceReason: confidence ? confidence.reason : '',
        lang: state.preferredLanguage,
      }),
    })
    let body = null
    try { body = await res.json() } catch (e) {}
    if (res.status === 429 || (body && body.ok === false && body.error === 'daily_limit_reached')) {
      store.showToast(t('toast.daily_limit'))
      return
    }
    if (body && body.error === 'missing_data') {
      store.showToast(t('toast.no_sat_data'))
      return
    }
    if (body && body.ok && body.explanation) {
      aiExplanation.value = body.explanation
    } else {
      store.showToast(t('toast.explain_failed'))
    }
  } catch (e) {
    store.showToast(t('toast.explain_failed'))
  } finally {
    consultingAi.value = false
  }
}

watch(() => state.chartData, (data) => {
  if (data && state.infoPanelVisible) render(data)
})
watch(() => state.benchmarkValue, () => {
  if (state.chartData && state.infoPanelVisible) render(state.chartData)
})
watch(() => state.mainMonth, () => updateMarker())
watch(() => state.currentFieldId, () => { aiExplanation.value = ''; photos.value = []; state.photosLightboxIndex = null; loadPhotos() })
watch(() => state.infoPanelVisible, (open) => {
  if (open && currentField.value) loadPhotos()
})
</script>