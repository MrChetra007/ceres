<template>
  <div class="map-legend">
    <div class="legend-bar"></div>
    <div class="legend-labels">
      <span>0.0 {{ t('legend.soil_water') }}</span>
      <span>0.4 {{ t('legend.moderate') }}</span>
      <span>1.0 {{ t('legend.dense_veg') }}</span>
    </div>
    <ConfidenceBadge v-if="!state.loading && conf && conf.tier" :tier="conf.tier" :reason="conf.reason" class="legend-conf" />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { state, viewConfidence } from '../store'
import ConfidenceBadge from './ConfidenceBadge.vue'
import { useI18n } from '../i18n'

const { t } = useI18n()
const conf = computed(() => viewConfidence('main'))
</script>