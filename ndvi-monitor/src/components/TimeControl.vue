<template>
  <div class="time-panel panel" :class="{ loading: state.loading, collapsed }" v-show="state.eeReady">
    <div class="time-head">
      <button class="play-btn" :title="playing ? t('time.playing') : t('time.play')" @click="togglePlay">
        <i class="ti" :class="playing ? 'ti-player-pause' : 'ti-player-play'"></i>
      </button>
      <div class="time-title" :title="t('time.expand_collapse')" @click="toggleCollapsed">
        <span class="month-label">{{ mainMonthLabel }}</span>
        <span class="season-tag">{{ seasonTag }}</span>
      </div>
      <button class="collapse-btn" :title="t('time.expand_collapse')" @click="toggleCollapsed">
        <i class="ti" :class="collapsed ? 'ti-chevron-up' : 'ti-chevron-down'"></i>
      </button>
      <div class="time-pills">
        <span v-if="state.loading" class="pill">{{ t('common.loading') }}</span>
        <span v-else-if="state.radarFallback.main" class="pill radar-fallback" :title="radarTooltip(state.radarFallback.main)">📡 {{ t('time.radar_view') }}</span>
        <span v-else-if="state.cloudBlock.main" class="pill cloud-blocked" :title="cloudTooltip(state.cloudBlock.main)">☁️ {{ t('time.cloud_blocked') }}</span>
        <span v-else class="pill" :class="scenePillClass">{{ mainSceneText || t('common.no_scenes') }}</span>
        <button
          v-if="!state.loading && state.cloudBlock.main && mainJumpDate"
          class="jump-btn"
          :title="t('time.jump_last_valid_tip', { date: mainJumpDate })"
          @click="store.jumpToLastValidReading('main')"
        >
          <i class="ti ti-corner-up-right"></i> {{ t('time.jump_last_valid', { date: mainJumpDate }) }}
        </button>
        <button class="latest-btn" :title="t('time.latest')" @click="goLatest">
          <i class="ti ti-last"></i>
        </button>
        <button class="today-btn" :title="t('time.today_tip')" @click="goToday">
          <i class="ti ti-calendar-event"></i> {{ t('time.today') }}
        </button>
      </div>
    </div>

    <div class="range-selector" :class="{ active: rangeActive }">
      <select
        class="range-select"
        :value="rangePresetValue"
        @change="onPresetChange"
        :title="t('time.range_tip')"
      >
        <option value="">— {{ t('time.full_window') }} —</option>
        <option v-for="p in SEASON_PRESETS" :key="p.id" :value="p.id">{{ p.label }}</option>
        <option :value="CUSTOM_RANGE_ID">{{ t('time.custom_range') }}</option>
      </select>
      <span v-if="rangeActive" class="range-badge">
        {{ state.rangeStart }} → {{ state.rangeEnd }}
        <button class="range-clear" :title="t('time.clear_range')" @click="clearRange">×</button>
      </span>
      <div class="range-custom">
        <input type="date" class="range-input" :value="customStart" @input="onCustomStart" />
        <span class="range-arrow">→</span>
        <input type="date" class="range-input" :value="customEnd" @input="onCustomEnd" />
      </div>
    </div>

    <div class="scrubber-wrap">
      <div class="scrubber">
        <input
          type="range"
          id="month-slider"
          step="1"
          :min="sliderBounds.min"
          :max="sliderBounds.max"
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
              :class="{ out: !isInRange(i) }"
              :style="{ background: eventColor(i) || 'transparent' }"
              :title="eventLabel(i)"
            ></div>
          </div>
          <div class="auto-markers-row">
            <div
              v-for="(m, i) in MONTHS"
              :key="'a' + i"
              class="auto-marker"
              :class="{ 'auto-dry': state.dryMonthSet.has(i), out: !isInRange(i) }"
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
          <span>{{ rangeActive ? monthTick(firstMonthInRange) : MONTHS[0].label }}</span>
          <span>{{ rangeActive ? monthTick(lastMonthInRange) : MONTHS[MONTHS.length - 1].label }}</span>
        </div>
      </div>

      <div v-if="state.compareMode" class="scrubber compare">
        <div class="scrubber-row">
          <span v-if="state.radarFallback.right" class="pill radar-fallback" :title="radarTooltip(state.radarFallback.right)">📡 {{ t('time.radar_view') }}</span>
          <span v-else-if="state.cloudBlock.right" class="pill cloud-blocked" :title="cloudTooltip(state.cloudBlock.right)">☁️ {{ t('time.cloud_blocked') }}</span>
          <span v-else class="pill">{{ rightSceneText || t('common.no_scenes') }}</span>
          <button
            v-if="!state.loading && state.cloudBlock.right && rightJumpDate"
            class="jump-btn"
            :title="t('time.jump_last_valid_tip', { date: rightJumpDate })"
            @click="store.jumpToLastValidReading('right')"
          >
            <i class="ti ti-corner-up-right"></i> {{ t('time.jump_last_valid', { date: rightJumpDate }) }}
          </button>
          <ConfidenceBadge v-if="!state.loading && rightConf.tier" :tier="rightConf.tier" :reason="rightConf.reason" class="scrubber-conf" />
          <span class="month-label right-label">{{ rightMonthLabel }}</span>
        </div>
        <input
          type="range"
          id="month-slider-right"
          step="1"
          :min="sliderBounds.min"
          :max="sliderBounds.max"
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
              :class="{ out: !isInRange(i) }"
              :style="{ background: eventColor(i) || 'transparent' }"
            ></div>
          </div>
          <div class="auto-markers-row">
            <div
              v-for="(m, i) in MONTHS"
              :key="'ra' + i"
              class="auto-marker"
              :class="{ 'auto-dry': state.dryMonthSet.has(i), out: !isInRange(i) }"
            ></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onBeforeUnmount } from 'vue'
import { state } from '../store'
import * as store from '../store'
import { MONTHS, EVENT_COLORS, SEASON_PRESETS, CUSTOM_RANGE_ID } from '../config'
import ConfidenceBadge from './ConfidenceBadge.vue'
import { useI18n } from '../i18n'

const { t } = useI18n()
const playing = ref(false)
const collapsed = ref(true)
let playTimer = null
let debounceTimer = null
let debounceTimerRight = null

const rangeActive = computed(() => !!(state.rangeStart && state.rangeEnd))
const sliderBounds = computed(() => rangeActive.value ? store.sliderBounds() : { min: 0, max: MONTHS.length - 1 })
const rangePresetValue = computed(() => {
  if (rangeActive.value) {
    if (state.rangePresetId && SEASON_PRESETS.some((p) => p.id === state.rangePresetId)) return state.rangePresetId
    return CUSTOM_RANGE_ID
  }
  return ''
})
const firstMonthInRange = computed(() => {
  const months = store.sliderBounds()
  return MONTHS[months.min]
})
const lastMonthInRange = computed(() => {
  const months = store.sliderBounds()
  return MONTHS[months.max]
})
const customStart = computed(() => state.rangeStart || '')
const customEnd = computed(() => state.rangeEnd || '')

function monthTick(m) {
  return m ? m.label : ''
}
function isInRange(i) {
  if (!rangeActive.value) return true
  const b = sliderBounds.value
  return i >= b.min && i <= b.max
}
function onPresetChange(e) {
  const v = e.target.value
  if (v === '') { store.clearDateRange(); return }
  if (v === CUSTOM_RANGE_ID) return
  store.setRangePreset(v)
}
function onCustomStart(e) {
  store.applyDateRange(e.target.value || null, state.rangeEnd || null, CUSTOM_RANGE_ID)
}
function onCustomEnd(e) {
  store.applyDateRange(state.rangeStart || null, e.target.value || null, CUSTOM_RANGE_ID)
}
function clearRange() {
  store.clearDateRange()
}

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

const mainJumpDate = computed(() => (state.cloudBlock.main && state.cloudBlock.main.lastValidDate) || '')
const rightJumpDate = computed(() => (state.cloudBlock.right && state.cloudBlock.right.lastValidDate) || '')

function cloudTooltip(block) {
  if (!block) return ''
  const pct = block.cloudPct != null ? Math.round(block.cloudPct) + '% ' + t('common.cloud') : t('common.cloud_covered')
  const last = block.lastValidDate ? t('time.last_valid_reading') + block.lastValidDate : t('time.no_cloud_free')
  return t('time.cloud_covered_on') + block.month + ' (' + pct + ') \u2014 ' + t('time.true_color') + ' ' + t('time.ndvi_unreliable') + ' ' + last
}

function radarTooltip(block) {
  if (!block) return ''
  return t('time.radar_tooltip', { month: block.month })
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
  debounceTimer = setTimeout(() => store.loadIndexForMonth(state.mainMonth, store.currentGeometry.value), 300)
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

function toggleCollapsed() {
  collapsed.value = !collapsed.value
}

function startPlay() {
  stopPlay()
  playTimer = setInterval(() => {
    const b = sliderBounds.value
    const next = state.mainMonth >= b.max ? b.min : state.mainMonth + 1
    state.mainMonth = next
    store.loadIndexForMonth(next, store.currentGeometry.value, true)
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
  const b = sliderBounds.value
  const latest = rangeActive.value ? b.max : Math.max(0, MONTHS.length - 2)
  state.mainMonth = latest
  store.loadIndexForMonth(latest, store.currentGeometry.value)
  if (state.compareMode) {
    state.rightMonth = latest
    store.loadIndexForMonthRight(latest)
  }
}

function goToday() {
  store.jumpToToday()
}

onBeforeUnmount(() => {
  stopPlay()
  clearTimeout(debounceTimer)
  clearTimeout(debounceTimerRight)
})
</script>
