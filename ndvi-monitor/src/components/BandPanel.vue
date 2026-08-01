<template>
  <div class="band-wrap" v-show="state.eeReady">
    <div class="band-panel panel">
      <div class="segmented" role="group" aria-label="Index">
        <button
          v-for="idx in ['ndvi', 'ndwi', 'lswi']"
          :key="idx"
          class="segmented-btn"
          :class="{ active: state.currentIndex === idx }"
          :data-index="idx"
          :title="indexTitle(idx)"
          @click="store.setIndex(idx)"
        >{{ idx.toUpperCase() }}</button>
      </div>
      <div class="band-divider"></div>
      <div class="segmented" role="group" aria-label="Base layer">
        <button
          v-for="b in ['street', 'satellite']"
          :key="b"
          class="segmented-btn"
          :class="{ active: state.currentBase === b }"
          @click="store.setBaseLayer(b)"
        >{{ b === 'street' ? 'Street' : 'Satellite' }}</button>
      </div>
      <button class="aoi-btn" title="Edit area of interest (AOI)" @click="state.aoiEditorVisible = true">
        <i class="ti ti-map"></i>
      </button>
    </div>
    <div class="band-explainer">{{ explainerText }}</div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { state } from '../store'
import * as store from '../store'
import { INDICES } from '../config'

const explainerText = computed(() => {
  const cfg = INDICES[state.currentIndex]
  return cfg.name + ' \u00b7 ' + cfg.full
})

function indexTitle(idx) {
  return {
    ndvi: 'NDVI — Vegetation Health. High = healthy green plants, low = bare soil, water, or stressed crops.',
    ndwi: 'NDWI — Water Index. High = surface water, low = dry land.',
    lswi: 'LSWI — Land Surface Water Index. High = moisture in soil and plant canopy, low = dry.',
  }[idx]
}
</script>
