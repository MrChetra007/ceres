<template>
  <div id="info-panel" class="panel info-panel" v-show="state.infoPanelVisible" :class="{ collapsed }">
    <div class="panel-header">
      <div>
        <p class="panel-title" id="panel-title">{{ title }}</p>
        <p class="panel-subtitle" id="chart-subtitle">{{ state.chartSubtitle }}</p>
      </div>
      <div class="panel-header-actions">
        <button id="collapse-panel" class="icon-btn" :title="collapsed ? 'Expand panel' : 'Collapse panel'" @click="toggleCollapse">
          <i class="ti" :class="collapsed ? 'ti-chevrons-left' : 'ti-chevrons-right'"></i>
        </button>
        <button id="close-panel" class="close-btn" @click="state.infoPanelVisible = false">&times;</button>
      </div>
    </div>
    <div id="stress-alert" class="stress-alert" v-if="state.stressAlert">{{ state.stressAlert }}</div>
    <div id="chart-explanation" class="chart-explanation">{{ explanation }}</div>
    <div class="chart-card">
      <div class="chart-card-header">
        <span class="chart-card-title">{{ title }}</span>
        <button id="expand-chart" class="icon-btn" title="Enlarge chart" @click="state.chartModalVisible = true"><i class="ti ti-arrows-maximize"></i></button>
      </div>
      <canvas id="trend-chart" ref="chartCanvas"></canvas>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import Chart from 'chart.js/auto'
import { state, setInfoChart, getStageAtDate } from '../store'
import { buildChartConfig } from '../services/chart'
import { INDICES, MONTHS } from '../config'

const chartCanvas = ref(null)
const collapsed = ref(false)
let chart = null

const title = computed(() => INDICES[state.chartIndex].name + ' Trend')
const explanation = computed(() => INDICES[state.currentIndex].name + ' values \u2014 ' + INDICES[state.currentIndex].explain)

function render(data) {
  const ctx = chartCanvas.value.getContext('2d')
  if (chart) chart.destroy()
  chart = new Chart(ctx, buildChartConfig(ctx, data, state.chartIndex, false, (date) => getStageAtDate(date)))
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

function toggleCollapse() {
  collapsed.value = !collapsed.value
  if (!collapsed.value && chart) chart.resize()
}

watch(() => state.chartData, (data) => {
  if (data && state.infoPanelVisible) render(data)
})

watch(() => state.mainMonth, () => updateMarker())

watch(collapsed, (c) => {
  if (!c && chart) chart.resize()
})
</script>
