<template>
  <div id="chart-modal" class="chart-modal-overlay" v-show="state.chartModalVisible">
    <div class="chart-modal">
      <div class="chart-modal-header">
        <p class="chart-modal-title">{{ title }}</p>
        <button id="chart-modal-close" class="close-btn" @click="state.chartModalVisible = false">&times;</button>
      </div>
      <div class="chart-modal-body">
        <canvas id="trend-chart-large" ref="largeCanvas"></canvas>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import Chart from 'chart.js/auto'
import { state, getStageAtDate } from '../store'
import { buildChartConfig } from '../services/chart'
import { INDICES, MONTHS } from '../config'
import { formatMonthYear } from '../services/format'
import { useI18n } from '../i18n'

const { t } = useI18n()
const largeCanvas = ref(null)
let chart = null

const title = computed(() => INDICES[state.chartIndex].name + ' ' + t('field.trend'))

function render(data) {
  const ctx = largeCanvas.value.getContext('2d')
  if (chart) chart.destroy()
  chart = new Chart(ctx, buildChartConfig(ctx, data, state.chartIndex, true, (date) => getStageAtDate(date)))
  requestAnimationFrame(() => { if (chart) chart.resize() })
  updateMarker()
}

function updateMarker() {
  if (!chart) return
  const m = MONTHS[state.mainMonth]
  chart.options.plugins.currentDateMarker = {
    xValue: new Date(m.year, m.month - 1, 1).getTime(),
    label: formatMonthYear(m.year, m.month, state.preferredLanguage),
  }
  chart.update('none')
}

function onKey(e) {
  if (e.key === 'Escape') state.chartModalVisible = false
}

watch(() => state.chartModalVisible, (open) => {
  if (open && state.chartData) render(state.chartData)
})

watch(() => state.chartData, (data) => {
  if (state.chartModalVisible && data) render(data)
})

watch(() => state.mainMonth, () => updateMarker())

onMounted(() => document.addEventListener('keydown', onKey))
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
</script>
