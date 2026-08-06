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
        <div class="hero-bench">
          <span class="bench-dot"></span> AOI benchmark
          <b class="mono">{{ benchmarkText }}</b>
        </div>
        <ConfidenceBadge v-if="conf && conf.tier" :tier="conf.tier" :reason="conf.reason" showReason class="detail-conf" />
      </div>

      <div class="detail-section stage-card">
        <p class="detail-card-label">Growth stage</p>
        <p class="stage-name">{{ stageName }}</p>
        <div class="stage-bar">
          <span class="stage-fill" :style="{ width: stagePct + '%' }"></span>
        </div>
        <p class="stage-days mono">{{ stageDaysText }}</p>
      </div>

      <div class="detail-section stress-card" :class="stressTone">
        <p class="detail-card-label">Stress alert</p>
        <p class="stress-msg">{{ stressMsg }}</p>
      </div>

      <div class="detail-section ai-card">
        <button class="ai-consult-btn" :disabled="consultingAi || noSceneData" @click="consultAi">
          <span v-if="consultingAi" class="ai-spinner"></span>
          <i v-else class="ti ti-sparkles"></i>
          {{ consultingAi ? 'Consulting AI...' : 'Consult AI' }}
        </button>
        <p v-if="noSceneData" class="ai-note no-scene-note">No satellite data for this month — try a recent month with data.</p>
        <div v-if="aiExplanation" class="ai-answer">
          <p class="detail-card-label">AI agronomist</p>
          <p class="ai-text">{{ aiExplanation }}</p>
          <p class="ai-note">AI-generated interpretation to guide you — not a diagnosis.</p>
        </div>
      </div>
    </template>

    <div v-if="state.stressAlert" class="detail-section stress-card alert-msg">
      <p class="detail-card-label">Rainfall watch</p>
      <p class="stress-msg">{{ state.stressAlert }}</p>
    </div>

    <div class="detail-section chart-card">
      <div class="chart-card-header">
        <span class="chart-card-title">{{ title }}</span>
        <button class="icon-btn" title="Enlarge chart" @click="state.chartModalVisible = true"><i class="ti ti-arrows-maximize"></i></button>
      </div>
      <canvas id="trend-chart" ref="chartCanvas"></canvas>
    </div>

    <div class="detail-section rain-card">
      <p class="detail-card-label">Rainfall <span class="mono">(21-day)</span></p>
      <p class="rain-value mono" :class="{ 'rain-unavailable': state.rainfallMm == null }">{{ rainText }}</p>
    </div>

    <template v-if="isField">
      <div class="detail-section meta-card">
        <p class="detail-card-label">Field metadata</p>
        <div class="meta-row"><span>Planting date</span><b class="mono">{{ plantingText }}</b></div>
        <div class="meta-row"><span>Area</span><b class="mono">{{ formatHectares(areaHa).toUpperCase() }}</b></div>
        <div class="meta-row"><span>Added</span><b class="mono">{{ addedText }}</b></div>
      </div>
    </template>
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
import { INDICES, MONTHS, CONSULT_AI_URL, CONSULT_AI_LANG } from '../config'
import { sb, requireSession } from '../services/supabase'
import { getRecentIndexValue, getRainfallMm } from '../services/earthEngine'

const chartCanvas = ref(null)
const consultingAi = ref(false)
const aiExplanation = ref('')
let chart = null

const currentField = computed(() => state.fields.find((f) => f.id === state.currentFieldId) || null)
const isField = computed(() => !!currentField.value)
const status = computed(() => fieldStatus[state.currentFieldId] || null)
const trend = computed(() => fieldTrends[state.currentFieldId] || null)
const conf = computed(() => {
  if (!currentField.value) return null
  return fieldConfidence(currentField.value)
})
// Mirrors the time slider's "no scenes" badge: no scenes for the selected month
// AND no request currently in flight (so it's permanently unavailable, not loading).
const noSceneData = computed(() => !state.loading && state.sceneCount.main === 0)

const title = computed(() => (isField.value ? currentField.value.name : INDICES[state.chartIndex].name + ' Trend'))
const statusText = computed(() => (status.value && status.value.badgeText) || '\u2014')
const statusTone = computed(() => (status.value && status.value.badgeClass) || 'healthy')
const stageText = computed(() => (status.value && status.value.stageLabel) || '')
const benchmarkText = computed(() => (state.benchmarkValue != null ? state.benchmarkValue.toFixed(3) : '\u2014'))
const heroValue = computed(() => (status.value && status.value.value != null ? status.value.value.toFixed(3) : '\u2014'))

const stageName = computed(() => {
  const s = status.value
  if (!s || !s.stageLabel) return 'No planting date'
  return s.stageLabel.split('\u00b7')[0].trim()
})
const stageDaysText = computed(() => {
  const s = status.value
  if (!s || !s.stageLabel) return '\u2014'
  const m = s.stageLabel.match(/Day (\d+)/)
  return m ? 'Day ' + m[1] + ' since planting' : '\u2014'
})
const stagePct = computed(() => {
  const s = status.value
  if (!s || !s.stageLabel) return 0
  const m = s.stageLabel.match(/Day (\d+)/)
  const days = m ? parseInt(m[1], 10) : 0
  return Math.min(100, Math.round((days / 120) * 100))
})

const stressTone = computed(() => {
  const cls = status.value && status.value.badgeClass
  return cls === 'stressed' ? 'tone-red' : cls === 'moderate' ? 'tone-amber' : 'tone-green'
})
const stressMsg = computed(() => {
  const cls = status.value && status.value.badgeClass
  if (cls === 'stressed') return 'Below expected range for this growth stage \u2014 consider checking irrigation.'
  if (cls === 'moderate') return 'Slightly below expected for this stage \u2014 monitor over the coming weeks.'
  return 'Within the expected NDVI range for this growth stage.'
})

const rainText = computed(() => {
  if (state.rainfallMm != null) return state.rainfallMm.toFixed(0) + ' mm'
  if (!state.eeReady) return 'Loading\u2026'
  return 'Data unavailable'
})

const plantingText = computed(() => (currentField.value && currentField.value.plantingDate) || '\u2014')
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
  if (isField.value) store.clearFieldSelection()
  else state.infoPanelVisible = false
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
    store.showToast('Sign in to consult the AI agronomist')
    return
  }
  if (!state.eeReady) {
    store.showToast('Satellite data is still loading \u2014 try again in a moment')
    return
  }
  if (noSceneData.value) {
    store.showToast('No satellite data for this month \u2014 try a recent month with data.')
    return
  }
  const geom = field.geojson && (field.geojson.geometry || field.geojson)
  if (!geom || !geom.coordinates) {
    store.showToast('Couldn\'t get an explanation right now \u2014 please try again.')
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
      store.showToast('No recent satellite data for this field yet \u2014 check back in a few days.')
      return
    }
  } catch (e) {
    consultingAi.value = false
    store.showToast('Couldn\'t get an explanation right now \u2014 please try again.')
    return
  }

  let growthStage = null
  let dayCount = null
  if (field.plantingDate) {
    const days = Math.floor((Date.now() - new Date(field.plantingDate).getTime()) / 86400000)
    if (days >= 0) {
      dayCount = days
      growthStage = store.getGrowthStage(days).stage
    }
  }
  const healthStatus = status.value ? status.value.badgeText : ''
  const confidence = conf.value && conf.value.tier ? conf.value : null

  let token
  try {
    const session = await requireSession()
    token = session.access_token
  } catch (e) {
    consultingAi.value = false
    store.showToast(e.message || 'Please sign in to continue')
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
        lang: CONSULT_AI_LANG,
      }),
    })
    let body = null
    try { body = await res.json() } catch (e) {}
    if (res.status === 429 || (body && body.ok === false && body.error === 'daily_limit_reached')) {
      store.showToast('You\'ve used today\'s AI explanations \u2014 more tomorrow.')
      return
    }
    if (body && body.error === 'missing_data') {
      store.showToast('No recent satellite data for this field yet \u2014 check back in a few days.')
      return
    }
    if (body && body.ok && body.explanation) {
      aiExplanation.value = body.explanation
    } else {
      store.showToast('Couldn\'t get an explanation right now \u2014 please try again.')
    }
  } catch (e) {
    store.showToast('Couldn\'t get an explanation right now \u2014 please try again.')
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
watch(() => state.currentFieldId, () => { aiExplanation.value = '' })
</script>
