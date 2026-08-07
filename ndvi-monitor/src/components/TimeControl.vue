<template>
  <div class="time-panel panel" :class="{ loading: state.loading }" v-show="state.eeReady">
    <div class="time-head">
      <button class="play-btn" :title="playing ? t('time.playing') : t('time.play')" @click="togglePlay">
        <i class="ti" :class="playing ? 'ti-player-pause' : 'ti-player-play'"></i>
      </button>
      <div class="time-title">
        <span class="month-label">{{ mainMonthLabel }}</span>
        <span class="season-tag">{{ seasonTag }}</span>
      </div>
      <div class="time-pills">
        <span v-if="state.loading" class="pill">{{ t('common.loading') }}</span>
        <span v-else-if="state.cloudBlock.main" class="pill cloud-blocked" :title="cloudTooltip(state.cloudBlock.main)">☁️ {{ t('time.cloud_blocked') }}</span>
        <span v-else class="pill" :class="scenePillClass">{{ mainSceneText || t('common.no_scenes') }}</span>
        <button class="latest-btn" :title="t('time.latest')" @click="goLatest">
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
            :title="state.dryMonthSet.has(i) ? t('time.low_rain') : ''"
          ></div>
        </div>
      </div>
      <div class="event-legend">
        <span class="ev-key"><i class="ev-dot flood"></i>{{ t('time.flood') }}</span>
        <span class="ev-key"><i class="ev-dot drought"></i>{{ t('time.dry_spell') }}</span>
        <span class="ev-key"><i class="ev-dot dry-auto"></i>{{ t('time.low_rain_chirps') }}</span>
      </div>
      <div class="scrubber-ticks">
        <span>{{ MONTHS[0].label }}</span>
        <span>{{ MONTHS[MONTHS.length - 1].label }}</span>
      </div>
    </div>

    <div v-if="state.compareMode" class="scrubber compare">
      <div class="scrubber-row">
        <span v-if="state.cloudBlock.right" class="pill cloud-blocked" :title="cloudTooltip(state.cloudBlock.right)">☁️ {{ t('time.cloud_blocked') }}</span>
        <span v-else class="pill">{{ rightSceneText || t('common.no_scenes') }}</span>
        <ConfidenceBadge v-if="!state.loading && rightConf.tier" :tier="rightConf.tier" :reason="rightConf.reason" class="scrubber-conf" />
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
import ConfidenceBadge from './ConfidenceBadge.vue'
import { useI18n } from '../i18n'

const { t } = useI18n()
const playing = ref(false)
let playTimer = null
let debounceTimer = null
let debounceTimerRight = null

const mainMonthLabel = computed(() => fullLabel(MONTHS[state.mainMonth]))
const rightMonthLabel = computed(() => fullLabel(MONTHS[state.rightMonth]))

function fullLabel(m) {
  const d = new Date(m.year, m.month - 1, 1)
  if (state.preferredLanguage === 'km') {
    return d.toLocaleDateString('km-KH', { month: 'long', year: 'numeric' })
  }
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

const seasonTag = computed(() => seasonForMonth(MONTHS[state.mainMonth].month))

function seasonForMonth(month) {
  return month >= 5 && month <= 10
    ? t('time.wet_season')
    : t('time.dry_season')
}

const mainSceneText = computed(() => sceneText(state.sceneCount.main))
const rightSceneText = computed(() => sceneText(state.sceneCount.right))
const scenePillClass = computed(() => {
  const c = state.sceneCount.main
  return c > 0 && c <= 2 ? 'low' : ''
})

const rightConf = computed(() => store.viewConfidence('right'))

function cloudTooltip(block) {
  if (!block) return ''
  const pct = block.cloudPct != null ? Math.round(block.cloudPct) + '% ' + t('common.cloud') : t('common.cloud_covered')
  const last = block.lastValidDate ? t('time.last_valid_reading') + block.lastValidDate : t('time.no_cloud_free')
  return t('time.cloud_covered_on') + block.month + ' (' + pct + ') — ' + t('time.true_color') + ' ' + last
}

function sceneText(count) {
  if (count === 0) return ''
  const dot = count <= 2 ? '\u25CF ' : ''
  return dot + count + ' ' + (count !== 1 ? t('common.scenes') : t('common.scene'))
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
    store.loadIndexForMonth(next, null, true)
    if (state.compareMode) {
      state.rightMonth = next
      store.loadIndexForMonthRight(next, true)
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
