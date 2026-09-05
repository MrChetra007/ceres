# Implementation Prompt: Correct Cloud-Resilient Satellite Index Flow for Ceres

You are modifying an existing Vue 3 + Vite + Supabase + Google Earth Engine application called **Ceres**, a Cambodia rice-crop monitoring app. Read the existing codebase before changing anything. Do not rewrite the architecture, replace the global reactive store, reintroduce client-side Earth Engine, or create a new authentication flow.

The current architecture is:

- Vue frontend under `src/`.
- Global reactive state and business logic in `src/store.js`.
- Frontend Earth Engine client in `src/services/earthEngine.js`.
- Earth Engine computation through the Supabase Edge Function `supabase/functions/ee-data/`.
- Shared backend logic under `supabase/functions/_shared/`.
- Supabase authentication and database access through the existing services.
- English and Khmer translations under `src/i18n/`.
- Leaflet map layers and Chart.js trend charts already exist.

Your task is to implement a scientifically honest, cloud-resilient data flow for these indices:

```text
Optical Sentinel-2 indices:
- NDVI
- LSWI
- SAVI
- EVI
- GNDVI

Radar Sentinel-1 index:
- RVI
```

The central product rule is:

> Never silently replace an unavailable optical index with an RVI number. If optical data is blocked by cloud, show honest `No data` for that optical index and clearly offer or display Sentinel-1 RVI as a separate radar fallback.

## 1. Index definitions and sensor rules

Implement and preserve these formulas in one backend source of truth, preferably `supabase/functions/ee-data/` or a shared Earth Engine index helper. The frontend must not independently reimplement the formulas.

```text
NDVI  = (NIR - Red) / (NIR + Red)
LSWI  = (NIR - SWIR) / (NIR + SWIR)
SAVI  = 1.5 × (NIR - Red) / (NIR + Red + 0.5)
EVI   = 2.5 × (NIR - Red) / (NIR + 6×Red - 7.5×Blue + 1)
GNDVI = (NIR - Green) / (NIR + Green)
RVI   = 4 × VH / (VV + VH)
```

Use these Sentinel-2 bands:

```text
Blue  = B02
Green = B03
Red   = B04
NIR   = B08
SWIR  = B11 or B12; use the existing project choice consistently
```

RVI must use Sentinel-1 VV and VH backscatter in **linear power units**, not dB. If the Earth Engine Sentinel-1 collection returns dB, convert first:

```javascript
var vvLinear = ee.Image(10).pow(image.select('VV').divide(10));
var vhLinear = ee.Image(10).pow(image.select('VH').divide(10));
var rvi = vvLinear.expression(
  '4 * VH / (VV + VH)',
  { VV: vvLinear, VH: vhLinear }
).rename('RVI');
```

Use Sentinel-1 GRD, IW mode, VV/VH polarization, and a consistent orbit direction for time-series comparisons. Do not describe ascending orbit as “consistent lighting”; describe it as consistent radar viewing geometry.

The formula is mathematically bounded between 0 and 4, although crop observations commonly occupy approximately 0–2. Keep the existing display range of 0–2 only if values above 2 are handled honestly in the legend and statistics. Do not grade RVI through NDVI’s 0–1 thresholds.

## 2. Sentinel-2 cloud and shadow masking

Do not rely only on scene-level `CLOUDY_PIXEL_PERCENTAGE`. Implement or preserve pixel-level cloud and shadow masking using:

1. `COPERNICUS/S2_SR_HARMONIZED` for surface reflectance.
2. `COPERNICUS/S2_CLOUD_PROBABILITY` joined by `system:index`.
3. A configurable cloud-probability threshold, default 50–65.
4. Sentinel-2 SCL masking for cloud shadow, clouds, cirrus, saturated/defective pixels, and other invalid classes.
5. Cloud-shadow projection where practical.
6. A modest cloud-edge buffer to avoid contaminated border pixels.

All five optical indices must use the same valid optical mask for a given observation. If any required band for an index is masked, that index must be masked at that pixel. Never calculate EVI when the blue band is unavailable, and never calculate LSWI when the selected SWIR band is unavailable.

## 3. Temporal composite policy

For monthly map requests, use a clear optical composite with this policy:

```text
Primary optical window: the selected calendar month.
If insufficient clear data: expand to a configurable 45-day window.
If still insufficient: expand to a configurable 90-day window.
If still insufficient: return no_data for the optical index.
```

Use a robust composite such as median over valid pixels. The backend must return metadata for the actual window used. Never display a 90-day composite as if it were a measurement from the selected date.

For every optical response, calculate or return:

```javascript
{
  clearSceneCount,
  validPixelFraction,
  compositeStart,
  compositeEnd,
  observationDate,
  daysSinceObservation,
  cloudProbabilityThreshold,
  confidence
}
```

Use field-level validity for selected fields. A scene that is mostly clear elsewhere but cloudy over the selected field must not be treated as valid for that field.

Suggested configurable defaults:

```text
HIGH_CONFIDENCE_MIN_SCENES = 3
MEDIUM_CONFIDENCE_MIN_SCENES = 1
MIN_VALID_PIXEL_FRACTION = 0.60
STALE_READING_DAYS = 45
MAX_OPTICAL_LOOKBACK_DAYS = 90
```

Do not hard-code these in multiple files. Put them in the existing backend/shared configuration and mirror only the display labels in the frontend.

## 4. Server response contract

Extend or correct the existing `ee-data` response so that the server decides the data mode. The browser must not guess whether an image is cloud-blocked.

Use a discriminated response contract similar to this:

```javascript
{
  mode: 'optical' | 'radar_fallback' | 'no_data' | 'error',
  requestedIndex: 'ndvi' | 'lswi' | 'savi' | 'evi' | 'gndvi' | 'rvi',
  displayedIndex: 'ndvi' | 'lswi' | 'savi' | 'evi' | 'gndvi' | 'rvi' | null,
  value: number | null,
  source: 'sentinel-2' | 'sentinel-1' | null,
  tileUrl: string | null,
  confidence: 'high' | 'medium' | 'low' | null,
  reason: 'clear_optical' | 'cloud_blocked' | 'insufficient_valid_pixels' | 'no_scene' | 'service_error' | null,
  fallbackAvailable: boolean,
  metadata: {
    clearSceneCount: number,
    validPixelFraction: number | null,
    compositeStart: string | null,
    compositeEnd: string | null,
    observationDate: string | null,
    daysSinceObservation: number | null,
    cloudProbabilityThreshold: number | null,
    radarSceneCount: number | null
  }
}
```

Rules:

- For an optical index with sufficient clear Sentinel-2 data, return `mode: 'optical'`, `source: 'sentinel-2'`, and the optical tile/value.
- For an optical index with no reliable optical data, return `mode: 'no_data'`, `value: null`, `tileUrl: null` or a transparent masked layer, and `fallbackAvailable: true` if Sentinel-1 RVI is available.
- Do not return an RVI value in the `value` field while `requestedIndex` is NDVI, LSWI, SAVI, EVI, or GNDVI.
- When the user explicitly selects the RVI tab, calculate and return RVI from Sentinel-1 regardless of whether Sentinel-2 happens to be clear. Return `source: 'sentinel-1'` and `mode: 'optical'` must never be used for RVI.
- If no optical index and no radar fallback can be calculated, return `mode: 'no_data'` with a human-readable reason key.
- Keep the existing exact-date/scene-anchored behavior. A selected date must not silently move to another clear date.

For exact scene/date requests:

```text
Optical tab:
  clean valid optical pixels on that exact date → optical result
  cloud-blocked exact date → no_data for the selected optical index
  optionally report that radar is available for the same date window

RVI tab:
  calculate RVI from Sentinel-1 observations centered on the selected date
  return the radar observation window and orbit metadata
```

The map tile, sidebar hero value, chart point, and observation panel must all use the same server response mode for the same requested month/date.

## 5. Frontend state and UI flow

Preserve the existing `state`, `mapReg`, caching, and `loadIndexForMonth()` patterns. Add or correct state so the UI can distinguish:

```javascript
state.opticalStatus = {
  mode,
  requestedIndex,
  value,
  source,
  confidence,
  reason,
  fallbackAvailable,
  metadata
}

state.radarStatus = {
  available,
  value,
  source: 'sentinel-1',
  confidence,
  observationDate,
  radarSceneCount
}
```

When an optical index is active and cloud-blocked:

- Keep the active index label as NDVI, LSWI, SAVI, EVI, or GNDVI.
- Do not show a fake optical value.
- Show an empty or transparently masked optical layer, not misleading blue/red pixels.
- Show a clear banner: `No reliable Sentinel-2 observation — cloud blocked.`
- Show a secondary action: `View Sentinel-1 RVI`.
- If RVI is displayed automatically, change the visible mode to `Radar RVI fallback` and show the source prominently. Never hide the switch.
- Do not run optical-index stress alerts for a `no_data` response.

When RVI is active:

- Show `Radar RVI` or `Sentinel-1 RVI` in the title, legend, chart subtitle, and tooltip.
- Use the RVI color scale, not the NDVI scale.
- Show VV/VH source information and observation date/window.
- Do not use NDVI thresholds, growth-stage NDVI ranges, or AIM composite scoring to grade RVI.

Recommended user-facing states:

```text
Optical success:
  NDVI 0.62 · Sentinel-2 · 4 clear scenes · High confidence

Optical partial:
  NDVI 0.62 · 68% of field valid · Medium confidence

Optical composite:
  LSWI 0.18 · Composite 01–30 Aug · 3 clear scenes

Optical no data:
  NDVI unavailable · Cloud blocked · Sentinel-1 RVI available

Radar fallback:
  RVI 0.58 · Sentinel-1 radar · 2 scenes · Medium confidence

No sensors:
  No reliable satellite observation for this period
```

Provide equivalent Khmer translations using the existing i18n system. Do not hard-code new English text in Vue components when a translation key should be used.

## 6. Map legends and colors

Each index must have its own legend, palette, label, and explanation. Never reuse the NDVI legend for RVI.

For optical maps, cloudy or invalid pixels must be transparent or explicitly styled as `No data`; they must not be assigned a healthy/stressed color.

For RVI, preserve a dedicated palette and legend. Ensure these surfaces all use the same RVI visualization limits and units:

- Map tile visualization.
- Map legend marker.
- Chart y-axis.
- Health-zone swatches.
- Tooltips.
- Exported reports.

Do not display “good” or “bad” for raw RVI until local RVI thresholds have been calibrated against Cambodian rice observations. Use neutral language such as `low radar vegetation signal`, `moderate radar vegetation signal`, and `strong radar vegetation signal`.

## 7. Trend charts

Do not merge NDVI and RVI as if they were numerically identical.

Implement one of these safe designs, preferably the first:

1. Separate optical and radar series. Show NDVI/LSWI/SAVI/EVI/GNDVI in their own series and RVI in a clearly separate radar series. Mark dates where optical data was unavailable.
2. Use a unified “monitoring signal” chart only if every point retains its source, index name, confidence, and tooltip metadata.

For each chart point, retain:

```javascript
{
  date,
  value,
  index,
  source,
  mode,
  confidence,
  isNoData,
  isFallback,
  observationAgeDays
}
```

When an optical value is missing, leave a gap. Do not interpolate by default. If interpolation is later added, label it explicitly as an estimate and never use it for automated stress alerts.

## 8. Health scores, growth stages, and alerts

Preserve the existing growth-stage-aware logic for optical indices, but make its input source-aware.

- NDVI/SAVI/LSWI/EVI/GNDVI thresholds may be used only with their own calibrated or explicitly documented ranges.
- Never grade RVI using NDVI’s 0–1 thresholds.
- Do not include RVI in the AIM composite score until it has been calibrated against ground observations. Keep RVI out of `healthScoreWeights()` for now.
- When an optical reading is `no_data`, return `status: 'no_data'`, not `stressed`.
- When the reading comes from a widened 90-day optical composite, downgrade confidence and include the older-data explanation.
- When the reading is radar RVI, use a separate radar status such as `radar_signal_change` or `radar_possible_stress`. Do not make a definitive crop-health diagnosis from an uncalibrated RVI threshold.
- Keep the current RVI stress threshold of `0.4` explicitly marked as a placeholder if it remains in code. Do not present it as scientifically validated.
- Telegram alerts must not say “NDVI dropped” when the current reading is radar or no_data.

Safe alert examples:

```text
Optical:
  Possible crop stress: NDVI is below the expected range for the Tillering stage.

Cloud blocked:
  Optical stress assessment paused: Sentinel-2 imagery was blocked by cloud.
  Sentinel-1 radar monitoring remains available.

Radar:
  Radar vegetation signal changed to a low level. This is an early warning only;
  optical confirmation is unavailable because of cloud cover.

No data:
  We could not obtain a reliable optical or radar observation for this period.
```

Update `consult-ai` prompts so the AI receives `index`, `source`, `mode`, `confidence`, `observationAgeDays`, and `reason`. The AI must not describe RVI as NDVI and must not turn `no_data` into a stress diagnosis.

## 9. Observations and exact-date behavior

Keep the existing `fetchSelectedSceneStatus()` and request-counter race protection. Correct the following behavior:

- A selected scene/date must be graded using that exact requested date or explicitly documented radar window.
- Never silently re-anchor a cloud-blocked date to a different clear date.
- On the optical tab, a cloud-blocked exact date returns optical `no_data`.
- On the RVI tab, the same exact date may return a radar value from a documented Sentinel-1 window centered on that date.
- The observation panel must display whether the point is optical, radar, or no_data.
- The map tile and sidebar hero must agree about the selected date and source.

## 10. Caching and cost control

Preserve the existing cache tables and do not bypass them:

- `ee_tile_cache` for index tiles.
- `ee_observation_cache` for exact observations.
- `ee_trend_cache` for monthly field trends.

Include the requested index, source/mode, date range, geometry hash, and relevant cloud/fallback policy in cache keys where necessary. Do not allow an optical NDVI cache entry to be reused as an RVI response or vice versa.

Avoid duplicate Earth Engine requests when switching panels or re-rendering the same month. Keep the existing batch operations for field statuses and trends.

## 11. Required implementation sequence

Implement in this order:

1. Inspect the current frontend and `ee-data` handlers and identify where optical results are currently replaced by radar values.
2. Centralize the index formulas and sensor requirements.
3. Correct Sentinel-2 cloud and shadow masking and add field-level valid-pixel statistics.
4. Correct the server response contract and explicit modes.
5. Correct the frontend store branching and map-layer behavior.
6. Correct the detail panel, legend, charts, observations panel, and export labels.
7. Correct optical alerts, radar alerts, and Consult AI prompts.
8. Add or update English and Khmer translation keys.
9. Preserve caching and authentication behavior.
10. Run tests and manually verify the listed acceptance cases.

Do not make unrelated visual redesigns, payment changes, authentication changes, or database migrations unless strictly required by this task.

## 12. Acceptance tests

The implementation is complete only when all of these cases pass:

### Case A — Clear optical observation

Given a month with at least three clear Sentinel-2 scenes and at least 60% valid field coverage:

- NDVI, LSWI, SAVI, EVI, and GNDVI each display their own correct optical map.
- The source is shown as Sentinel-2.
- The scene count, valid coverage, date range, and confidence are shown.
- No RVI value appears in an optical index card.

### Case B — Partial cloud coverage

Given a field where only part of the pixels are clear:

- Valid pixels display the selected optical index.
- Cloudy pixels are transparent or marked no_data.
- The UI shows valid coverage percentage.
- A low-confidence label appears when the configured threshold is not met.

### Case C — Complete optical cloud blockage

Given no valid Sentinel-2 pixels in the selected period:

- The selected optical index returns `value: null` and `mode: 'no_data'`.
- The UI says optical imagery is cloud blocked.
- The app does not show a fake NDVI, LSWI, SAVI, EVI, or GNDVI value.
- The app offers Sentinel-1 RVI separately if available.
- No optical stress alert is generated.

### Case D — Explicit RVI tab

Given Sentinel-1 VV/VH data is available:

- The RVI tab calculates RVI from linear backscatter.
- The UI labels the layer, chart, and card as Sentinel-1 RVI.
- RVI uses its own color scale and range.
- RVI is not passed through NDVI thresholds or the AIM composite.

### Case E — No optical and no radar data

Given neither sensor has a valid observation:

- The app shows a clear no_data state.
- No stress alert is generated.
- The UI explains the reason without crashing.

### Case F — Exact date selection

Given a selected date with 97% cloud cover and another clear date later in the month:

- The selected date remains selected.
- The optical tab reports no_data for that date rather than silently using the later date.
- The RVI tab may show a radar value only with its documented date window.
- The sidebar hero and map tile agree.

### Case G — Telegram and AI

- Optical alerts use optical language.
- Radar alerts use cautious radar language.
- No-data states use availability language, not crop-stress language.
- Consult AI receives and respects source/mode/confidence metadata.
- Khmer and English messages remain consistent.

## 13. Deliverable format

When finished, report:

1. The exact files changed.
2. The backend response modes and fields added or corrected.
3. The cloud-mask and temporal-composite policy.
4. The optical-to-radar fallback behavior.
5. The UI states implemented.
6. The alert and AI behavior changes.
7. Tests run and their results.
8. Any assumptions that still require calibration with real Cambodian rice-field ground truth.

Do not claim that RVI is a validated crop-health diagnosis until it has been calibrated locally. The product should be transparent: **optical indices when clear, honest no_data when blocked, and clearly labeled Sentinel-1 RVI for radar continuity.**

## References

[1]: https://developers.google.com/earth-engine/tutorials/community/sentinel-2-s2cloudless "Google Earth Engine: Sentinel-2 Cloud Masking with s2cloudless"

[2]: https://developers.google.com/earth-engine/datasets/catalog/COPERNICUS_S2_CLOUD_PROBABILITY "Google Earth Engine: Sentinel-2 Cloud Probability Dataset"

[3]: https://documentation.dataspace.copernicus.eu/APIs/openEO/openeo-community-examples/python/RVI/RVI.html "Copernicus Data Space: Radar Vegetation Index using Sentinel-1"

[4]: https://dataspace.copernicus.eu/data-collections/copernicus-sentinel-missions/sentinel-1 "Copernicus Data Space: Sentinel-1 all-weather monitoring"
