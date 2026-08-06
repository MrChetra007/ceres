# Cloud-Blocked Scene Handling — True-Color Fallback

## Context

This is the NDVI Rice Crop Health Monitor. Currently, when loading a month/date, the app fetches
a Sentinel-2 scene and computes NDVI from it regardless of cloud cover, as long as it's the
selected date. There's no distinction shown between "clean NDVI" and "NDVI computed from a
heavily-clouded scene" — but a heavily-clouded scene produces misleading NDVI values (clouds read
as low/negative NDVI, indistinguishable from real vegetation stress), which can trigger false
stress alerts and false AI-generated advisory text.

## Goal

When the best available scene for a selected date is too cloudy to trust:
- **Do not compute or display NDVI/NDWI/LSWI** for that date
- **Do show the true-color image instead**, so the farmer/user can see for themselves that it's
  cloud cover, not a broken app
- **Show a clear popup/toast explaining why**, including the cloud % and the date of the last
  valid (clean) index reading

When the scene is clean enough, behave exactly as today — no change to that path.

## Threshold

Reuse the existing cloud-filter threshold already used elsewhere in the app: `<40%` cloud cover
(`CLOUDY_PIXEL_PERCENTAGE` on Sentinel-2 `COPERNICUS/S2_SR_HARMONIZED`) = usable, compute the
index as normal. `>=40%` = too cloudy, use the fallback flow below. Do not introduce a second,
different threshold — keep this consistent with the existing scene-count / usability logic.

## Steps

### 1. `src/services/earthEngine.js`

- Wherever the app currently loads a scene/composite for a selected month/date (the NDVI/NDWI/LSWI
  tile-loading function), check the relevant scene's `CLOUDY_PIXEL_PERCENTAGE` before computing
  the index.
- If `< 40`: proceed exactly as today (compute and return the index tile layer).
- If `>= 40`:
  - Instead of computing the index, build a **true-color tile layer** from the same scene
    (`bands: ['B4', 'B3', 'B2']`, reasonable min/max stretch, e.g. `min: 0, max: 3000`).
  - Separately, query for the most recent scene *before* this date that *does* pass the `<40%`
    filter, and return its date as `lastValidDate` (for the popup message). If none exists within
    a reasonable lookback (e.g. 90 days), return `null` and the popup should say no recent valid
    data exists at all, rather than citing a stale/undefined date.
  - Return a result shape that distinguishes this case from the normal one — e.g.
    `{ mode: 'cloud_blocked', tileLayer: <true-color layer>, cloudPct, lastValidDate }` vs. the
    existing `{ mode: 'index', tileLayer: <ndvi layer>, ... }` — so calling code can branch
    cleanly instead of inferring from missing fields.

### 2. Map / tile-loading logic (wherever the result above is consumed — likely `LeafletMap.vue` or the store)

- On `mode: 'cloud_blocked'`, swap in the true-color tile layer instead of the index palette layer.
- Trigger the existing toast system (`showToast()` / `state.toasts`, built in Phase 10) with a
  message like:
  `"☁️ Field is cloud-covered on {selectedDate} ({cloudPct}% cloud) — showing true-color image.
  NDVI can't be reliably calculated. Last valid reading: {lastValidDate}."`
  (or, if `lastValidDate` is null: `"No cloud-free imagery available in the last 90 days."`)
- This should also work in Compare mode (both left and right maps) and for dashboard field-level
  status checks — a field's health badge should reflect its own last-valid reading, not silently
  show a badge computed from a cloud-corrupted scene. Check how field status is computed
  (likely `reduceRegion` over the field polygon) and apply the same `<40%` gate there.

### 3. Visual indicator on the time control / scene-count area (`TimeControl.vue`)

- Reuse the existing scene-count badge pattern (already shows amber for 1–2 scenes). Add a cloud
  icon/badge variant for months where the loaded scene is cloud-blocked, so the user sees this
  before even opening the popup — consistent with the existing low-confidence visual language,
  not a brand-new UI pattern.

### 4. `ee-alerts-worker` (scheduled Telegram alerts)

- Apply the same `<40%` gate to the worker's NDVI computation. If the most recent scene(s) in its
  window are all cloud-blocked such that no clean composite can be formed, this should already be
  covered by the existing `no_data` status path (see Phase 8.6 notes: empty/unusable collections
  log `status = 'no_data'` and are handled by the dedup/severity logic) — verify this is actually
  true when the *only* available scenes are too cloudy, not just when there are literally zero
  scenes. If cloud-heavy scenes are currently slipping through into the worker's NDVI computation
  without a cloud filter, add the same `<40%` check there so the worker never sends an alert based
  on cloud-corrupted data.

## Do not

- Do not loosen the `<40%` threshold to "make more scenes usable" — the point of this feature is
  to correctly handle the cloudy case, not avoid it.
- Do not attempt per-pixel cloud masking (SCL/QA60-based compositing) as part of this — that's a
  larger future upgrade, out of scope here. This feature is scene-level filtering with a true-color
  fallback, nothing more.
- Do not change behavior for scenes that already pass the `<40%` filter.

## Acceptance Checklist

- [ ] Selecting a date/month with a clean (`<40%` cloud) scene behaves identically to today
- [ ] Selecting a date/month with a cloudy (`>=40%`) scene shows true-color imagery, not NDVI
- [ ] A toast/popup explains the cloud % and last valid reading date on the cloud-blocked case
- [ ] Dashboard field health badges never reflect a cloud-corrupted NDVI value
- [ ] `ee-alerts-worker` never sends a Telegram alert based on a cloud-corrupted scene
- [ ] Compare mode handles cloud-blocked scenes correctly on both sides independently
- [ ] `npm run build` passes; all previously working features unaffected
