Task: Scope the automatic per-scene radar (RVI) substitution to NDVI only. Every other optical index (NDWI, LSWI, SAVI, EVI, GNDVI) returns an honest no_data_for_scene on a cloud-blocked clicked date — no substitution attempted.

Why: RVI is a defensible stand-in for NDVI specifically (both are canopy-vigor proxies, one optical one radar). It is not a defensible stand-in for NDWI/LSWI (water/moisture indices — different physical quantity) or SAVI/EVI/GNDVI (untested assumption, same risk class as NDVI's, but not validated and not worth extending this week). Showing RVI under any of those labels risks a genuinely wrong reading, not just an approximate one.

1. ee-data/index.ts — actionGetIndexTile, per-scene branch (step 0):

Find the current per-scene cloud-fallback logic (the block that, after checking for a clean optical scene on the exact date, falls through to getRadarVegetationIndex for any non-RVI index). Restrict the radar substitution to NDVI only:

ts
// after checking for a clean optical scene on the exact date and finding none:
if (index === "ndvi") {
const radar = await getRadarVegetationIndex(
geom,
day.advance(-SCENE_RADAR_WINDOW_DAYS, "day"),
day.advance(SCENE_RADAR_WINDOW_DAYS, "day"),
);
if (radar.count > 0 && radar.url) {
return {
mode: "radar_scene_fallback",
count: radar.count,
url: radar.url,
indexUsed: "RVI",
sceneDate: payload.sceneDate,
cloudPct,
};
}
}
// NDWI/LSWI/SAVI/EVI/GNDVI (and NDVI with no radar available either): honest no-data
return {
mode: "no_data_for_scene",
count: 0,
url: null,
sceneDate: payload.sceneDate,
cloudPct,
};

2. ee-data/index.ts — computeSceneStatus (feeds the sidebar hero value via actionGetFieldStatus):

Same restriction. Confirm this function's radar branch only fires when the requested index is "ndvi" — for every other index, a cloud-blocked exact date should return { mode: "no_data", ndviValue: null, rviValue: null } (or equivalent for that index), never attempt reduceRviMean.

3. store.js — loadIndexForMonth:

Confirm the radar_scene_fallback mode handling (added in the earlier NDVI fix) is unaffected — it should still fire correctly for NDVI. No change needed here if it's already gated on receiving that mode string from the server, since the server will now only ever send it for NDVI.

4. FieldDetailPanel.vue:

Confirm obsFallbackNote/radarSceneNote/activeObservation's radar-mode branch is index-agnostic in its rendering (it just displays whatever the server sent) but will now naturally only trigger for NDVI, since NDWI/LSWI/SAVI/EVI/GNDVI will get mode: "no_data" from selectedSceneStatus instead. Add/confirm a plain "No data — cloud blocked" message renders for that case on non-NDVI tabs (should already exist from the earlier no_data_for_scene map-tile handling — just confirm the sidebar hero has the equivalent, not just the map tile).

5. Test: click a cloud-blocked date on the NDVI tab → RVI radar renders with the existing note. Click the same cloud-blocked date on NDWI/LSWI/SAVI/EVI/GNDVI → tile is empty/no-data, hero shows "—"/no-data message, no radar substitution anywhere.
