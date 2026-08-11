<template>
  <div class="hz-zones">
    <p class="hz-card-label">
      {{ t('hz.zones') }} · <span class="hz-band mono">{{ bandName }}</span>
    </p>
    <p class="hz-zones-sub">{{ t('hz.for_month', { month }) }}</p>

    <p v-if="loading" class="hz-note">{{ t('hz.loading') }}</p>
    <p v-else-if="noData" class="hz-note">{{ t('hz.nodata') }}</p>
    <template v-else>
      <div class="hz-row hz-row-head">
        <span class="hz-swatch"></span>
        <span class="hz-range">{{ t('hz.range') }}</span>
        <span class="hz-pctbar"></span>
        <span class="hz-area">{{ t('hz.area') }}</span>
      </div>
      <div v-for="(b, i) in buckets" :key="i" class="hz-row">
        <span class="hz-swatch" :style="{ background: swatch(b) }"></span>
        <span class="hz-range mono">{{ fmtRange(b) }}</span>
        <span class="hz-pctbar">
          <span class="hz-pctfill" :style="{ width: pct(b) + '%', background: swatch(b) }"></span>
        </span>
        <span class="hz-area mono">{{ areaText(b) }}</span>
      </div>
      <div class="hz-row hz-row-total">
        <span class="hz-swatch"></span>
        <span class="hz-range">{{ t('hz.total') }}</span>
        <span class="hz-pctbar"></span>
        <span class="hz-area mono">{{ totalText }}</span>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { state, formatHectares } from '../store'
import { MONTHS } from '../config'
import { useI18n } from '../i18n'
import { toKhmerDigits, formatMonthYear } from '../services/format'
import { bucketSwatchColor } from '../services/healthZone'

const { t, lang } = useI18n()

const view = computed(() => state.healthZone.view)
const loading = computed(() => state.healthZone.loading)
const buckets = computed(() => state.healthZone.buckets || [])
const bandName = computed(() => (view.value === 'rvi' ? 'RVI' : 'NDVI'))

const noData = computed(() => {
  if (state.healthZone.err === 'nodata') return true
  const arr = state.healthZone.buckets
  return !arr || arr.every((b) => !b.areaSqm)
})

const total = computed(() => state.healthZone.totalAreaSqm)
const month = computed(() => {
  const m = MONTHS[state.mainMonth]
  if (!m) return ''
  return formatMonthYear(m.year, m.month, lang.value, { long: true })
})

function pct(b) {
  if (!total.value) return 0
  return Math.min(100, Math.round((b.areaSqm / total.value) * 1000) / 10)
}

function fmtRange(b) {
  const lo = b.lo.toFixed(1)
  const hi = b.hi.toFixed(1)
  return lang.value === 'km'
    ? toKhmerDigits(lo) + ' – ' + toKhmerDigits(hi)
    : lo + ' – ' + hi
}

function swatch(b) {
  return bucketSwatchColor(b, view.value)
}

function areaText(b) {
  const ha = b.areaSqm / 10000
  const p = pct(b)
  const pctTxt = lang.value === 'km' ? toKhmerDigits(String(p)) : String(p)
  return formatHectares(ha, lang.value) + ' · ' + pctTxt + '%'
}

const totalText = computed(() => formatHectares(total.value / 10000, lang.value))
</script>
