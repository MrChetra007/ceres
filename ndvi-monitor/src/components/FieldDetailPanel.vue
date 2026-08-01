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
      <p class="rain-value mono">{{ rainText }}</p>
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
import { state, fieldStatus, fieldTrends, setInfoChart, getStageAtDate } from '../store'
import * as store from '../store'
import { getOrComputeArea, formatHectares } from '../store'
import { buildChartConfig } from '../services/chart'
import { INDICES, MONTHS } from '../config'

const chartCanvas = ref(null)
let chart = null

const currentField = computed(() => state.fields.find((f) => f.id === state.currentFieldId) || null)
const isField = computed(() => !!currentField.value)
const status = computed(() => fieldStatus[state.currentFieldId] || null)
const trend = computed(() => fieldTrends[state.currentFieldId] || null)

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

const rainText = computed(() => (state.rainfallMm != null ? state.rainfallMm.toFixed(0) + ' mm' : '\u2014'))

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

watch(() => state.chartData, (data) => {
  if (data && state.infoPanelVisible) render(data)
})
watch(() => state.benchmarkValue, () => {
  if (state.chartData && state.infoPanelVisible) render(state.chartData)
})
watch(() => state.mainMonth, () => updateMarker())
</script>
