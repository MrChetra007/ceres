Task: Make the RVI tab scene-aware — clicking a specific Browse Observations date while on RVI should show that exact date's radar reading (±15-day window centered on it), not always the same month-level composite. Also fix the hero value to compute a real RVI number instead of silently reusing the optical NDVI reading.

Root cause confirmed: In ee-data's actionGetIndexTile, the per-scene branch explicitly excludes RVI:

ts
if (index !== "rvi" && payload.sceneDate) { ... }

and the index === "rvi" branch always computes over the scrubbed month window and writes to the month-keyed tile cache — so every date clicked within the same month returns the identical cached tile. Separately, the sidebar hero value for the RVI tab is still being sourced from the optical activeObservation/chartData pipeline (built for NDVI), which is why it shows a number matching the NDVI reading for that date rather than an actual RVI value.

Backend: supabase/functions/ee-data/index.ts

1. Add a per-scene RVI branch to actionGetIndexTile. Move the RVI cache-serving block to after a new scene-date check, mirroring the existing optical per-scene branch's structure but always using radar (no "try optical first" — RVI tab means radar is the explicit ask):

ts
// Per-scene RVI: user clicked a specific date while on the RVI tab. Center a
// ±15-day radar window on THAT exact date instead of the scrubbed month, and
// bypass the month-level tile cache entirely (same reasoning as the optical
// per-scene branch — a per-scene request must never resolve to month-cached
// data for a different date).
if (index === "rvi" && payload.sceneDate) {
const day = ee.Date(payload.sceneDate);
const radar = await getRadarVegetationIndex(
geom,
day.advance(-SCENE_RADAR_WINDOW_DAYS, "day"),
day.advance(SCENE_RADAR_WINDOW_DAYS, "day"),
);
if (radar.count > 0 && radar.url) {
return {
mode: "radar_index",
count: radar.count,
url: radar.url,
indexUsed: "RVI",
sceneDate: payload.sceneDate,
};
}
return { mode: "no_data", count: 0, url: null, sceneDate: payload.sceneDate };
}

Place this before the existing if (index === "rvi") { ... } month-level block, so a scene-dated request never falls through to it or touches readTileCache/writeTileCache.

2. Add a scalar RVI hero-value fetch, forced (not fallback-only). The existing computeSceneStatus (used by getFieldStatus) only computes RVI as a fallback when optical is unavailable for that date — it won't fire when a clean optical scene exists, which is wrong for the RVI tab (we want RVI regardless of whether optical would have worked). Add a forceMode param:

ts
// Same as computeSceneStatus, but when forceMode === 'radar', skips the
// optical-clean-scene check entirely and always computes RVI for the exact
// date — used by the direct RVI tab, where radar is the explicit ask, not a
// fallback for missing optical data.
async function computeSceneStatus(
geom: any,
sceneDateISO: string,
forceMode?: "radar",
): Promise<{ mode: "optical" | "radar" | "no_data"; ndviValue: number | null; rviValue: number | null }> {
const day = ee.Date(sceneDateISO);

if (forceMode !== "radar") {
const cleanDay = s2Collection(geom, day, day.advance(1, "day"));
const cleanCount = await evaluate(cleanDay.size());
if (cleanCount > 0) {
const img = cleanDay.median().normalizedDifference(["B8", "B4"]);
const result = await evaluate(
img.reduceRegion({ reducer: ee.Reducer.mean(), geometry: geom, scale: 10, maxPixels: 1e9 }),
);
return { mode: "optical", ndviValue: result?.nd ?? null, rviValue: null };
}
}

const radar = await reduceRviMean(
geom,
day.advance(-SCENE_RADAR_WINDOW_DAYS, "day"),
day.advance(SCENE_RADAR_WINDOW_DAYS, "day"),
);
if (radar.count > 0 && radar.value != null) {
return { mode: "radar", ndviValue: null, rviValue: radar.value };
}
return { mode: "no_data", ndviValue: null, rviValue: null };
}

3. Thread forceMode through actionGetFieldStatus. Add an optional payload.forceRadar that maps to "radar":

ts
if (payload.sceneDate) {
const scene = await computeSceneStatus(geom, payload.sceneDate, payload.forceRadar ? "radar" : undefined);
...
}
Frontend: src/services/earthEngine.js

Update getFieldStatus to accept and forward a forceRadar flag:

js
export function getFieldStatus(geometry, plantingDate, sceneDate, cb, forceRadar) {
callEE('getFieldStatus', {
geometry,
plantingDate: plantingDate || null,
sceneDate: sceneDate || null,
forceRadar: !!forceRadar,
})
.then((body) => cb(body))
.catch((err) => { fail(err); cb(null) })
}
Frontend: src/store.js

1. Stop excluding RVI from sceneDate. Find (in loadIndexForMonth):

js
const sceneDate = state.currentIndex !== 'truecolor' ? state.selectedObservationDate : null

This already works for RVI too (only truecolor is excluded) — confirm ee.loadIndexTile(m, state.currentIndex, geom, cb, sceneDate) is passing it through unconditionally. If there's any earlier RVI-specific guard stripping sceneDate, remove it.

2. Update fetchSelectedSceneStatus to force radar mode on the RVI tab:

js
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
const forceRadar = state.currentIndex === 'rvi'
ee.getFieldStatus(geometry, field.plantingDate || null, sceneDate, (res) => {
if (req !== selectedSceneStatusReq) return
state.selectedSceneStatus = res
}, forceRadar)
}

3. Re-fetch on tab switch too, not just date change. Currently fetchSelectedSceneStatus is only called from jumpToObservationDate. Add a watch/call in setIndex(index) so switching from NDVI→RVI while a date is already pinned refreshes the hero value:

js
export function setIndex(index) {
const wasRvi = state.currentIndex === 'rvi'
state.currentIndex = index
loadIndexForMonth(state.mainMonth, currentGeometry.value)
if (state.compareMode) loadIndexForMonthRight(state.rightMonth)
if (state.selectedObservationDate) fetchSelectedSceneStatus() // <-- add this
if (index === 'truecolor') return
...
Frontend: src/components/FieldDetailPanel.vue

The existing activeObservation logic from the previous fix should already handle this correctly once selectedSceneStatus.mode === 'radar' is populated for the RVI tab too — verify no additional gating is needed, since that computed already branches on s.mode === 'radar' regardless of which tab triggered it.
