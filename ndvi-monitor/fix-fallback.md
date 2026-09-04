Found it. This confirms my suspicion exactly — and it's a third, independent fallback path, completely disconnected from both fixes we've made so far.

Root cause: activeObservation (and therefore heroValue, stageText, displayedSceneDate, isObsFallback, obsFallbackNote) is built entirely from store.resolveActiveObservation(state.chartData, ...). And state.chartData is populated by ee.getIndexTimeSeries/getFieldBundle's chartTrend — which is an optical-only series, server-side filtered to CLOUDY_PIXEL_PERCENTAGE < 40. A 97%-cloud date like Aug 17 was never capable of appearing in that series at all. So:

js
if (selectedObservationDate) {
const s = within.find((x) => x.date === selectedObservationDate) // Aug 17 never in here
if (s && s.value != null) return {...}
}
const lowest = pickLowestCloud(within) // <- falls back to Aug 12 within the same month

This code has zero awareness of RVI or the backend's per-scene radar fallback. It doesn't matter that ee-data now correctly returns Sentinel-1 radar for Aug 17 and the map tile renders it — the sidebar hero card, growth-stage box, and confidence badge are all sourced from a completely different, optical-only pipeline that was never touched by either fix so far. That's exactly the message you're seeing: "No valid scene for Aug 17 (97% cloud) — showing reading from Aug 12" is obsFallbackNote, built from isObsFallback, built from displayedSceneDate = Aug 12 (from resolveActiveObservation's within-month optical fallback).

To fix this properly, the sidebar needs its own scene-anchored data source — the actionGetFieldStatus (with sceneDate) we already added server-side, which tries clean optical → RVI → honest no-data, exactly like the tile does. Right now nothing on the frontend calls it.

Here's the plan, concretely:

1. Add a wrapper in earthEngine.js:

js
export function getFieldStatus(geometry, plantingDate, sceneDate, cb) {
callEE('getFieldStatus', { geometry, plantingDate: plantingDate || null, sceneDate: sceneDate || null })
.then((body) => cb(body))
.catch((err) => { fail(err); cb(null) })
}

2. In store.js, add reactive state + a fetch that fires whenever a cloud-blocked observation is selected (i.e. when resolveActiveObservation would otherwise fall back):

js
// new state field
selectedSceneStatus: null, // { mode, ndviValue, rviValue, status, stage } for the pinned sceneDate, or null

export function fetchSelectedSceneStatus() {
const field = state.fields.find((f) => f.id === state.currentFieldId)
const sceneDate = state.selectedObservationDate
if (!field || !sceneDate || !state.eeReady) { state.selectedSceneStatus = null; return }
const geom = field.geojson && (field.geojson.geometry || field.geojson)
if (!geom || !geom.coordinates) return
ee.getFieldStatus(polygonGeometry(geom.coordinates), field.plantingDate, sceneDate, (res) => {
state.selectedSceneStatus = res
})
}

Call this from jumpToObservationDate (right alongside setting state.selectedObservationDate = dateStr).

3. In FieldDetailPanel.vue, activeObservation needs to check state.selectedSceneStatus first, before falling back to resolveActiveObservation:

js
const activeObservation = computed(() => {
const s = state.selectedSceneStatus
if (s && state.selectedObservationDate) {
if (s.mode === 'optical') return { value: s.ndviValue, date: state.selectedObservationDate }
if (s.mode === 'radar') return { value: s.rviValue, date: state.selectedObservationDate, isRadar: true }
if (s.mode === 'no_data') return null // let the no-data UI show, not a silently substituted date
}
const obs = store.resolveActiveObservation(state.chartData, state.mainMonth, state.selectedObservationDate)
return obs ? { value: obs.value, date: obs.date } : null
})

This is a bigger change than the previous two — it needs a new hero-display treatment for isRadar: true (RVI values aren't on NDVI's 0–1 healthy/stressed scale, so statusTone/statusText/buildStatusObject shouldn't try to grade it as NDVI), and obsFallbackNote should stop firing once a real radar reading exists for that date.

Given the size of this, do you want me to write out the complete patch for all three files (earthEngine.js, store.js, FieldDetailPanel.vue) in one pass, or tackle it one file at a time so you can test incrementally?

how about you give me a clear prompt where to fix what code to replace... get it?

Here's a copy-paste-ready prompt for your AI, with exact locations and before/after code for all three files.

Task: Wire the sidebar (hero NDVI, growth stage, confidence badge) to the scene-anchored getFieldStatus backend action, so a cloud-blocked observation date shows its real Sentinel-1 RVI reading instead of silently falling back to a different date's optical reading.

Context: The map tile already correctly renders RVI for a cloud-blocked clicked date (via sceneDate threading into ee-data's getIndexTile). The sidebar does NOT — it derives activeObservation purely from state.chartData, an optical-only series that never contains cloud-blocked dates, so resolveActiveObservation() silently substitutes the nearest clear date within the same month. The backend action getFieldStatus already supports a sceneDate param that tries clean optical → Sentinel-1 RVI → honest no-data for that exact date — nothing on the frontend calls it yet.

File 1: src/services/earthEngine.js

Add this new export (anywhere near the other getX wrappers, e.g. after getRecentIndexValue):

js
// Scene-anchored field status — tries a clean optical scene on the exact
// sceneDate, then Sentinel-1 RVI centered on that date, then an honest
// no-data result. Used by FieldDetailPanel to make the sidebar (hero value,
// growth stage, confidence) follow the exact clicked observation date instead
// of silently falling back to a different date's optical reading.
export function getFieldStatus(geometry, plantingDate, sceneDate, cb) {
callEE('getFieldStatus', {
geometry,
plantingDate: plantingDate || null,
sceneDate: sceneDate || null,
})
.then((body) => cb(body))
.catch((err) => {
fail(err)
cb(null)
})
}
File 2: src/store.js

2a. Add new state field. Find this block:

js
selectedObservationDate: null,
// The actual observation date currently rendered in the sidebar reading/growth stage.
// When a cloud-blocked or no-data scene is selected, this points to the fallback scene.
displayedObservationDate: null,

Replace with:

js
selectedObservationDate: null,
// The actual observation date currently rendered in the sidebar reading/growth stage.
// When a cloud-blocked or no-data scene is selected, this points to the fallback scene.
displayedObservationDate: null,
// Scene-anchored status for the currently pinned selectedObservationDate,
// from ee-data getFieldStatus (mode: 'optical' | 'radar' | 'no_data' | null).
// Populated by fetchSelectedSceneStatus(); null when no observation is pinned.
selectedSceneStatus: null,

2b. Add the fetch function. Place it right after jumpToObservationDate (find that function, add this immediately below its closing }):

js
// Fetches the scene-anchored status (optical clean scene / Sentinel-1 RVI /
// honest no-data) for state.selectedObservationDate, via ee-data getFieldStatus.
// This is what lets the sidebar show a real RVI reading for a cloud-blocked
// clicked date instead of silently substituting a different date's optical
// value (which is all state.chartData / resolveActiveObservation can do).
export function fetchSelectedSceneStatus() {
const sceneDate = state.selectedObservationDate
if (!sceneDate || !state.eeReady || state.currentIndex === 'truecolor') {
state.selectedSceneStatus = null
return
}
const field = state.fields.find((f) => f.id === state.currentFieldId)
if (!field) { state.selectedSceneStatus = null; return }
const geom = field.geojson && (field.geojson.geometry || field.geojson)
if (!geom || !geom.coordinates) { state.selectedSceneStatus = null; return }
const geometry = polygonGeometry(geom.coordinates)
const req = ++selectedSceneStatusReq
ee.getFieldStatus(geometry, field.plantingDate || null, sceneDate, (res) => {
if (req !== selectedSceneStatusReq) return // stale response — a newer click superseded this one
state.selectedSceneStatus = res
})
}

Add the request-guard counter near the other module-level let counters (e.g. next to let cloudToastShown = false):

js
let selectedSceneStatusReq = 0

2c. Call it whenever the pinned date changes. Find jumpToObservationDate:

js
export function jumpToObservationDate(dateStr) {
const d = new Date(dateStr)
if (isNaN(d.getTime())) return
const target = MONTHS.findIndex((m) => m.year === d.getFullYear() && m.month === d.getMonth() + 1)
if (target < 0) return
state.mainMonth = target
state.selectedObservationDate = dateStr
if (state.currentIndex === 'truecolor') state.trueColorDate = dateStr
loadIndexForMonth(target, currentGeometry.value)
}

Replace with:

js
export function jumpToObservationDate(dateStr) {
const d = new Date(dateStr)
if (isNaN(d.getTime())) return
const target = MONTHS.findIndex((m) => m.year === d.getFullYear() && m.month === d.getMonth() + 1)
if (target < 0) return
state.mainMonth = target
state.selectedObservationDate = dateStr
if (state.currentIndex === 'truecolor') state.trueColorDate = dateStr
loadIndexForMonth(target, currentGeometry.value)
fetchSelectedSceneStatus()
}

2d. Clear it when selection is cleared. Find loadField(field) — right after this line:

js
state.selectedObservationDate = null
state.displayedObservationDate = null

add:

js
state.selectedSceneStatus = null

Also find clearFieldSelection() — right after:

js
state.selectedObservationDate = null
state.displayedObservationDate = null

add the same line:

js
state.selectedSceneStatus = null
File 3: src/components/FieldDetailPanel.vue

3a. Make activeObservation check selectedSceneStatus first. Find:

js
const activeObservation = computed(() => {
const obs = store.resolveActiveObservation(state.chartData, state.mainMonth, state.selectedObservationDate)
return obs ? { value: obs.value, date: obs.date } : null
})

Replace with:

js
const activeObservation = computed(() => {
// Scene-anchored status takes priority when a specific date is pinned: it
// tried clean optical → Sentinel-1 RVI → honest no-data for THAT exact
// date, unlike resolveActiveObservation which can only read the optical
// trend series and silently substitutes a different (clear) date when the
// pinned one is cloud-blocked.
const s = state.selectedSceneStatus
if (s && state.selectedObservationDate) {
if (s.mode === 'optical' && s.ndviValue != null) {
return { value: s.ndviValue, date: state.selectedObservationDate, isRadar: false }
}
if (s.mode === 'radar' && s.rviValue != null) {
return { value: s.rviValue, date: state.selectedObservationDate, isRadar: true }
}
if (s.mode === 'no_data') {
return null // honest no-data — do NOT fall through to a different date
}
}
const obs = store.resolveActiveObservation(state.chartData, state.mainMonth, state.selectedObservationDate)
return obs ? { value: obs.value, date: obs.date, isRadar: false } : null
})

3b. Stop the stale "fallback to a different date" note from firing when a real radar reading exists. Find:

js
const isObsFallback = computed(() => {
if (!state.selectedObservationDate || state.currentIndex === 'truecolor') return false
const displayed = displayedSceneDate.value
return !!displayed && displayed !== state.selectedObservationDate
})

Replace with:

js
const isObsFallback = computed(() => {
if (!state.selectedObservationDate || state.currentIndex === 'truecolor') return false
// A resolved radar (or optical) reading for the exact pinned date is not a
// fallback — only resolveActiveObservation's cross-date substitution is.
const s = state.selectedSceneStatus
if (s && (s.mode === 'radar' || s.mode === 'optical')) return false
const displayed = displayedSceneDate.value
return !!displayed && displayed !== state.selectedObservationDate
})

3c. Add a "showing radar" note for the radar case (distinct from the existing obsFallbackNote, since this isn't a fallback to a different date — it's a legitimate reading of the exact date via a different sensor). Add this computed near obsFallbackNote:

js
const radarSceneNote = computed(() => {
const s = state.selectedSceneStatus
if (!s || s.mode !== 'radar' || !state.selectedObservationDate) return ''
const obs = selectedObsRow.value
const cloudStr = obs && obs.cloudCover != null
? (state.preferredLanguage === 'km' ? 'ពពក ' + toKhmerDigits(Math.round(obs.cloudCover)) + '%' : Math.round(obs.cloudCover) + '% cloud')
: (state.preferredLanguage === 'km' ? 'បាំងដោយពពក' : 'cloud-covered')
const selFmt = formatDate(state.selectedObservationDate, state.preferredLanguage)
// Reuses field.obs_fallback_same_month's shape but swaps the meaning —
// add a dedicated i18n key (field.obs_radar_scene) if you want distinct
// wording; falling back to English here is safe in the meantime.
return selFmt + ' — ' + cloudStr + ', showing Sentinel-1 radar (RVI)'
})

3d. Render it in the template. Find:

html
<p v-if="obsFallbackNote" class="hero-stale-note obs-fallback-note">
<i class="ti ti-info-circle"></i>
<span>{{ obsFallbackNote }}</span>
</p>
<p v-else-if="showHeroStaleNote" class="hero-stale-note">{{ t('field.last_clear_reading', { date: heroLastClearDate }) }}</p>

Replace with:

html
<p v-if="radarSceneNote" class="hero-stale-note radar-scene-note">
<i class="ti ti-satellite"></i>
<span>{{ radarSceneNote }}</span>
</p>
<p v-else-if="obsFallbackNote" class="hero-stale-note obs-fallback-note">
<i class="ti ti-info-circle"></i>
<span>{{ obsFallbackNote }}</span>
</p>
<p v-else-if="showHeroStaleNote" class="hero-stale-note">{{ t('field.last_clear_reading', { date: heroLastClearDate }) }}</p>

3e. Watch selectedObservationDate so switching fields/re-clicking refreshes it. Add near the other watch(...) calls at the bottom:

js
watch(() => state.selectedObservationDate, () => { if (isField.value) store.fetchSelectedSceneStatus() }
