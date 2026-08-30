<template>
  <div class="map-legend" :class="{ photo: isTrueColor }">
    <template v-if="!isTrueColor">
      <div class="legend-bar"></div>
      <div class="legend-labels">
        <span>{{ scale[0] }} {{ t('legend.soil_water') }}</span>
        <span>{{ scale[1] }} {{ t('legend.moderate') }}</span>
        <span>{{ scale[2] }} {{ t('legend.dense_veg') }}</span>
      </div>
    </template>
    <template v-else>
      <div class="legend-photo-note">{{ t('legend.true_color') }}</div>
    </template>
    <ConfidenceBadge v-if="!state.loading && conf && conf.tier" :tier="conf.tier" :reason="conf.reason" showReason class="legend-conf" />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { state, viewConfidence } from '../store'
import ConfidenceBadge from './ConfidenceBadge.vue'
import { useI18n } from '../i18n'

const { t } = useI18n()
const isTrueColor = computed(() => state.currentIndex === 'truecolor')
const conf = computed(() => viewConfidence('main'))

// Per-index legend scale values (the gradient bar stays the same). New
// visual-only indices (savi/evi/gndvi) get their own start/mid/end labels —
// placeholders for the user to tune.
const LEGEND_SCALE = {
  ndvi: ['0.0', '0.4', '1.0'],
  ndwi: ['0.0', '0.4', '1.0'],
  lswi: ['0.0', '0.4', '1.0'],
  savi: ['0.0', '0.5', '1.0'],
  evi: ['0.0', '0.5', '1.0'],
  gndvi: ['-0.2', '0.3', '0.8'],
  rvi: ['0.0', '0.5', '1.0'],
}
const scale = computed(() => LEGEND_SCALE[state.currentIndex] || ['0.0', '0.4', '1.0'])
</script>