<template>
  <div class="hz-scale">
    <p class="hz-card-label">
      {{ t('hz.scale') }} · <span class="hz-band mono">{{ bandName }}</span>
    </p>
    <p class="hz-scale-note">{{ noteText }}</p>

    <div class="hz-bar-zone">
      <div class="hz-gradient" :style="gradientStyle">
        <span
          v-for="tk in ticks"
          :key="'t' + tk"
          class="hz-tick"
          :style="{ left: tickLeft(tk) + '%' }"
        ></span>
        <span
          class="hz-thr hz-thr-bad"
          :style="{ left: tickLeft(thr.bad) + '%' }"
          :title="t('hz.bad_starts', { v: fmtVal(thr.bad) })"
        ></span>
        <span
          class="hz-thr hz-thr-good"
          :style="{ left: tickLeft(thr.good) + '%' }"
          :title="t('hz.good_starts', { v: fmtVal(thr.good) })"
        ></span>
      </div>
      <div class="hz-tick-labels">
        <span
          v-for="tk in ticks"
          :key="'l' + tk"
          class="hz-tick-label mono"
          :style="{ left: tickLeft(tk) + '%' }"
        >{{ fmtTick(tk) }}</span>
      </div>
    </div>

    <div class="hz-markers">
      <span class="hz-marker hz-marker-good">✅ {{ t('hz.good') }}</span>
      <span class="hz-marker hz-marker-medium">⚠️ {{ t('hz.medium') }}</span>
      <span class="hz-marker hz-marker-bad">❌ {{ t('hz.bad') }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { state } from '../store'
import { useI18n } from '../i18n'
import { toKhmerDigits, stageName } from '../services/format'
import { makeTicks, tickLeft, rampColor, zoneThresholds } from '../services/healthZone'

const { t, lang } = useI18n()

const view = computed(() => state.healthZone.view)
const ticks = makeTicks()
const thr = computed(() => zoneThresholds(state, view.value))
const bandName = computed(() => (view.value === 'rvi' ? 'RVI' : 'NDVI'))

function fmtVal(v) {
  const txt = v.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
  return lang.value === 'km' ? toKhmerDigits(txt) : txt
}

function fmtTick(v) {
  const txt = v.toFixed(1)
  return lang.value === 'km' ? toKhmerDigits(txt) : txt
}

const noteText = computed(() => {
  const bad = fmtVal(thr.value.bad)
  const good = fmtVal(thr.value.good)
  if (thr.value.stageAware && thr.value.stage) {
    return t('hz.scale_note_stage', {
      stage: stageName(lang.value, thr.value.stage.stage),
      day: toKhmerDigits(String(thr.value.days)),
      bad,
      good,
    })
  }
  if (view.value === 'rvi') return t('hz.scale_note_rvi', { bad, good })
  return t('hz.scale_note_flat', { bad, good })
})

const gradientStyle = computed(() => {
  const n = 20
  const stops = []
  for (let i = 0; i <= n; i++) {
    const pct = Math.round((i / n) * 100)
    stops.push(rampColor(view.value, i / n) + ' ' + pct + '%')
  }
  return { background: 'linear-gradient(90deg, ' + stops.join(', ') + ')' }
})
</script>
