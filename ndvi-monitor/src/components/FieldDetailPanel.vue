<template>
  <div id="field-detail" class="panel detail-panel">
    <div class="detail-header">
      <div class="detail-heading">
        <p class="detail-title">{{ title }}</p>
        <p class="detail-subtitle mono">{{ state.chartSubtitle }}</p>
      </div>
      <button class="close-btn" @click="onClose">&times;</button>
    </div>

    <template v-if="isField">
      <!-- AIM — composite health score card (light "readable outdoors" surface
           on the dark panel, per the chosen hybrid design). Score + one plain
           verdict first; component chips and any index disagreement below. -->
      <div v-if="aimLoading || (aim && !aimSuppressed && !aim.noData)" class="detail-section aim-card">
        <div class="aim-card-head">
          <span class="aim-card-title">{{ t('aim.heading') }}</span>
          <span v-if="aimLoading" class="aim-loading">{{ t('aim.loading') }}</span>
        </div>
        <div v-if="aim && !aimLoading" class="aim-card-body">
          <div class="aim-topline">
            <div class="aim-score" :class="'aim-' + aim.label">{{ aim.score }}<span class="aim-score-of">/100</span></div>
            <p class="aim-phrase" :class="'aim-' + aim.label">{{ aimPhrase }}</p>
          </div>
          <p v-if="aim.primaryIndex !== 'ndvi'" class="aim-reason">
            <i class="ti ti-info-circle"></i>{{ aimReasonText }}
          </p>
          <div v-if="aim.discrepancy" class="aim-disc" role="alert">
            <i class="ti ti-alert-triangle"></i><span>{{ aimDiscText }}</span>
          </div>
          <button
            v-if="aim"
            class="aim-details-toggle"
            :aria-expanded="aimDetailsOpen"
            @click="aimDetailsOpen = !aimDetailsOpen"
          >
            <span>{{ aimDetailsOpen ? t('aim.hide_details') : t('aim.show_details') }}</span>
            <i class="ti" :class="aimDetailsOpen ? 'ti-chevron-up' : 'ti-chevron-down'"></i>
          </button>
          <!-- Details: how the score combines + a consistent per-index legend
               for each component (learned once, reused across all indices). -->
          <div v-if="aimDetailsOpen" class="aim-details">
            <div class="aim-components">
              <span class="aim-components-label">{{ t('aim.components') }}</span>
              <span
                v-for="chip in aimChips"
                :key="chip.name"
                class="aim-chip"
                :title="chip.raw != null ? INDICES[chip.name].name + ' · raw ' + chip.raw.toFixed(2) : INDICES[chip.name].name"
              >
                {{ INDICES[chip.name].name }} {{ Math.round(chip.norm * 100) }}%
              </span>
            </div>
            <IndexLegend
              v-for="chip in aimChips"
              :key="'lg-' + chip.name"
              :index="chip.name"
              :value="chip.raw"
            />
          </div>
        </div>
      </div>
      <div v-else-if="aim && (aim.noData || aimSuppressed)" class="detail-section aim-card aim-card--nodata">
        <p class="aim-nodata">{{ t('aim.no_data') }}</p>
      </div>

      <div class="detail-section hero-card">
        <div class="hero-main">
          <div class="hero-value mono" :class="statusTone">{{ heroValue }}</div>
          <span class="status-badge" :class="statusTone">{{ statusText }}</span>
        </div>
        <div class="hero-sub mono">{{ stageText }}</div>
        <p v-if="radarSceneNote" class="hero-stale-note radar-scene-note">
          <i class="ti ti-satellite"></i>
          <span>{{ radarSceneNote }}</span>
        </p>
        <p v-else-if="obsFallbackNote" class="hero-stale-note obs-fallback-note">
          <i class="ti ti-info-circle"></i>
          <span>{{ obsFallbackNote }}</span>
        </p>
        <p v-else-if="showHeroStaleNote" class="hero-stale-note">{{ t('field.last_clear_reading', { date: heroLastClearDate }) }}</p>
        <div class="hero-bench">
          <span class="bench-dot"></span> {{ t('field.aoi_benchmark') }}
          <b class="mono">{{ benchmarkText }}</b>
        </div>
        <ConfidenceBadge v-if="conf && conf.tier" :tier="conf.tier" :reason="conf.reason" showReason class="detail-conf" />
      </div>

      <div v-if="radarMapNote" class="detail-section radar-map-note">
        <p class="radar-map-note-text">{{ t('field.radar_map_note') }}</p>
      </div>

      <!-- Growth stage is planting-date based, not band-derived, so it stays
           identical across the NDVI/NDWI/LSWI/RVI tabs. The "day since planting"
           is anchored to the NDVI (Sentinel-2) observation series — never the
           RVI (Sentinel-1) series, which has a different revisit cadence. -->
      <div class="detail-section stage-card">
        <p class="detail-card-label">{{ t('field.growth_stage') }}</p>
        <p class="stage-name">{{ stageName }}</p>
        <div class="stage-bar">
          <span class="stage-fill" :style="{ width: stagePct + '%' }"></span>
        </div>
        <p class="stage-days mono">{{ stageDaysText }}</p>
      </div>

      <!-- Stress Alert is a NDVI-only health signal (no NDWI/LSWI thresholds
           exist yet) — hide the card on non-NDVI tabs instead of showing stale
           NDVI text. -->
      <div v-if="isField && state.currentIndex === 'ndvi'" class="detail-section stress-card" :class="stressTone">
        <p class="detail-card-label">{{ t('field.stress_alert') }}</p>
        <p class="stress-msg">{{ stressMsg }}</p>
      </div>

      <div class="detail-section ai-card">
        <button
          class="ai-consult-btn"
          :class="{ locked: aiLocked }"
          :title="aiLocked ? t('subs.ai_unlock_tip') : ''"
          :disabled="consultingAi || noSceneData"
          @click="aiLocked ? store.showPaywall('ai') : consultAi()"
        >
          <span v-if="consultingAi" class="ai-spinner"></span>
          <i v-else :class="aiLocked ? 'ti ti-lock' : 'ti ti-sparkles'"></i>
          {{ aiLocked ? t('subs.limit_ai') : (consultingAi ? t('field.consulting_ai') : t('field.consult_ai')) }}
        </button>
        <p v-if="aiLocked" class="ai-note ai-locked-note">
          {{ t('subs.ai_not_in_plan') }}
          <button class="ai-unlock-link" @click="store.showPaywall('ai')">{{ t('subs.upgrade') }}</button>
        </p>
        <p v-else-if="noSceneData" class="ai-note no-scene-note">{{ t('field.no_scene_note') }}</p>
        <div v-if="aiExplanation" class="ai-answer">
          <p class="detail-card-label">{{ t('field.ai_agronomist') }}</p>
          <p class="ai-text">{{ aiExplanation }}</p>
          <p v-if="aiTruncated" class="ai-note ai-truncated">{{ t('field.ai_truncated') }}</p>
          <p class="ai-note">{{ t('field.ai_generated') }}</p>
        </div>
      </div>
    </template>

    <!-- Rainfall-watch stress note is built from the NDVI trend (checkStress only
           ever populates state.stressAlert for the ndvi index) — gate it so it
           never renders NDVI wording on the NDWI/LSWI tabs. -->
    <div v-if="state.stressAlert && state.currentIndex === 'ndvi'" class="detail-section stress-card alert-msg">
      <p class="detail-card-label">{{ t('field.rainfall_watch') }}</p>
      <p class="stress-msg">{{ state.stressAlert }}</p>
    </div>

    <div class="detail-section chart-card">
      <div class="chart-card-header">
        <span class="chart-card-title">{{ title }}</span>
        <button class="icon-btn" :title="t('field.enlarge_chart')" @click="state.chartModalVisible = true"><i class="ti ti-arrows-maximize"></i></button>
      </div>
      <canvas id="trend-chart" ref="chartCanvas"></canvas>
    </div>

    <div class="detail-section rain-card">
      <p class="detail-card-label">{{ t('field.rainfall') }} <span class="mono">({{ t('field.days_21') }})</span></p>
      <p class="rain-value mono" :class="{ 'rain-unavailable': state.rainfallMm == null }">{{ rainText }}</p>
    </div>

    <div class="detail-section forecast-card">
      <p class="detail-card-label">{{ t('field.forecast') }} <span class="mono">({{ t('field.forecast_days') }})</span></p>
      <div v-if="wxLoading" class="forecast-note">{{ t('field.loading') }}</div>
      <div v-else-if="wxError" class="forecast-note">{{ t('field.forecast_unavailable') }}</div>
      <template v-else-if="wxDays.length">
        <div class="forecast-grid">
          <div v-for="d in wxDays" :key="d.date" class="forecast-day">
            <span class="forecast-day-label">{{ dayLabel(d.date) }}</span>
            <span class="forecast-temp mono" :title="t('field.forecast_temp_tip')">{{ d.tMax != null ? Math.round(d.tMax) + '°' : '—' }}</span>
            <span class="forecast-rain" :class="{ risk: d.rainPct != null && d.rainPct >= 50 }" :title="t('field.forecast_rain_tip')">
              <i class="ti ti-umbrella"></i>{{ d.rainPct != null ? d.rainPct + '%' : '—' }}
            </span>
          </div>
        </div>
        <p class="forecast-hint">{{ t('field.forecast_hint') }}</p>
      </template>
      <div v-else class="forecast-note">{{ t('field.data_unavailable') }}</div>
    </div>

    <template v-if="isField">
      <div class="detail-section meta-card">
        <p class="detail-card-label">{{ t('field.metadata') }}</p>
        <div class="meta-row"><span>{{ t('field.planting_date') }}</span><b class="mono">{{ plantingText }}</b></div>
        <div class="meta-row"><span>{{ t('field.area') }}</span><b class="mono">{{ formatHectares(areaHa).toUpperCase() }}</b></div>
        <div class="meta-row"><span>{{ t('field.added') }}</span><b class="mono">{{ addedText }}</b></div>
      </div>

      <div class="detail-section photo-card" v-if="currentField">
        <p class="detail-card-label">{{ t('field.photos') }} <span v-if="photos.length" class="mono">{{ photos.length }}</span></p>
        <div class="photo-strip" v-if="photos.length">
          <button
            v-for="(p, i) in photos"
            :key="p.id"
            class="photo-thumb"
            :class="{ 'inhale': p.loading }"
            @click="openPhoto(i)"
          >
            <img v-if="p.url" :src="p.url" :alt="t('field.photo')" loading="lazy" />
          </button>
        </div>
        <p v-else class="photo-empty">{{ t('field.no_photos') }}</p>
      </div>
    </template>

    <div v-if="state.photosLightboxIndex != null" class="photo-lightbox" @click.self="closePhoto">
      <img :src="photos[state.photosLightboxIndex].url" :alt="t('field.photo')" />
      <button class="lightbox-close" @click="closePhoto">&times;</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue'
import Chart from 'chart.js/auto'
import { state, fieldStatus, fieldTrends, setInfoChart, getStageAtDate, fieldConfidence } from '../store'
import * as store from '../store'
import { getOrComputeArea, formatHectares } from '../store'
import ConfidenceBadge from './ConfidenceBadge.vue'
import IndexLegend from './IndexLegend.vue'
import { buildChartConfig } from '../services/chart'
import { INDICES, MONTHS, CONSULT_AI_URL } from '../config'
import { sb, requireSession } from '../services/supabase'
import { loadFieldPhotos, createSignedPhotoUrl } from '../services/supabase'
import { getRecentIndexValue, getRainfallMm, getFieldHealthScore, polygonGeometry } from '../services/earthEngine'
import { getWeatherContext } from '../services/weatherService'
import { getAimCache, setAimCache } from '../services/aimScoreCache'
import { centroid as turfCentroid } from '@turf/turf'
import { formatMonthYear, stageName as stageNameKm, daySinceLabel, formatDate, isSameMonth as isSameMonthDates, toKhmerDigits, confReason } from '../services/format'
import { useI18n } from '../i18n'

const chartCanvas = ref(null)
const consultingAi = ref(false)
const aiExplanation = ref('')
const aiTruncated = ref(false)
const photos = ref([])
let chart = null
let chartResizeObs = null

// Consult AI is gated by plan (profiles.consult_ai_enabled). Show a locked
// state rather than hiding the feature so locked users know it exists.
const aiLocked = computed(() => !!state.supabaseUser && !state.subscription.consultAiEnabled)

// Weather forecast (display-only, see services/weatherService.js)
const wxDays = ref([])
const wxLoading = ref(false)
const wxError = ref(false)
let wxReq = 0

const currentField = computed(() => state.fields.find((f) => f.id === state.currentFieldId) || null)
const isField = computed(() => !!currentField.value)
const { km, t } = useI18n()

// ── AIM composite health score card ─────────────────────────────────────────
// One 0-100 score + a plain-language verdict from ee-data getFieldHealthScore.
// The card hides entirely while loading-failed (aim stays null) and collapses
// to an empty-state when the score outright can't be computed (noData).
const aim = ref(null)
const aimLoading = ref(false)
const aimDetailsOpen = ref(false)
let aimReq = 0

const aimPhrase = computed(() => {
  if (!aim.value || !aim.value.phraseKey) return (aim.value && aim.value.phrase) || ''
  return t(aim.value.phraseKey) || aim.value.phrase
})
const aimReasonText = computed(() => (aim.value && aim.value.primaryReasonKey ? t(aim.value.primaryReasonKey) : ''))
const aimDiscText = computed(() => {
  const d = aim.value && aim.value.discrepancy
  if (!d) return ''
  return t(d.messageKey) || d.message
})
// Component chips — ordered by the server's weights (which are stage-aware).
const aimChips = computed(() => {
  const a = aim.value
  if (!a) return []
  return Object.keys(a.weights).map((name) => ({
    name,
    norm: a.components && a.components[name] != null ? a.components[name] : 0,
    raw: a.rawValues && a.rawValues[name] != null ? a.rawValues[name] : null,
  }))
})

async function loadAim() {
  const field = currentField.value
  if (!field || !state.eeReady) return
  // Scope the score to the scrubbed month (the same {year, month} the map tile
  // and hero NDVI badge use) so the score follows the slider, not "now".
  const m = MONTHS[state.mainMonth]
  const month = m ? { year: m.year, month: m.month } : null
  // Closed/reopened fields reuse the cached score (keyed by field + planting
  // date + scrubbed month) instead of re-running Earth Engine compute — see
  // aimScoreCache.js.
  const cached = getAimCache(field, month)
  if (cached) {
    aim.value = cached
    aimLoading.value = false
    return
  }
  const geom = field.geojson && (field.geojson.geometry || field.geojson)
  if (!geom || !geom.coordinates) return
  const geometry = polygonGeometry(geom.coordinates)
  const req = ++aimReq
  aimLoading.value = true
  getFieldHealthScore(geometry, field.plantingDate || null, (snap) => {
    if (req !== aimReq) return
    aim.value = snap
    aimLoading.value = false
    if (snap) setAimCache(field, snap, month)
  }, month)
}
const status = computed(() => fieldStatus[state.currentFieldId] || null)
const trend = computed(() => fieldTrends[state.currentFieldId] || null)
const conf = computed(() => {
  if (!currentField.value) return null
  if (isObsFallback.value) {
    return {
      tier: 'low',
      reason: isSameMonthObsFallback.value
        ? confReason(state.preferredLanguage, 'cloudBlocked')
        : confReason(state.preferredLanguage, 'noRecentCapture'),
    }
  }
  if (state.cloudBlock.main) {
    return state.cloudBlock.main.sameMonth
      ? { tier: 'low', reason: confReason(state.preferredLanguage, 'cloudBlocked') }
      : { tier: 'low', reason: confReason(state.preferredLanguage, 'noRecentCapture') }
  }
  if (state.radarFallback.main) {
    return { tier: 'medium', reason: confReason(state.preferredLanguage, 'radarBlocked') }
  }
  // When a specific observation is pinned, anchor the confidence badge to
  // that scene's cloud status instead of the field's most-recent-available
  // reading (actionGetRecentIndexValue always looks at "now", not the
  // clicked date, so it can report cloud-blocked even when the user picked
  // a clean scene).
  if (state.selectedObservationDate && Array.isArray(state.observations)) {
    const selObs = state.observations.find((o) => o.date === state.selectedObservationDate)
    if (selObs) {
      if (selObs.status === 'blocked' || (selObs.cloudCover != null && selObs.cloudCover >= 40)) {
        return { tier: 'low', reason: confReason(state.preferredLanguage, 'cloudBlocked') }
      }
      return { tier: 'high', reason: '' }
    }
  }
  return fieldConfidence(currentField.value)
})
const noSceneData = computed(() => !state.loading && state.sceneCount.main === 0)

// When a date is pinned and the server resolved it to honest no_data (cloud
// blocked exact date, no radar substitution: non-NDVI indices, or NDVI with no
// Sentinel-1 pass), the month-scoped AIM score is NOT a reading for THAT date —
// suppress the score and show the no-data state instead of a number out of
// nowhere. Un-pinning (or a radar/optical resolution) restores the score.
const pinnedSceneNoData = computed(() =>
  !!state.selectedObservationDate && state.selectedSceneStatus?.mode === 'no_data'
)

// The AIM card is an OPTICAL health score computed from the month's clean
// scenes — so it must never sit on top of a view whose map is NOT that optical
// index: the pinned radar fallback ("optical blocked by cloud", RVI tile) and
// the cloud-blocked true-color fallback both mean the month/date has no
// readable optical reading, so the score would contradict the hero "—". The
// RVI and True Color tabs are excluded: there the radar/true-color view IS the
// point, not a substitution.
const aimSuppressed = computed(() => {
  if (state.currentIndex === 'rvi' || state.currentIndex === 'truecolor') return false
  return pinnedSceneNoData.value || !!state.radarFallback.main || !!state.cloudBlock.main
})

// The active observation for the currently-scrubbed month. `state.chartData` is
// the per-scene (cloud-free, same collection the map monthly composite uses)
// series that drives the trend chart — deriving the hero from THIS, rather than
// the one-shot 90-day `fieldStatus` query, is what makes the sidebar follow the
// slider date exactly like the map does.
//
// Same-day resolution rule: within the month window pick the LEAST-cloudy scene.
// The series generator (dedupeLowestCloud in ee) already collapses same-day
// duplicate Sentinel-2 orbits to the cleanest one, so this find just needs to
// honor cloudPct as a tie-break in case a duplicate ever slips through.
const selectedMonthWindow = computed(() => {
  const m = MONTHS[state.mainMonth]
  if (!m) return null
  // Compute in UTC so the comparison lines up with chartData's ISO dates
  // (e.g. '2025-11-08' parses as UTC midnight, not local midnight).
  const start = Date.UTC(m.year, m.month - 1, 1)
  const end = Date.UTC(m.year, m.month, 1)
  return { start, end }
})

const activeObservation = computed(() => {
  // Scene-anchored status takes priority when a specific date is pinned: it
  // tried clean optical → Sentinel-1 RVI → honest no-data for THAT exact
  // date, unlike resolveActiveObservation which can only read the optical
  // trend series and silently substitutes a different (clear) date when the
  // pinned one is cloud-blocked.
  const s = state.selectedSceneStatus
  if (s && state.selectedObservationDate) {
    if (s.mode === 'optical' && s.ndviValue != null) {
      return { value: s.ndviValue, date: state.selectedObservationDate, isRadar: false, isNoData: false }
    }
    if (s.mode === 'radar' && s.rviValue != null) {
      return { value: s.rviValue, date: state.selectedObservationDate, isRadar: true, isNoData: false }
    }
    if (s.mode === 'no_data') {
      // Honest no-data — do NOT fall through to a silently substituted date.
      return null
    }
  }
  const obs = store.resolveActiveObservation(state.chartData, state.mainMonth, state.selectedObservationDate)
  return obs ? { value: obs.value, date: obs.date, isRadar: false, isNoData: false } : null
})

// ---- Band-INDEPENDENT date resolution for the growth-stage / day-count
// surface. Growth stage is a property of crop age (planting date + the scrubbed
// month's as-of date) — it must NOT move when the band changes. NDVI/NDWI/LSWI
// used to share one Sentinel-2 series, so the "stays identical" comment was
// accidentally true; RVI is Sentinel-1 (different sensor, revisit cadence,
// every-orbit passes) and would silently drift the day count. THIS anchor is
// therefore populated ONLY from the optical (NDVI) fetch path in store.js
// (state.ndviChartData) — the RVI path never touches it.

// Mirror of activeObservation, but read from the NDVI-anchored series so it
// resolves to the same scene date no matter which band tab is active.
const ndviActiveObservation = computed(() => {
  const obs = store.resolveActiveObservation(state.ndviChartData, state.mainMonth, state.selectedObservationDate)
  return obs ? { value: obs.value, date: obs.date } : null
})

// The scene date the growth-stage logic resolves to:
//   1. True Color mode  -> the capture the user picked (unchanged).
//   2. Otherwise        -> the NDVI-anchored observation date (band-independent).
//      Until an optical series has loaded for this subject, a non-radar band's
//      own scene / last-clear-reading is a safe stand-in (it IS the optical
//      series); the RVI tab's Sentinel-1 dates are never allowed to feed it.
const selectedGrowthDate = computed(() => {
  if (state.currentIndex === 'truecolor' && state.trueColorDate) return state.trueColorDate
  const nd = ndviActiveObservation.value
  if (nd && nd.date) return nd.date
  if (state.currentIndex !== 'rvi') {
    const obs = activeObservation.value
    if (obs && obs.date) return obs.date
    const block = state.cloudBlock.main
    if (block && block.lastValidDate) return block.lastValidDate
  }
  return null
})

const growthAsOfDate = computed(() => {
  const scene = selectedGrowthDate.value
  if (scene) return scene
  const m = MONTHS[state.mainMonth]
  if (m) return monthEndISO(m)
  return new Date().toISOString().slice(0, 10)
})

const stagePrePlanting = computed(() => {
  const f = currentField.value
  if (!f || !f.plantingDate) return false
  return new Date(growthAsOfDate.value).getTime() < new Date(f.plantingDate).getTime()
})

// Reconstruct a date-only string (YYYY-MM-DD) in UTC without the ISO UTC shift
// that could roll a boundary date to the previous day in local time.
// monthEndISO returns the LAST day of the selected month: when the scrubbed
// month has no per-scene observation yet (activeObservation is null), the
// pre-planting check must compare against the month's latest day — not its
// first day. Using month-start (e.g. July 1) made any field planted mid-month
// (July 8) look "before planting" even when the user was viewing July.
function monthEndISO(m) {
  const y = m.year
  const mm = String(m.month).padStart(2, '0')
  const dd = String(new Date(Date.UTC(y, m.month, 0)).getUTCDate()).padStart(2, '0')
  return y + '-' + mm + '-' + dd
}

// The exact scene date currently being VIEWED, matching what drives the map
// overlay and hero NDVI value — NOT a synthetic month-boundary date:
//   1. True Color mode  -> the capture the user picked in the scene picker.
//   2. Index modes       -> the last cloud-free per-scene observation of the
//      selected month (state.chartData is the SAME per-scene series the hero
//      reads, so this is exactly the scene the hero value is showing).
//   3. Fallback          -> the "last clear reading" date (cloud-blocked view),
//      else null so asOfDate takes the explicit month-end last resort below.
const selectedSceneDate = computed(() => {
  if (state.currentIndex === 'truecolor' && state.trueColorDate) return state.trueColorDate
  const obs = activeObservation.value
  if (obs && obs.date) return obs.date
  const block = state.cloudBlock.main
  return block && block.lastValidDate ? block.lastValidDate : null
})

const asOfDate = computed(() => {
  const scene = selectedSceneDate.value
  if (scene) return scene
  const m = MONTHS[state.mainMonth]
  if (m) return monthEndISO(m)
  return new Date().toISOString().slice(0, 10)
})

// Primary month-scoped status -> falls back to the one-shot latest reading only
// while the trend series is still loading (chartData not yet populated).
// NOTE: the as-of DATE passed into buildStatusObject is the NDVI-anchored one
// (growthAsOfDate), not the per-band asOfDate — the "Day N" portion of the
// hero subtitle stays pinned across NDVI/NDWI/LSWI/RVI tabs even though the
// reading value (obs.value) below still comes from the active band.
const monthStatus = computed(() => {
  const f = currentField.value
  const obs = activeObservation.value
  if (!f || !obs || obs.value == null) return null
  // A radar reading (Sentinel-1 RVI) is NOT on the NDVI/NDWI/LSWI 0-1 health
  // scale, so never grade it through buildStatusObject's per-index thresholds
  // unless the user is actually viewing the RVI tab (whose buildStatusObject
  // returns an intentionally-empty badge — RVI is shown, not graded).
  if (obs.isRadar && state.currentIndex !== 'rvi') return null
  return store.buildStatusObject(f, obs.value, state.currentIndex, growthAsOfDate.value)
})

const heroStatus = computed(() => monthStatus.value || (Array.isArray(state.chartData) && state.chartData.length ? null : status.value))

// ONE shared "is the selected date before planting" check, reused by the Growth
// Stage box, the Stress Alert box AND the hero badge so all three always agree
// on pre-planting state (instead of each independently deciding).
const prePlanting = computed(() => {
  const f = currentField.value
  if (!f || !f.plantingDate) return false
  const asOf = new Date(asOfDate.value).getTime()
  const planting = new Date(f.plantingDate).getTime()
  return asOf < planting
})

const title = computed(() => (isField.value ? currentField.value.name : INDICES[state.chartIndex].name + ' ' + t('index.trend')))
const statusText = computed(() => {
  if (heroStatus.value && heroStatus.value.badgeText === '\u2014') return '\u2014'
  if (prePlanting.value) return t('field.pre_planting')
  return (heroStatus.value && heroStatus.value.badgeText) || '\u2014'
})
const statusTone = computed(() => {
  if (prePlanting.value) return 'tone-blue'
  return (heroStatus.value && heroStatus.value.badgeClass) || 'healthy'
})
const stageText = computed(() => {
  if (monthStatus.value && monthStatus.value.stageLabel) return monthStatus.value.stageLabel
  const st = status.value
  if (!st || !st.stageLabel) return ''
  // One-shot fallback: status.stageLabel is built (store.updateFieldStatus) with
  // Date.now() as the as-of date, so "Day N" there drifts from the Growth box.
  // Rebuild from the SAME NDVI-anchored day count the Growth box uses so both
  // surfaces always agree; the reading still comes from the ACTIVE band (RVI
  // on the RVI tab, etc.) — only Day N is band-independent.
  const f = currentField.value
  const days = growthStageDays.value
  const obs = activeObservation.value
  if (f && f.plantingDate && days != null && !stagePrePlanting.value) {
    const stage = store.getGrowthStage(days).stage
    // A radar reading is always labeled RVI (it's Sentinel-1, regardless of the
    // band tab the user has open) so it can never be mistaken for the active
    // optical band's value.
    const bandName = obs && obs.isRadar
      ? 'RVI'
      : (INDICES[state.currentIndex] && INDICES[state.currentIndex].name) || 'NDVI'
    const val = obs && obs.value != null ? ' \u00b7 ' + bandName + ' ' + obs.value.toFixed(2) : ''
    return stageNameKm(state.preferredLanguage, stage) + ' \u00b7 ' + daySinceLabel(state.preferredLanguage, days) + val
  }
  return st.stageLabel
})
const benchmarkText = computed(() => (state.benchmarkValue != null ? state.benchmarkValue.toFixed(3) : '\u2014'))
const heroValue = computed(() => {
  const obs = activeObservation.value
  // Same loading rule as heroStatus: fall back to the latest fieldStatus value
  // ONLY while the trend series hasn't loaded yet. Once chartData is present,
  // the hero reflects the scrubbed month — a cloud-blocked month shows '—'
  // together with the "Last clear reading (fixed reference)" note below.
  if (obs && obs.value != null) return obs.value.toFixed(3)
  if (!Array.isArray(state.chartData) || !state.chartData.length) {
    if (status.value && status.value.value != null) return status.value.value.toFixed(3)
  }
  return '\u2014'
})
const radarMapNote = computed(() => !!state.radarFallback.main)
const heroLastClearDate = computed(() => {
  if (status.value && status.value.date) return status.value.date
  const b = state.cloudBlock.main
  return b && b.lastValidDate ? b.lastValidDate : null
})
const showHeroStaleNote = computed(() => {
  const stale = !!state.radarFallback.main || !!state.cloudBlock.main || !!(status.value && status.value.cloudBlocked)
  // Only surface the note when the scrubbed month has no clear reading of its
  // own (cloud-blocked / radar fallback), so "Last clear reading" unambiguously
  // reads as a fixed reference point, never as the hero value.
  return stale && !!heroLastClearDate.value && !monthStatus.value
})

const displayedSceneDate = computed(() => {
  if (state.currentIndex === 'truecolor') return state.trueColorDate || null
  if (activeObservation.value && activeObservation.value.date) return activeObservation.value.date
  if (heroLastClearDate.value) return heroLastClearDate.value
  return null
})

watch(displayedSceneDate, (val) => {
  state.displayedObservationDate = val
}, { immediate: true })

const isObsFallback = computed(() => {
  if (!state.selectedObservationDate || state.currentIndex === 'truecolor') return false
  // A resolved radar (or optical) reading for the exact pinned date is not a
  // fallback — only resolveActiveObservation's cross-date substitution is.
  const s = state.selectedSceneStatus
  if (s && (s.mode === 'radar' || s.mode === 'optical')) return false
  // Server said honest no-data for the pinned date (non-NDVI cloud-blocked):
  // surface the "no valid scene" note even when there's no cross-reference
  // date to substitute, so the hero isn't a silent "—".
  if (s && s.mode === 'no_data') return true
  const displayed = displayedSceneDate.value
  return !!displayed && displayed !== state.selectedObservationDate
})

const isSameMonthObsFallback = computed(() => {
  if (!isObsFallback.value) return false
  return isSameMonthDates(state.selectedObservationDate, displayedSceneDate.value)
})

const selectedObsRow = computed(() => {
  if (!state.selectedObservationDate || !Array.isArray(state.observations)) return null
  return state.observations.find((o) => o.date === state.selectedObservationDate) || null
})

const obsFallbackNote = computed(() => {
  if (!isObsFallback.value) return ''
  const selDate = state.selectedObservationDate
  const displayed = displayedSceneDate.value
  const obs = selectedObsRow.value
  const cloudStr = obs && obs.cloudCover != null
    ? (state.preferredLanguage === 'km' ? 'ពពក ' + toKhmerDigits(Math.round(obs.cloudCover)) + '%' : Math.round(obs.cloudCover) + '% cloud')
    : (state.preferredLanguage === 'km' ? 'បាំងដោយពពក' : 'cloud-covered')
  const selFmt = formatDate(selDate, state.preferredLanguage)
  const actualFmt = displayed ? formatDate(displayed, state.preferredLanguage) : ''

  if (!displayed) {
    return t('field.obs_fallback_no_data', { selectedDate: selFmt, cloud: cloudStr })
  }
  return isSameMonthObsFallback.value
    ? t('field.obs_fallback_same_month', { selectedDate: selFmt, cloud: cloudStr, actualDate: actualFmt })
    : t('field.obs_fallback_diff_month', { selectedDate: selFmt, cloud: cloudStr, actualDate: actualFmt })
})

// "Showing radar for this exact date" note — distinctly different from
// obsFallbackNote (a cross-date substitution): this IS the exact date, just via
// the Sentinel-1 sensor because optical was cloud-obscured. Surfaced only when
// the server resolved a radar mode for the pinned scene.
const radarSceneNote = computed(() => {
  const s = state.selectedSceneStatus
  if (!s || s.mode !== 'radar' || !state.selectedObservationDate) return ''
  const obs = selectedObsRow.value
  const cloudStr = obs && obs.cloudCover != null
    ? (state.preferredLanguage === 'km' ? 'ពពក ' + toKhmerDigits(Math.round(obs.cloudCover)) + '%' : Math.round(obs.cloudCover) + '% cloud')
    : (state.preferredLanguage === 'km' ? 'បាំងដោយពពក' : 'cloud-covered')
  const selFmt = formatDate(state.selectedObservationDate, state.preferredLanguage)
  return t('field.obs_radar_scene', { selectedDate: selFmt, cloud: cloudStr })
})

// Growth stage is a property of the crop's age (planting date), NOT of the
// selected band — it intentionally does not change when switching between the
// NDVI/NDWI/LSWI tabs. Computed here directly from the planting date instead of
// from status.stageLabel, because stageLabel only carries the band value (e.g.
// "NDWI 0.72") on the non-NDVI tabs.
// Day count uses the scrubbed month's as-of date, NOT the current calendar date,
// so the stage card tracks the slider like every other date-driven surface.
const growthStageDays = computed(() => {
  const f = currentField.value
  if (!f || !f.plantingDate) return null
  const asOf = new Date(growthAsOfDate.value).getTime()
  const planting = new Date(f.plantingDate).getTime()
  const d = Math.floor((asOf - planting) / 86400000)
  return d
})
const stageName = computed(() => {
  const d = growthStageDays.value
  if (d == null) return t('field.no_planting_date')
  if (stagePrePlanting.value) return t('field.stage_future')
  return stageNameKm(state.preferredLanguage, store.getGrowthStage(d).stage)
})
const stageDaysText = computed(() => {
  const d = growthStageDays.value
  if (d == null || d < 0) return '\u2014'
  return t('field.day_since_planting', { day: d })
})
const stagePct = computed(() => {
  const d = growthStageDays.value
  if (d == null || d < 0) return 0
  return Math.min(100, Math.round((d / 120) * 100))
})

const stressTone = computed(() => {
  if (prePlanting.value) return 'tone-blue'
  const cls = heroStatus.value && heroStatus.value.badgeClass
  return cls === 'stressed' ? 'tone-red' : cls === 'moderate' ? 'tone-amber' : 'tone-green'
})
const stressMsg = computed(() => {
  if (prePlanting.value) {
    const f = currentField.value
    return t('field.no_active_crop', { date: f && f.plantingDate ? f.plantingDate : '\u2014' })
  }
  const cls = heroStatus.value && heroStatus.value.badgeClass
  if (cls === 'stressed') return t('field.stress_high')
  if (cls === 'moderate') return t('field.stress_moderate')
  return t('field.stress_healthy')
})

const rainText = computed(() => {
  if (state.rainfallMm != null) return state.rainfallMm.toFixed(0) + ' mm'
  if (!state.eeReady) return t('field.loading')
  return t('field.data_unavailable')
})

// Weather forecast (display-only, see services/weatherService.js). Resolve the
// field's centroid, then fetch a short Open-Meteo forecast via the isolated
// service (cached per location) so reopening a field is cheap.
const fieldCentroid = computed(() => {
  const f = currentField.value
  if (!f) return null
  const geom = (f.geojson && (f.geojson.geometry || f.geojson)) || null
  if (!geom || !geom.coordinates) return null
  if (geom.type === 'Point') return { lng: geom.coordinates[0], lat: geom.coordinates[1] }
  const c = turfCentroid({ type: 'Polygon', coordinates: geom.coordinates })
  return { lng: c.geometry.coordinates[0], lat: c.geometry.coordinates[1] }
})

function dayLabel(date) {
  if (!date) return ''
  const d = new Date(date + 'T00:00:00')
  return d.toLocaleDateString(state.preferredLanguage === 'km' ? 'km-KH' : 'en', { weekday: 'short', day: 'numeric' })
}

async function loadWeather() {
  const c = fieldCentroid.value
  if (!c) { wxDays.value = []; wxLoading.value = false; wxError.value = false; return }
  const req = ++wxReq
  wxLoading.value = true
  wxError.value = false
  try {
    const ctx = await getWeatherContext(c.lat, c.lng)
    if (req !== wxReq) return
    wxDays.value = ctx.days
    wxLoading.value = false
  } catch (e) {
    if (req !== wxReq) return
    wxError.value = true
    wxLoading.value = false
  }
}

const plantingText = computed(() => {
  const f = currentField.value
  if (!f || !f.plantingDate) return '\u2014'
  if (f.plantingDateSource === 'estimated') return f.plantingDate + ' (' + t('field.estimated_from_sat') + ')'
  return f.plantingDate
})
const addedText = computed(() => (currentField.value && currentField.value.createdAt ? new Date(currentField.value.createdAt).toLocaleDateString() : '\u2014'))
const areaHa = computed(() => (currentField.value ? getOrComputeArea(currentField.value) : 0))

async function render(data) {
  const ctx = chartCanvas.value.getContext('2d')
  if (chart) chart.destroy()
  if (chartResizeObs) { chartResizeObs.disconnect(); chartResizeObs = null }
  chart = new Chart(ctx, buildChartConfig(ctx, data, state.chartIndex, false, state.chartIndex === 'rvi' ? null : (date) => getStageAtDate(date), state.benchmarkValue))
  setInfoChart(chart)
  updateMarker()
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  if (chart) chart.resize()
  const card = chartCanvas.value && chartCanvas.value.closest('.chart-card')
  if (card) {
    let resizeTimer = null
    chartResizeObs = new ResizeObserver(() => {
      clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => { if (chart) chart.resize() }, 80)
    })
    chartResizeObs.observe(card)
  }
}

function updateMarker() {
  if (!chart) return
  const m = MONTHS[state.mainMonth]
  chart.options.plugins.currentDateMarker = {
    xValue: new Date(m.year, m.month - 1, 1).getTime(),
    label: formatMonthYear(m.year, m.month, state.preferredLanguage),
  }
  chart.update('none')
}

function onClose() {
  // Just hide the panel — keep the field selected/drawn so the map's edit
  // control and the field's clip stay active. Deselect happens via the card
  // (click again) or the sidebar delete action instead.
  state.infoPanelVisible = false
}

async function loadPhotos() {
  const field = currentField.value
  if (!field || !state.supabaseUser) { photos.value = []; return }
  try {
    const rows = await loadFieldPhotos(field.id)
    photos.value = rows.map((r) => ({ ...r, url: null, loading: true }))
    rows.forEach(async (r, i) => {
      try {
        const url = await createSignedPhotoUrl(r.storage_path)
        if (photos.value[i]) photos.value[i].url = url
      } catch (e) {
        // leave a dead thumb placeholder rather than breaking the panel
      } finally {
        if (photos.value[i]) photos.value[i].loading = false
      }
    })
  } catch (e) {
    photos.value = []
  }
}

function openPhoto(i) {
  state.photosLightboxIndex = i
}

function closePhoto() {
  state.photosLightboxIndex = null
}

function recentValue(geometry, index) {
  return new Promise((resolve) => {
    getRecentIndexValue(geometry, index, ({ value }) => resolve(value))
  })
}

function getRainfall(geometry) {
  return new Promise((resolve) => {
    getRainfallMm(geometry, 21, (mm) => resolve(mm))
  })
}

async function consultAi() {
  if (consultingAi.value) return
  const field = currentField.value
  if (!field) return
  if (!state.supabaseUser) {
    store.showToast(t('toast.sign_in_consult'))
    return
  }
  if (!state.eeReady) {
    store.showToast(t('toast.ee_loading'))
    return
  }
  if (noSceneData.value) {
    store.showToast(t('toast.no_scene'))
    return
  }
  const geom = field.geojson && (field.geojson.geometry || field.geojson)
  if (!geom || !geom.coordinates) {
    store.showToast(t('toast.cant_explain'))
    return
  }
  const geometry = polygonGeometry(geom.coordinates)

  consultingAi.value = true
  aiExplanation.value = ''
  aiTruncated.value = false
  let ndviValue = null
  let lswiValue = null
  let rainfallMm = state.rainfallMm
  try {
    const [ndvi, lswi] = await Promise.all([recentValue(geometry, 'ndvi'), recentValue(geometry, 'lswi')])
    ndviValue = ndvi
    lswiValue = lswi
    if (rainfallMm == null) rainfallMm = await getRainfall(geometry)
    if (ndviValue == null) {
      consultingAi.value = false
      store.showToast(t('toast.no_sat_data'))
      return
    }
  } catch (e) {
    consultingAi.value = false
    store.showToast(t('toast.explain_failed'))
    return
  }

  let growthStage = null
  let dayCount = null
  if (field.plantingDate) {
    const days = Math.floor((new Date(asOfDate.value).getTime() - new Date(field.plantingDate).getTime()) / 86400000)
    if (days >= 0) {
      dayCount = days
      growthStage = store.getGrowthStage(days).stage
    }
  }
  const healthStatus = heroStatus.value && heroStatus.value.badgeText ? heroStatus.value.badgeText : ''
  const confidence = conf.value && conf.value.tier ? conf.value : null

  let token
  try {
    const session = await requireSession()
    token = session.access_token
  } catch (e) {
    consultingAi.value = false
    store.showToast(t('toast.sign_in_continue'))
    return
  }

  try {
    const res = await fetch(CONSULT_AI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({
        fieldId: field.id,
        ndviValue,
        lswiValue,
        rainfallMm,
        status: healthStatus,
        growthStage,
        dayCount,
        confidenceTier: confidence ? confidence.tier : null,
        confidenceReason: confidence ? confidence.reason : '',
        lang: state.preferredLanguage,
      }),
    })
    let body = null
    try { body = await res.json() } catch (e) {}
    if (res.status === 429 || (body && body.ok === false && body.error === 'daily_limit_reached')) {
      store.showToast(t('toast.daily_limit'))
      return
    }
    if (body && body.error === 'missing_data') {
      store.showToast(t('toast.no_sat_data'))
      return
    }
    if (body && body.ok && body.explanation) {
      aiExplanation.value = body.explanation
      aiTruncated.value = !!body.truncated
    } else {
      store.showToast(t('toast.explain_failed'))
    }
  } catch (e) {
    store.showToast(t('toast.explain_failed'))
  } finally {
    consultingAi.value = false
  }
}

watch(() => state.chartData, (data) => {
  if (data && state.infoPanelVisible) render(data)
})
watch(() => state.benchmarkValue, () => {
  if (state.chartData && state.infoPanelVisible) render(state.chartData)
})
watch(() => state.mainMonth, () => { updateMarker(); loadAim() })
watch(() => state.currentFieldId, () => { aiExplanation.value = ''; aiTruncated.value = false; photos.value = []; state.photosLightboxIndex = null; loadPhotos(); aim.value = null; aimDetailsOpen.value = false; loadAim() })
watch(() => currentField.value && currentField.value.id, () => { loadWeather(); loadAim() })
watch(() => state.infoPanelVisible, async (open) => {
  if (open && currentField.value) {
    loadPhotos()
    loadAim()
    if (state.chartData) {
      await nextTick()
      render(state.chartData)
    }
  }
})
// The card is skipped while EE isn't ready; load it the moment it becomes
// available (e.g. field opened during slow login auth/init).
watch(() => state.eeReady, (ready) => { if (ready) loadAim() })
// Re-resolve the scene-anchored status whenever the pinned observation date
// changes for the current field (re-clicking the same strip row, or a field
// switch that re-pins a date) so the sidebar always reflects the exact scene.
watch(() => state.selectedObservationDate, () => { if (isField.value) store.fetchSelectedSceneStatus() })

onBeforeUnmount(() => {
  if (chartResizeObs) { chartResizeObs.disconnect(); chartResizeObs = null }
  if (chart) { chart.destroy(); chart = null }
})
</script>