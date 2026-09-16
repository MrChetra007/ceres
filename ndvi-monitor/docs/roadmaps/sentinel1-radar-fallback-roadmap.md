# Sentinel-1 Radar Fallback — Step-by-Step Build Guide

Goal: when Sentinel-2 optical data is cloud-blocked (>=40% cloud) for the current month/field,
fall back to a real computed index (Radar Vegetation Index, RVI) from Sentinel-1 radar instead
of just showing a true-color placeholder image.

**Access check (do this first, no code):** you already have everything you need. Sentinel-1
(`COPERNICUS/S1_GRD`) is a public Earth Engine collection, same catalog as the Sentinel-2
collection you already query. No new signup, no new API key, no new Cloud Project — it uses the
same `ndvi-monitor` project and OAuth you already have working. The only thing worth confirming
is that S1 actually has usable coverage over your specific AOI/dates — that's Step 0 below.

Give each step below to your AI coding assistant one at a time, in order.

---

## Step 0 — Verify Sentinel-1 coverage in the Earth Engine Code Editor (no app code yet)

Do this manually in `code.earthengine.google.com` before writing any app code — same approach as
your original Phase 1 NDVI proof.

```javascript
// Paste into the Earth Engine Code Editor
var aoi = ee.Geometry.Rectangle([102.985, 12.845, 103.048, 12.898]); // your cement-factory AOI

var s1 = ee.ImageCollection('COPERNICUS/S1_GRD')
  .filterBounds(aoi)
  .filterDate('2026-06-01', '2026-08-01')
  .filter(ee.Filter.eq('instrumentMode', 'IW'))
  .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
  .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'));

print('Scene count:', s1.size());
print('Scene dates:', s1.aggregate_array('system:time_start'));

var image = s1.median().clip(aoi);

// IMPORTANT: S1_GRD returns backscatter in decibels (dB), a log scale — RVI must be
// computed on LINEAR power, not raw dB, or the ratio saturates and renders as a flat,
// uniform color with no real spatial variation (this bit us on the first pass — verify
// you don't hit the same bug before moving to Step 1).
var vvLinear = ee.Image(10).pow(image.select('VV').divide(10));
var vhLinear = ee.Image(10).pow(image.select('VH').divide(10));
var rvi = vhLinear.multiply(4).divide(vvLinear.add(vhLinear)).rename('RVI');

Map.centerObject(aoi, 14);
Map.addLayer(rvi, {min: 0, max: 1, palette: ['blue', 'white', 'green']}, 'RVI');
```

**Checkpoint:** `Scene count` should be > 0 for your date range, and the RVI layer should show
real spatial variation — visible texture/patches, not one flat solid color across the whole AOI.
If it renders as a single uniform color, that's the dB-vs-linear bug above, not a coverage
problem — double-check the linear conversion before assuming there's no usable signal.

If scene count itself is 0, try widening the date range (Sentinel-1 revisit is roughly every
6-12 days depending on region — wider than Sentinel-2's ~5 days) or double-check your AOI
coordinates are correct.

**Confirmed working for this app's AOI (Aug 2026):** 26 scenes over the cement-factory AOI for a
2-month window, and the linear-power version showed real texture/field-boundary-like patterns —
Sentinel-1 coverage is viable here.

---

## Step 1 — Add the radar index function to the app

```
My NDVI app (Vue 3 + Vite, Earth Engine backend, src/services/earthEngine.js) already has a
loadIndexTile() function that computes NDVI/NDWI/LSWI clipped to either a saved field's polygon
or the current AOI's bounds. I want to add a new Sentinel-1-based Radar Vegetation Index (RVI)
function, verified working in the Earth Engine Code Editor with this collection query:

COPERNICUS/S1_GRD, filtered by instrumentMode = 'IW', polarizations VV and VH both present,
filtered to my geometry and date range, .median().clip(geometry), then RVI = (4 * VH) / (VV + VH).

Add a new function getRadarVegetationIndex(geometry, startDate, endDate) in
src/services/earthEngine.js that:
1. Queries COPERNICUS/S1_GRD with the same filters I verified in the Code Editor (IW mode, VV+VH
   present, filterBounds to geometry, filterDate to the range).
2. Returns scene count via .size() the same way the existing NDVI function reports scene count,
   so I can tell if there's no S1 coverage for this period/geometry.
3. If scene count is 0, return { count: 0, url: null } — the caller will handle falling back to
   the true-color mode.
4. If scene count > 0, compute .median().clip(geometry), select VV and VH bands.
   IMPORTANT: S1_GRD returns backscatter in decibels (dB), a log scale. Convert BOTH bands to
   linear power before computing the ratio, or the result saturates into a flat, meaningless
   image (confirmed via manual testing — the raw-dB version rendered as one uniform color with
   zero spatial variation across a real AOI; the linear-power version showed real field-level
   texture):
     var vvLinear = ee.Image(10).pow(vv.divide(10));
     var vhLinear = ee.Image(10).pow(vh.divide(10));
     var rvi = vhLinear.multiply(4).divide(vvLinear.add(vhLinear)).rename('RVI');
   Then return a tile URL via getMap() with palette {min: 0, max: 1, palette: ['blue', 'white',
   'green']} (or reuse whatever palette convention the app's other indices use, but pick a
   visually distinct palette from NDVI's red-yellow-green so users can tell it's a different
   data type).
5. Return { count, url, indexUsed: 'RVI' } on success.

Match the existing code style and error-handling pattern already used by the NDVI/NDWI/LSWI
functions in this file (same date-formatting helpers, same getMap() call pattern, same async/
callback or Promise style already in use).

Show me the new getRadarVegetationIndex() function.
```

---

## Step 2 — Wire it into the cloud-blocked fallback logic

```
My app's loadIndexTile() function (src/services/earthEngine.js) currently returns one of three
modes when checking Sentinel-2 availability for a month/geometry:
- { mode: 'index', count, url } — clean scenes, normal NDVI/NDWI/LSWI composite
- { mode: 'cloud_blocked', count: 0, url, cloudPct, lastValidDate } — all scenes too cloudy,
  shows a true-color fallback image
- { mode: 'no_data', count: 0, url: null } — no scenes at all

I just added getRadarVegetationIndex(geometry, startDate, endDate) (Step 1) which returns
{ count, url, indexUsed: 'RVI' }, using count: 0 / url: null when Sentinel-1 has no coverage.

Update loadIndexTile()'s branching logic:
1. When the Sentinel-2 check would currently return 'cloud_blocked', BEFORE falling back to the
   true-color image, call getRadarVegetationIndex() for the same geometry and a date range
   centered on the same month (widen the window somewhat vs. the Sentinel-2 window, since
   Sentinel-1's revisit cadence is longer — a good starting point is +/- 15 days around the
   month, adjust if Step 0's coverage check suggested otherwise for this AOI).
2. If getRadarVegetationIndex() returns count > 0: return
   { mode: 'radar_fallback', count, url, indexUsed: 'RVI' } instead of the cloud_blocked mode.
3. If getRadarVegetationIndex() also returns count: 0 (no S1 coverage either): fall back to the
   EXISTING true-color cloud_blocked behavior, unchanged — don't remove that fallback, radar is a
   secondary fallback, not a replacement for it.
4. Do not change the 'index' (clean Sentinel-2) or 'no_data' branches at all.

Show me the updated loadIndexTile() function with the new branch.
```

---

## Step 3 — Update the store and UI to show the radar fallback distinctly

```
My app's store (src/store.js) currently has state.cloudBlock = { main, right } and
loadIndexForMonth() / loadIndexForMonthRight() functions that branch on loadIndexTile()'s mode
(from Step 2: 'index' | 'cloud_blocked' | 'radar_fallback' | 'no_data').

Update the store and UI:
1. In store.js, when mode is 'radar_fallback', set a new state field (e.g. state.radarFallback =
   { main, right }) alongside the existing cloudBlock state, so the UI can distinguish "showing
   true-color, no data" from "showing real radar-derived data."
2. In TimeControl.vue, when state.radarFallback is active for the current view, replace the
   existing "☁️ cloud-blocked" pill with a distinct "📡 Radar view (RVI)" pill — different icon,
   different color from the cloud-blocked pill so it's visually distinguishable at a glance.
3. Add a tooltip/popover on that pill (reuse the same tooltip pattern from the cloud-blocked pill
   if one exists) explaining: "Optical satellite blocked by cloud — showing a radar-based
   vegetation signal (RVI) instead. This measures a different thing than NDVI and isn't directly
   comparable — treat it as a rough structural/moisture indicator, not a health score."
4. Update the confidence badge (getConfidenceTier in store.js) so a radar_fallback view scores as
   Medium confidence rather than Low — it has real data, just from a different, less-validated
   source than a clean NDVI reading. Keep true cloud_blocked (no radar coverage either) as Low,
   unchanged.
5. Do NOT feed the RVI value into the existing growth-stage-aware NDVI threshold system
   (buildStatusText()) or blend it into NDVI-based health status — keep it displayed as its own
   distinct index, not merged into NDVI scoring. This keeps the two measurement types honest and
   separate.

Show me the updated store.js state/logic and the updated TimeControl.vue pill/tooltip.
```

---

## Step 4 — Test and verify

Not an AI prompt — do this yourself after Steps 1-3 are merged:

1. Force a cloud-blocked month in the app (pick a known heavily-cloudy month from your CHIRPS/dry-month data, or wait for a real one).
2. Confirm the pill now shows "📡 Radar view (RVI)" instead of "☁️ cloud-blocked" when Sentinel-1 has coverage.
3. Confirm the map actually renders the RVI tile (blue/white/green palette), not a blank layer.
4. Confirm the confidence badge shows Medium, not Low, for this state.
5. Test a case where BOTH Sentinel-2 and Sentinel-1 have no coverage (rare, but possible) — confirm it still correctly falls back to the original true-color `cloud_blocked` mode, not a broken/blank state.
6. Check this on both a saved field's clipped geometry AND the general AOI view (no field selected) — the per-field clipping needs to work for radar the same way it already does for NDVI.

---

## Notes

- RVI is a rough proxy, not a validated agricultural metric for Cambodian rice specifically —
  same honesty rule you already apply to the growth-stage curve and rainfall correlation. Worth
  saying so if asked in a demo/pitch context.
- Sentinel-1's longer revisit cadence means radar won't always have coverage either, especially
  for a small AOI — Step 0's manual check is what tells you whether this is worth building at all
  for your specific area before you invest time in Steps 1-3.
- Keep this scoped to a fallback display only. Don't try to reconcile or average RVI with NDVI
  values, and don't wire it into Consult AI or the Telegram alert worker in this pass — those can
  come later once the basic display is verified working.
