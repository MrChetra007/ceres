<template>
  <div class="map-legend">
    <div class="legend-bar"></div>
    <div class="legend-labels">
      <span>0.0 Soil/Water</span>
      <span>0.4 Moderate</span>
      <span>1.0 Dense Veg.</span>
    </div>
    <ConfidenceBadge v-if="!state.loading && conf && conf.tier" :tier="conf.tier" :reason="conf.reason" class="legend-conf" />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { state, viewConfidence } from '../store'
import ConfidenceBadge from './ConfidenceBadge.vue'

const conf = computed(() => viewConfidence('main'))
</script>
