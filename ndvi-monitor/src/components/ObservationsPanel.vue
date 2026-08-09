<template>
  <div class="obs-panel panel" v-show="state.observationsVisible">
    <div class="obs-header">
      <span class="obs-title">
        <i class="ti ti-satellite"></i>
        {{ t('obs.title') }}
      </span>
      <span v-if="state.observationsLoading" class="obs-loading">{{ t('common.loading') }}</span>
      <button class="close-btn" :title="t('common.close')" @click="state.observationsVisible = false">&times;</button>
    </div>

    <div class="obs-list-header">
      <span>{{ t('obs.date_cap') }}</span>
      <span>{{ t('obs.source_cap') }}</span>
      <span>{{ t('obs.cloud_cap') }}</span>
      <span>{{ t('obs.status_cap') }}</span>
      <span>{{ t('obs.ndvi_cap') }}</span>
    </div>

    <p v-if="!state.currentFieldId" class="obs-empty">{{ t('obs.no_field') }}</p>
    <p v-else-if="!state.observationsLoading && state.observations.length === 0" class="obs-empty">
      {{ t('obs.no_observations') }}
    </p>

    <div v-else class="obs-list">
      <button
        v-for="o in state.observations"
        :key="o.date"
        class="obs-row"
        :class="{ active: rowActive(o.date) }"
        :title="t('obs.jump_tip', { date: fmtDate(o.date) })"
        @click="jump(o.date)"
      >
        <span class="obs-date mono">{{ fmtDate(o.date) }}</span>
        <span class="obs-source">{{ o.source }}</span>
        <span class="obs-cloud mono">{{ cloudText(o) }}</span>
        <span class="obs-badge" :class="'obs-' + o.status">{{ statusLabel(o) }}</span>
        <span class="obs-ndvi mono">{{ ndviText(o) }}</span>
      </button>
    </div>

    <!-- Sentinel-1 radar passes are intentionally stubbed for a later pass:
         rows would append here with source 'Sentinel-1 (RVI)' and no cloud %. -->
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { state } from '../store'
import * as store from '../store'
import { MONTHS } from '../config'
import { useI18n } from '../i18n'

const { t } = useI18n()

const currentMonth = computed(() => MONTHS[state.mainMonth] || null)

// The slider is month-granular; a row is "active" when its date falls in the
// month currently loaded in the main map (mirrors row ✓ for the slider pos).
function rowActive(date) {
  const m = currentMonth.value
  if (!m) return false
  const d = new Date(date)
  return d.getFullYear() === m.year && d.getMonth() + 1 === m.month
}

function cloudText(o) {
  if (o.cloudCover == null) return '\u2014'
  return Math.round(o.cloudCover) + '%'
}

function statusLabel(o) {
  if (o.status === 'blocked') return t('obs.blocked')
  if (o.status === 'low') return t('obs.low')
  return t('obs.clear')
}

function ndviText(o) {
  if (o.status === 'blocked' || o.ndvi == null) return '\u2014'
  return Number(o.ndvi).toFixed(3)
}

function fmtDate(dateStr) {
  const d = new Date(dateStr)
  return d.toLocaleDateString(state.preferredLanguage === 'km' ? 'km-KH' : 'en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

function jump(date) {
  store.jumpToObservationDate(date)
}
</script>