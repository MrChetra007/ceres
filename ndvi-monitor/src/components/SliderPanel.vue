<template>
  <div id="slider-panel" class="panel" :class="{ loading: state.loading }" v-show="state.eeReady">
    <div class="control-row">
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
      <label class="switch-label">
        <input type="checkbox" v-model="state.compareMode" />
        <span>Compare</span>
      </label>
      <div class="export-dropdown" ref="exportWrap">
        <button id="export-btn-header" class="export-header-btn" @click="toggleExportMenu">
          <i class="ti ti-download"></i> Export <i class="ti ti-chevron-down"></i>
        </button>
        <div id="export-menu" class="export-menu" v-show="exportMenuOpen">
          <button @click="chooseExport('png')">Export as PNG</button>
          <button @click="chooseExport('pdf')">Export as PDF</button>
        </div>
      </div>
      <button id="aoi-btn" class="aoi-btn" title="Edit area of interest (AOI)" @click="state.aoiEditorVisible = true"><i class="ti ti-map"></i></button>
    </div>
    <p id="index-explainer" class="index-explainer">{{ explainerText }}</p>

    <div class="nav-row">
      <div class="segmented" id="basemap-toggle">
        <button
          v-for="b in ['street', 'satellite']"
          :key="b"
          class="segmented-btn base-btn"
          :class="{ active: state.currentBase === b }"
          @click="store.setBaseLayer(b)"
        >{{ b[0].toUpperCase() + b.slice(1) }}</button>
      </div>
      <div class="search-group">
        <i class="ti ti-search"></i>
        <input
          type="text"
          id="search-input"
          placeholder="Search place..."
          v-model="searchQuery"
          @keydown.enter="doSearch"
        />
        <button id="search-btn" @click="doSearch">Go</button>
      </div>
    </div>

    <div class="slider-group">
      <div class="slider-row">
        <span class="slider-label">{{ MONTHS[0].label }}</span>
        <div class="slider-track">
          <input
            type="range"
            id="month-slider"
            step="1"
            :min="0"
            :max="MONTHS.length - 1"
            :value="state.mainMonth"
            @input="onMainSlider"
          />
          <div class="event-markers">
            <div class="event-markers-row">
              <div
                v-for="(m, i) in MONTHS"
                :key="'e' + i"
                class="event-marker"
                :style="{ background: eventColor(i) || 'transparent' }"
                :title="eventLabel(i)"
              ></div>
            </div>
            <div class="auto-markers-row">
              <div
                v-for="(m, i) in MONTHS"
                :key="'a' + i"
                class="auto-marker"
                :class="{ 'auto-dry': state.dryMonthSet.has(i) }"
                :title="state.dryMonthSet.has(i) ? 'Low rainfall' : ''"
              ></div>
            </div>
          </div>
          <div class="slider-value">
            <span id="month-label">{{ mainMonthLabel }}</span>
            <span id="event-badge" v-if="mainEvent" class="event-badge" :class="mainEvent.type">{{ mainEvent.label }}</span>
            <span id="scene-count" class="scene-count" :class="{ 'scene-count-low': mainSceneLow }">{{ mainSceneText }}</span>
            <button id="latest-btn" class="latest-btn" title="Jump to latest month" @click="goLatest"><i class="ti ti-last"></i></button>
          </div>
        </div>
        <span class="slider-label">{{ MONTHS[MONTHS.length - 1].label }}</span>
      </div>
    </div>

    <div class="slider-group" v-show="state.compareMode">
      <div class="slider-row">
        <span class="slider-label">{{ MONTHS[0].label }}</span>
        <div class="slider-track">
          <input
            type="range"
            id="month-slider-right"
            step="1"
            :min="0"
            :max="MONTHS.length - 1"
            :value="state.rightMonth"
            @input="onRightSlider"
          />
          <div class="event-markers">
            <div class="event-markers-row">
              <div
                v-for="(m, i) in MONTHS"
                :key="'re' + i"
                class="event-marker"
                :style="{ background: eventColor(i) || 'transparent' }"
                :title="eventLabel(i)"
              ></div>
            </div>
            <div class="auto-markers-row">
              <div
                v-for="(m, i) in MONTHS"
                :key="'ra' + i"
                class="auto-marker"
                :class="{ 'auto-dry': state.dryMonthSet.has(i) }"
                :title="state.dryMonthSet.has(i) ? 'Low rainfall' : ''"
              ></div>
            </div>
          </div>
          <div class="slider-value">
            <span id="month-label-right">{{ rightMonthLabel }}</span>
            <span id="event-badge-right" v-if="rightEvent" class="event-badge" :class="rightEvent.type">{{ rightEvent.label }}</span>
            <span id="scene-count-right" class="scene-count" :class="{ 'scene-count-low': rightSceneLow }">{{ rightSceneText }}</span>
          </div>
        </div>
        <span class="slider-label">{{ MONTHS[MONTHS.length - 1].label }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { state, currentGeometry } from '../store'
import * as store from '../store'
import { INDICES, MONTHS, EVENTS, EVENT_COLORS } from '../config'

const exportMenuOpen = ref(false)
const exportWrap = ref(null)
const searchQuery = ref('')
let debounceTimer = null
let debounceTimerRight = null

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

const mainMonthLabel = computed(() => MONTHS[state.mainMonth].label)
const rightMonthLabel = computed(() => MONTHS[state.rightMonth].label)
const mainEvent = computed(() => store.eventForMonth(state.mainMonth))
const rightEvent = computed(() => store.eventForMonth(state.rightMonth))

function eventColor(i) {
  const ev = store.eventForMonth(i)
  return ev ? EVENT_COLORS[ev.type] : null
}
function eventLabel(i) {
  const ev = store.eventForMonth(i)
  return ev ? ev.label : ''
}

const mainSceneText = computed(() => sceneText(state.sceneCount.main))
const rightSceneText = computed(() => sceneText(state.sceneCount.right))
const mainSceneLow = computed(() => state.sceneCount.main > 0 && state.sceneCount.main <= 2)
const rightSceneLow = computed(() => state.sceneCount.right > 0 && state.sceneCount.right <= 2)

function sceneText(count) {
  if (count === 0) return ''
  const dot = count <= 2 ? '\u25CF ' : ''
  return '\u00b7 ' + dot + count + ' scene' + (count !== 1 ? 's' : '')
}

function onMainSlider(e) {
  state.mainMonth = parseInt(e.target.value)
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    store.loadIndexForMonth(state.mainMonth, currentGeometry.value)
  }, 300)
}

function onRightSlider(e) {
  state.rightMonth = parseInt(e.target.value)
  clearTimeout(debounceTimerRight)
  debounceTimerRight = setTimeout(() => {
    store.loadIndexForMonthRight(state.rightMonth)
  }, 300)
}

function goLatest() {
  const latest = Math.max(0, MONTHS.length - 2)
  state.mainMonth = latest
  store.loadIndexForMonth(latest, currentGeometry.value)
  if (state.compareMode) {
    state.rightMonth = latest
    store.loadIndexForMonthRight(latest)
  }
}

function toggleExportMenu() {
  exportMenuOpen.value = !exportMenuOpen.value
}

function chooseExport(fmt) {
  exportMenuOpen.value = false
  if (fmt === 'png') store.exportChart()
  else store.exportPdf()
}

function doSearch() {
  store.searchPlace(searchQuery.value)
}

function onDocClick(e) {
  if (exportWrap.value && !exportWrap.value.contains(e.target)) {
    exportMenuOpen.value = false
  }
}

onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))
</script>
