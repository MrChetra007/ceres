<template>
  <div class="time-panel panel" :class="{ loading: state.loading }" v-show="state.eeReady">
    <div class="time-head">
      <button class="play-btn" :title="playing ? 'Pause' : 'Play through months'" @click="togglePlay">
        <i class="ti" :class="playing ? 'ti-player-pause' : 'ti-player-play'"></i>
      </button>
      <div class="time-title">
        <span class="month-label">{{ mainMonthLabel }}</span>
        <span class="season-tag">{{ seasonTag }}</span>
      </div>
      <div class="time-pills">
        <span v-if="state.loading" class="pill">loading&hellip;</span>
        <span v-else class="pill" :class="scenePillClass">{{ mainSceneText || 'no scenes' }}</span>
        <button class="latest-btn" title="Jump to latest complete month" @click="goLatest">
          <i class="ti ti-last"></i>
        </button>
      </div>
    </div>

    <div class="scrubber">
      <input
        type="range"
        id="month-slider"
        step="1"
        :min="0"
        :max="MONTHS.length - 1"
        :value="state.mainMonth"
        :style="{ background: trackBg(state.mainMonth) }"
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
      <div class="scrubber-ticks">
        <span>{{ MONTHS[0].label }}</span>
        <span>{{ MONTHS[MONTHS.length - 1].label }}</span>
      </div>
    </div>

    <div v-if="state.compareMode" class="scrubber compare">
      <div class="scrubber-row">
        <span class="pill">{{ rightSceneText || 'no scenes' }}</span>
        <span class="month-label right-label">{{ rightMonthLabel }}</span>
      </div>
      <input
        type="range"
        id="month-slider-right"
        step="1"
        :min="0"
        :max="MONTHS.length - 1"
        :value="state.rightMonth"
        :style="{ background: trackBg(state.rightMonth) }"
        @input="onRightSlider"
      />
      <div class="event-markers">
        <div class="event-markers-row">
          <div
            v-for="(m, i) in MONTHS"
            :key="'re' + i"
            class="event-marker"
            :style="{ background: eventColor(i) || 'transparent' }"
          ></div>
        </div>
        <div class="auto-markers-row">
          <div
            v-for="(m, i) in MONTHS"
            :key="'ra' + i"
            class="auto-marker"
            :class="{ 'auto-dry': state.dryMonthSet.has(i) }"
          ></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onBeforeUnmount } from 'vue'
import { state } from '../store'
import * as store from '../store'
import { MONTHS, EVENT_COLORS } from '../config'

const playing = ref(false)
let playTimer = null
let debounceTimer = null
let debounceTimerRight = null

const mainMonthLabel = computed(() => fullLabel(MONTHS[state.mainMonth]))
const rightMonthLabel = computed(() => fullLabel(MONTHS[state.rightMonth]))

function fullLabel(m) {
  return new Date(m.year, m.month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

const seasonTag = computed(() => seasonForMonth(MONTHS[state.mainMonth].month))

function seasonForMonth(month) {
  return month >= 5 && month <= 10 ? 'Wet Season (Rainfed)' : 'Dry Season (Irrigated)'
}

const mainSceneText = computed(() => sceneText(state.sceneCount.main))
const rightSceneText = computed(() => sceneText(state.sceneCount.right))
const scenePillClass = computed(() => {
  const c = state.sceneCount.main
  return c > 0 && c <= 2 ? 'low' : ''
})

function sceneText(count) {
  if (count === 0) return ''
  const dot = count <= 2 ? '\u25CF ' : ''
  return dot + count + ' scene' + (count !== 1 ? 's' : '')
}

function trackBg(idx) {
  const pct = (idx / (MONTHS.length - 1)) * 100
  return 'linear-gradient(to right, var(--accent) ' + pct + '%, rgba(255,255,255,0.14) ' + pct + '%)'
}

function eventColor(i) {
  const ev = store.eventForMonth(i)
  return ev ? EVENT_COLORS[ev.type] : null
}
function eventLabel(i) {
  const ev = store.eventForMonth(i)
  return ev ? ev.label : ''
}

function onMainSlider(e) {
  state.mainMonth = parseInt(e.target.value)
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => store.loadIndexForMonth(state.mainMonth, null), 300)
}

function onRightSlider(e) {
  state.rightMonth = parseInt(e.target.value)
  clearTimeout(debounceTimerRight)
  debounceTimerRight = setTimeout(() => store.loadIndexForMonthRight(state.rightMonth), 300)
}

function togglePlay() {
  playing.value = !playing.value
  if (playing.value) startPlay()
  else stopPlay()
}

function startPlay() {
  stopPlay()
  playTimer = setInterval(() => {
    const next = (state.mainMonth + 1) % MONTHS.length
    state.mainMonth = next
    store.loadIndexForMonth(next, null)
    if (state.compareMode) {
      state.rightMonth = next
      store.loadIndexForMonthRight(next)
    }
  }, 900)
}

function stopPlay() {
  if (playTimer) { clearInterval(playTimer); playTimer = null }
}

function goLatest() {
  const latest = Math.max(0, MONTHS.length - 2)
  state.mainMonth = latest
  store.loadIndexForMonth(latest, null)
  if (state.compareMode) {
    state.rightMonth = latest
    store.loadIndexForMonthRight(latest)
  }
}

onBeforeUnmount(() => {
  stopPlay()
  clearTimeout(debounceTimer)
  clearTimeout(debounceTimerRight)
})
</script>
