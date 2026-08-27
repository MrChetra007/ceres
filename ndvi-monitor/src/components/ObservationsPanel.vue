<template>
  <div class="obs-strip panel">
    <div class="obs-strip-head">
      <span class="obs-title">
        <i class="ti ti-satellite"></i>
        {{ t('obs.title') }}
      </span>
      <span v-if="countText" class="obs-strip-count mono">{{ countText }}</span>
      <span v-if="state.observationsLoading" class="obs-loading">{{ t('common.loading') }}</span>
      <span class="obs-strip-controls">
        <button class="icon-btn" :title="collapsed ? t('obs.expand') : t('obs.collapse')" @click="collapsed = !collapsed">
          <i class="ti" :class="collapsed ? 'ti-chevron-down' : 'ti-chevron-up'"></i>
        </button>
        <button class="icon-btn" :title="t('common.close')" @click="close">&times;</button>
      </span>
    </div>

    <div v-show="!collapsed" class="obs-days-wrap">
      <p v-if="!state.currentFieldId" class="obs-empty">{{ t('obs.no_field') }}</p>
      <p v-else-if="!state.observationsLoading && state.observations.length === 0" class="obs-empty">
        {{ t('obs.no_observations') }}
      </p>

      <div v-else class="obs-days">
        <button
          v-for="o in state.observations"
          :key="o.date"
          class="obs-day"
          :class="[o.status, { active: rowActive(o.date) }]"
          :title="t('obs.jump_tip', { date: fmtDate(o.date) })"
          @click="jump(o.date)"
        >
          <span class="obs-day-date mono">{{ fmtDate(o.date) }}</span>
          <i class="obs-day-icon ti" :class="cloudIconCls(o)" :style="cloudIconStyle(o)"></i>
          <span class="obs-day-sub mono">{{ cloudText(o) }}</span>
          <span class="obs-day-ndvi mono">{{ ndviText(o) }}</span>
        </button>
      </div>

      <!-- Sentinel-1 radar passes are intentionally stubbed for a later pass:
           columns would append here with source 'Sentinel-1 (RVI)' and no cloud %. -->
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { state } from '../store'
import * as store from '../store'
import { MONTHS } from '../config'
import { useI18n } from '../i18n'

const { t } = useI18n()

// Collapsed = slim header bar stays docked above the mode selector; the
// chevron re-expands the day-row. This doubles as the only manual reopen
// affordance (the header button is gone) — fully closing via × keeps the
// user's choice until the next field auto-opens the strip again.
const collapsed = ref(false)

const countText = computed(() => {
  const n = state.observations.length
  return n > 0 ? String(n) : ''
})

const currentMonth = computed(() => MONTHS[state.mainMonth] || null)

// The slider is month-granular; a column is "active" when its date falls in
// the month currently loaded in the main map (mirrors the slider position).
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

// Glanceable cloud icon: outline when light, solid as it gets heavy, with
// opacity ramping from faint (clear) toward full strength (overcast).
function cloudIconCls(o) {
  if (o.cloudCover == null) return 'ti-cloud-off'
  return Math.round(o.cloudCover) >= 45 ? 'ti-cloud-filled' : 'ti-cloud'
}

function cloudIconStyle(o) {
  if (o.cloudCover == null) return {}
  const pct = Math.max(0, Math.min(100, o.cloudCover))
  return { opacity: String(0.4 + (pct / 100) * 0.6) }
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

function close() {
  state.observationsVisible = false
}
</script>
