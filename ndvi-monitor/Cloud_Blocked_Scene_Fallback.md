# Data Trust Layer — Cloud-Blocked Fallback + Unified Confidence Badge

## Context

This is the NDVI Rice Crop Health Monitor. Currently, when loading a month/date, the app fetches
a Sentinel-2 scene and computes NDVI from it regardless of cloud cover, as long as it's the
selected date. There's no distinction shown between "clean NDVI" and "NDVI computed from a
heavily-clouded scene" — but a heavily-clouded scene produces misleading NDVI values (clouds read
as low/negative NDVI, indistinguishable from real vegetation stress), which can trigger false
stress alerts and false AI-generated advisory text.

## Two Features In This Doc

This file covers two related pieces that should be built together:

1. **Cloud-blocked scene fallback** — when the best available scene is too cloudy, show
   true-color imagery instead of computing NDVI from it, with a popup explaining why.
2. **Unified confidence badge** — a single, consistent 🟢🟡🔴 indicator shown everywhere NDVI
   appears, so a farmer or judge can tell at a glance how much to trust what they're looking at.
   This aggregates signals the app already computes (cloud %, scene count, data age, whether the
   planting date was manually entered or auto-estimated) — it does not require new Earth Engine
   calls, only new UI/labeling logic layered on existing data.

Build the cloud-blocked fallback first (Part A below) since the confidence badge (Part B) depends
on the `mode: 'cloud_blocked'` signal it introduces.

---

# Part A — Cloud-Blocked Scene Fallback

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
  - Separately, query for the most recent scene _before_ this date that _does_ pass the `<40%`
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
  true when the _only_ available scenes are too cloudy, not just when there are literally zero
  scenes. If cloud-heavy scenes are currently slipping through into the worker's NDVI computation
  without a cloud filter, add the same `<40%` check there so the worker never sends an alert based
  on cloud-corrupted data.

## Part A — Do not

- Do not loosen the `<40%` threshold to "make more scenes usable" — the point of this feature is
  to correctly handle the cloudy case, not avoid it.
- Do not attempt per-pixel cloud masking (SCL/QA60-based compositing) as part of this — that's a
  larger future upgrade, out of scope here. This feature is scene-level filtering with a true-color
  fallback, nothing more.
- Do not change behavior for scenes that already pass the `<40%` filter.

---

# Part B — Unified Confidence Badge

## Problem

Trust signals already exist in the app, but scattered and inconsistent: the scene-count badge
(amber for 1–2 scenes) lives on the time control; rainfall context on stress alerts is phrased
cautiously ("likely," "unlikely the cause"); the growth-stage phenology curve is a published
approximation, not field-validated locally; `no_data` is a worker-side status with no strong
frontend equivalent; and Part A above adds a cloud-blocked state. None of these combine into one
answer to the question a farmer or judge actually has: **"right now, how much should I trust
this?"**

## Goal

A single 3-tier badge, computed once per field/view and shown consistently everywhere NDVI or
NDVI-derived status appears: the map legend, dashboard field cards, the field detail panel, and
referenced in the AI advisory text itself (Phase 13 Feature 1). Same three tiers, same colors,
same meaning everywhere — never a different confidence vocabulary in different components.

## Tiers

- 🟢 **High confidence** — most recent scene is clean (`<40%` cloud, per Part A), 3+ cloud-free
  scenes available in the current period (reuse the existing scene-count logic), and the field's
  planting date was manually entered (not auto-estimated).
- 🟡 **Medium confidence** — degraded but still usable. Any of: only 1–2 cloud-free scenes this
  period, OR the planting date was auto-estimated via LSWI spike (Phase 13 Feature 3) and not yet
  confirmed/adjusted by the farmer.
- 🔴 **Low confidence / stale** — any of: current view is cloud-blocked (Part A's
  `mode: 'cloud_blocked'`), worker status is `no_data`, or the last valid reading is older than a
  defined staleness threshold (suggest 21 days — roughly one full growth-stage-monitoring cycle —
  but make this a named constant, not a magic number, so it's easy to tune).

Compute the worst applicable tier — e.g. a field with 3+ scenes but an unconfirmed auto-estimated
planting date is 🟡, not 🟢, because any one degrading factor should pull the badge down.

## Implementation

1. **Add a single scoring function**, e.g. `getConfidenceTier(field, sceneInfo)` in `store.js` or
   a new small module — takes the signals already available (cloud %, scene count, planting-date
   source, data age, worker status if applicable) and returns `'high' | 'medium' | 'low'` plus a
   short human-readable reason string (e.g. `"Planting date estimated from satellite data"` or
   `"Only 1 cloud-free scene this month"`) for use in tooltips/popups. Don't scatter this logic
   across components — one function, one source of truth, called wherever the badge is rendered.

2. **Track planting-date source**: add a `planting_date_source` column to `fields`
   (`'manual' | 'estimated'`), set by the Phase 13 auto-planting-date feature. This is required
   input for the confidence scoring — without it, medium-confidence estimated dates can't be
   distinguished from confirmed ones.

3. **Badge component**: a small reusable `ConfidenceBadge.vue` (dot + label, matching the existing
   design tokens — reuse `--accent`/`--amber`/`--red` from the design system rather than inventing
   new colors) that takes a tier and renders consistently. Use it in:
   - `MapLegend.vue` — reflects the currently-viewed date/field
   - Dashboard field cards (`Sidebar.vue`) — reflects each field's current tier
   - `FieldDetailPanel.vue` — reflects the active field, with the reason string visible (not just
     the dot) since this is where a user is already looking for detail
   - Compare mode — each side gets its own independent badge

4. **Tie into AI advisory text** (Phase 13 Feature 1): pass the confidence tier + reason into the
   LLM prompt, and instruct the model to adjust its own hedging language accordingly — e.g. a 🔴
   low-confidence field should produce advisory text that explicitly says data is stale/uncertain
   rather than confidently describing a "trend" that might just be a data gap. This is a prompt
   instruction, not new plumbing — the confidence signal is already being computed for the badge.

5. **`ee-alerts-worker`**: when a field's tier is 🔴 (cloud-blocked or `no_data`), the LLM-generated
   Telegram message (Feature 1) should say so plainly — e.g. "We haven't had a clear satellite
   view of your field in over 3 weeks, so we can't confirm current health" — rather than staying
   silent (current `no_data` behavior logs but doesn't message) or, worse, describing a status
   with unwarranted confidence. Decide explicitly: should a 🔴 no-data field ever trigger a
   Telegram message ("we can't currently monitor your field"), or stay silent per existing dedup
   logic? Recommend: send one such message when a field _transitions into_ extended `no_data`
   (e.g. crosses the staleness threshold), not on every worker run, to avoid alert fatigue.

## Part B — Do not

- Do not invent a fourth tier or a numeric score (e.g. "73% confidence") — three tiers with plain
  reasons are more honest and more useful to a non-technical farmer than a fake-precise number.
- Do not compute confidence per-pixel or per-pass — this is a per-field, per-current-view signal,
  not a new geospatial computation.
- Do not let the badge silently disagree with itself across components — if the map legend and a
  dashboard card show different tiers for the same field at the same time, that's a bug, not a
  nuance; both should call the same scoring function.

## Acceptance Checklist

**Part A — Cloud-blocked fallback**

- [ ] Selecting a date/month with a clean (`<40%` cloud) scene behaves identically to today
- [ ] Selecting a date/month with a cloudy (`>=40%`) scene shows true-color imagery, not NDVI
- [ ] A toast/popup explains the cloud % and last valid reading date on the cloud-blocked case
- [ ] Dashboard field health badges never reflect a cloud-corrupted NDVI value
- [ ] `ee-alerts-worker` never sends a Telegram alert based on a cloud-corrupted scene
- [ ] Compare mode handles cloud-blocked scenes correctly on both sides independently

**Part B — Confidence badge**

- [ ] `getConfidenceTier()` is the single source of truth, called from every place the badge renders
- [ ] Badge tier and reason are consistent across map legend, dashboard, detail panel, and compare mode
- [ ] `planting_date_source` correctly distinguishes manual vs. LSWI-estimated dates
- [ ] AI advisory text (Telegram + Consult AI) hedges appropriately when confidence is medium/low
- [ ] A field crossing into extended `no_data` triggers exactly one "can't monitor" message, not
      one per worker run
- [ ] `npm run build` passes; all previously working features unaffected
