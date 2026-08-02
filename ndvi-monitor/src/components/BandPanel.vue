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
      <div class="band-base segmented" role="group" aria-label="Base layer">
        <button
          v-for="b in ['street', 'satellite']"
          :key="b"
          class="segmented-btn"
          :class="{ active: state.currentBase === b }"
          @click="store.setBaseLayer(b)"
        >{{ b === 'street' ? 'Street' : 'Satellite' }}</button>
      </div>

      <div class="band-areas" ref="areasWrap">
        <button class="areas-btn" title="Switch area" @click="areasOpen = !areasOpen">
          <i class="ti ti-map-pin"></i>
          <span class="areas-btn-label">{{ selectedAoiLabel }}</span>
          <i class="ti ti-chevron-down"></i>
        </button>
        <div class="areas-menu" v-show="areasOpen">
          <div class="areas-menu-title">My areas</div>
          <button
            v-for="a in state.aois"
            :key="a.id"
            class="areas-item"
            :class="{ active: a.id === state.selectedAoiId }"
            @click="pick(a)"
          >
            <span class="areas-item-name">{{ a.name }}</span>
            <i class="ti ti-trash" title="Delete area" @click.stop="remove(a)"></i>
          </button>
          <div class="areas-empty" v-if="state.aois.length === 0">No areas yet</div>
          <button v-if="state.aois.length < 5" class="areas-new" @click="openNewArea">
            <i class="ti ti-plus"></i> New area
          </button>
          <div v-else class="areas-cap">Limit of 5 areas reached</div>
        </div>
      </div>

      <button class="aoi-btn" title="New area" @click="openNewArea">
        <i class="ti ti-map"></i>
      </button>
    </div>
    <div class="band-explainer">{{ explainerText }}</div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { state } from '../store'
import * as store from '../store'
import { INDICES } from '../config'

const areasOpen = ref(false)
const areasWrap = ref(null)

const explainerText = computed(() => {
  const cfg = INDICES[state.currentIndex]
  return cfg.name + ' \u00b7 ' + cfg.full
})

const selectedAoiLabel = computed(() => {
  const aoi = state.aois.find((a) => a.id === state.selectedAoiId)
  return aoi ? aoi.name : 'Areas'
})

function indexTitle(idx) {
  return {
    ndvi: 'NDVI — Vegetation Health. High = healthy green plants, low = bare soil, water, or stressed crops.',
    ndwi: 'NDWI — Water Index. High = surface water, low = dry land.',
    lswi: 'LSWI — Land Surface Water Index. High = moisture in soil and plant canopy, low = dry.',
  }[idx]
}

function pick(a) {
  areasOpen.value = false
  store.selectAoi(a.id)
}

function remove(a) {
  if (!window.confirm('Delete area \u201c' + a.name + '\u201d?')) return
  store.deleteAoi(a.id)
}

function openNewArea() {
  areasOpen.value = false
  if (state.aois.length >= 5) {
    store.showToast('Limit of 5 areas reached')
    return
  }
  state.aoiEditorVisible = true
}

function onDocClick(e) {
  if (areasWrap.value && !areasWrap.value.contains(e.target)) {
    areasOpen.value = false
  }
}

onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))
</script>
