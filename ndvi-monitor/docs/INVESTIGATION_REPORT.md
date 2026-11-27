# Ceres Investigation Report

**Scope:** read-only investigation of `D:\SAAS\NDVI\ndvi-monitor` against the test case in `docs/features/ceres-investigation-prompt.md`.
**Date:** 2026-11-27
**Test field:** `srea sdav` (`03be58a4-daf2-45a3-924d-999b3cb69439`), rice, 3.18 ha, planted 2026-07-08.
**Nothing was edited, deployed, migrated or written to the database.** The only file created is this report.

**Labels:** **CONFIRMED** = seen in code/output; **LIKELY** = inferred from code plus known Earth Engine/Supabase behaviour; **UNKNOWN** = not verifiable in this environment.

---

## 1. Summary

| # | Issue | Status | Severity | Files |
|---|---|---|---|---|
| A | `change_14d_pct` is not a 14-day change — it is "latest vs. the most recent point at least 14 days older", which can be months | CONFIRMED | Medium | `src/services/fieldExport.js`, `src/components/FieldDetailPanel.vue`, `src/components/TodayTriage.vue`, `supabase/functions/ee-alerts-worker/index.ts`, `supabase/functions/consult-ai/index.ts` |
| A | The five call sites use the same *rule* but different series/windows/masks, so the percentage can differ | CONFIRMED | Medium | same as above |
| B | SAVI/EVI run on raw S2 digital numbers (no ÷10000), so EVI is not on the documented 0–1 scale and can be ~2.05 | CONFIRMED | High | `supabase/functions/ee-data/index.ts:113-150` |
| B | Exported `aim.components` are actually `rawValues`, not the normalized components used by the score | CONFIRMED | Medium | `src/services/fieldExport.js:243-252` |
| B | EVI 2.0512 is clamped to 1.0 before scoring; the 84 reproduces exactly | CONFIRMED | — | `ee-data/index.ts:1426-1435`, `1681-1686` |
| B | Cloud-edge buffer constant says 300 m but code dilates 2 pixels; not used | CONFIRMED | Low | `_shared/cloudMask.ts:22,104` |
| C | Confidence does consider image age (client >21 d = low; server 14 d vs 90 d fallback) | CONFIRMED | — | `src/store.js:2941-2967`, `ee-data/index.ts:1552-1585` |
| C | The hero badge does not normally show the scene date/age next to the status | CONFIRMED | Medium | `FieldDetailPanel.vue:79-99,897-918` |
| C | Sentinel-2 passes between 11-18 and 11-27 | UNKNOWN | — | needs EE query + field geometry |
| D | Client and server rice stage tables disagree (names, boundaries, NDVI ranges) | CONFIRMED | High | `src/config.js:182-189` vs `_shared/growthStage.ts:5-12` |
| D | "Monitor" + "drain before harvest" can coexist because the decision reacts to stress while the season note is unconditional timing | CONFIRMED | Low | `decision.js`, `season.js` |
| D | No harvest date/state; alerts and triage continue after harvest | CONFIRMED | Medium | migrations, `FieldFormModal.vue`, worker, `TodayTriage.vue` |
| E | `rainfall_21d_mm` simply copies global `state.rainfallMm`; null can mean not-loaded or IMERG returned null | CONFIRMED mechanism / UNKNOWN cause | Medium | `fieldExport.js:253-262`, `store.js:2637`, `ee-data/index.ts:1783-1833` |
| F | No inward buffer; geometry passed unchanged to `reduceRegion`; edge pixels can contribute | LIKELY | Medium | `ee-data/index.ts:1400-1421` |
| F | Valid pixel *count* is never computed/stored — only `valid_fraction` and `clear_scene_count` | CONFIRMED | Low | `ee-data/index.ts:209-216,871-885`, `015/016` |
| G | Several caches can serve old values within TTL, but none explains a 9-day-old reading except the 5-day AIM cache (which does not drive `current.value`) | LIKELY | Low | `ee-data`, `tileCache.js`, `store.js`, `aimScoreCache.js` |
| H | Users can edit their own subscription columns directly (free paid plan) | CONFIRMED from SQL | **High** | `000_baseline_schema.sql:17-20`, `012_subscription_tiers.sql:43-64` |
| H | `set_subscription_tier()` has no `REVOKE`, so default `PUBLIC` execute likely exposes it | LIKELY | **High** | `012_subscription_tiers.sql:103-152`; no revoke anywhere |
| H | Telegram bot token + anon JWT are in a tracked file and in git history | CONFIRMED | **High** | `testcommand.txt:1,4` |
| H | `.env` has no `VITE_` prefix, so hardcoded fallbacks are used | CONFIRMED | Low | `.env:1-2`, `src/config.js:5-9` |
| I | Schema/RLS documented; next free migration is `023` | CONFIRMED | — | `migrations/` |
| I | Code assumes one owner per field; no org membership model | CONFIRMED | Medium | see I.23 |

**Not verifiable here:** which entrypoint (`index.ts` vs stale `index.js`) is actually deployed; the live database's current policies/grants; the field geometry; actual Sentinel-2 pass dates/cloud percentages; the real IMERG response.

---

## 2. Answers

### A. 14-day trend

#### 1. How is `change_14d_pct` calculated? Does 60.1 equal 08-25 → 11-18?

**CONFIRMED — yes.**

`src/services/fieldExport.js:76-86`:

```js
function trendPct(points) {
  if (!Array.isArray(points) || points.length < 2) return null
  const recent = points[points.length - 1]
  let earlier = null
  for (let i = points.length - 2; i >= 0; i--) {
    const days = (new Date(recent.date) - new Date(points[i].date)) / 86400000
    if (days >= 14) { earlier = points[i]; break }
  }
  if (!earlier || !earlier.value) return null
  return ((recent.value - earlier.value) / earlier.value) * 100
}
```

It sorts/filters points in `cleanPoints()` (`fieldExport.js:69-74`) and then walks **backwards from the second-newest point**, selecting the **first** point that is **at least 14 days** older than the latest. It does **not** look for a ~14-day window.

For the supplied points `2026-08-25 = 0.444`, `2026-11-15 = 0.745`, `2026-11-18 = 0.711`:

- 11-18 vs 11-15 = 3 days → rejected.
- 11-18 vs 08-25 = 85 days → accepted.
- `(0.711 − 0.444) / 0.444 × 100 = 60.135…` → rounded to `60.1`.

So the number is correct, but its name is wrong: it is "change since the last observation at least 14 days older", which here is **85 days**.

#### 2. What happens when no point exists near 14 days earlier?

**CONFIRMED.** `earlier` stays `null` (or the earlier value is `0`/falsy) and the function returns `null` (`fieldExport.js:84`; the same guard exists in the UI at `FieldDetailPanel.vue:1086`, triage at `TodayTriage.vue:62`, consult at `consult-ai/index.ts:66`, worker at `ee-alerts-worker/index.ts:360`). Consequences:

- `change_14d_pct: null` in the JSON (`fieldExport.js:276`).
- `buildDecision({ trendPct: null })` → `flags.declining` and `flags.decliningFast` stay false (`decision.js:216-217`), so a real short-term decline cannot trigger `scout`/`act`.
- If the only pairs are <14 days apart, no percentage is shown anywhere.

#### 3. Where is this value used, and do all call sites calculate it the same way?

**CONFIRMED — same rule, different inputs.** The rule (latest vs. the most recent point ≥14 days older) is duplicated in five places. The input series differ:

| Call site | Source series | Window / filter | Mask | Line |
|---|---|---|---|---|
| JSON export (panel path) | `state.chartData` | active `MONTHS` (14-month rolling default) or custom range | pixel-masked `s2Collection` series | `fieldExport.js:76-86,109-126`; `store.js:2609-2634` |
| JSON export (menu path) | `fieldTrends[id]` | full `MONTHS` (`loadFieldTrend`) or active range (`refreshAllFieldTrends`) | **may be unmasked** — `getAllFieldTrends` uses scene-level <40 only; `loadFieldTrend` uses the pixel-masked series | `fieldExport.js:110`; `store.js:2626,2756-2764,3124-3127`; `ee-data/index.ts:2218-2240` |
| Field panel decision card | `state.chartData` / `state.ndviChartData` | same active range | pixel-masked `s2Collection` series | `FieldDetailPanel.vue:1070-1088,1132` |
| Today triage | `fieldTrends[id]` | whatever loaded (active range) | **may be unmasked** (bulk `getAllFieldTrends` path) | `TodayTriage.vue:48-64,89` |
| Consult AI | `observationHistory` (latest 10 raw scene rows) | 10 most recent scenes in the observations window (default 14 months) | **no pixel mask**; includes cloud-blocked scenes | `FieldDetailPanel.vue:1548-1562,1637`; `consult-ai/index.ts:47-68,154`; `ee-data/index.ts:1916-1938` |
| Telegram worker | fresh EE 90-day series | **90 days only** | scene-level `CLOUDY_PIXEL_PERCENTAGE < 40`, **no pixel mask** | `ee-alerts-worker/index.ts:310-364,584` |

Three misc notes:

- The worker computes a positive "fall" amount and passes `-pct` into the decision (`index.ts:361,584`), so the sign is consistent with the others.
- `consult-ai` does `.slice(0, 10)` **before** sorting (`index.ts:49-55`), while the client sends newest-first (`FieldDetailPanel.vue:1552-1562`), so it intentionally keeps the latest 10; that part is fine.
- The worker's `getNdviTrendPct` runs on scene-level cloud filtering and no pixel mask (`index.ts:315-320`), so its percentage can disagree materially with the export/panel percentage. The bulk `getAllFieldTrends` path (used by the dashboard sparkline/triage and the menu export) is also **unmasked** (`ee-data/index.ts:2218-2240`), while the per-field bundle path is pixel-masked. The same field can therefore show two slightly different percentages depending on which path last populated `fieldTrends`.

**Parity of the decision module itself:** `src/services/decision.js` and `supabase/functions/_shared/decision.ts` have identical thresholds and logic (`DECISION_THRESHOLDS` and the tier gate are the same), even though comments differ. The divergence is in the **input** to `trendPct`, not in `buildDecision`.

---

### B. EVI and AIM score

#### 4. Show the EVI formula and band scaling. Are bands divided by 10000 before EVI/SAVI?

**CONFIRMED — no division by 10000 anywhere.**

`supabase/functions/ee-data/index.ts:113-150`:

```js
function applyIndex(img, index, name) {
  if (index === "savi") {
    const L = 0.5;
    return img.expression("((NIR - RED) / (NIR + RED + L)) * (1 + L)", {
      NIR: img.select("B8"), RED: img.select("B4"), L: L,
    }).rename(name);
  }
  if (index === "evi") {
    const G = 2.5, C1 = 6, C2 = 7.5, L = 1;
    return img.expression("G * ((NIR - RED) / (NIR + C1 * RED - C2 * BLUE + L))", {
      NIR: img.select("B8"), RED: img.select("B4"), BLUE: img.select("B2"),
      G, C1, C2, L,
    }).rename(name);
  }
  ...
  return img.normalizedDifference(BANDS[index]).rename(name);
}
```

- SAVI: `((NIR − RED) / (NIR + RED + 0.5)) × 1.5`
- EVI: `2.5 × ((NIR − RED) / (NIR + 6·RED − 7.5·BLUE + 1))`

`COPERNICUS/S2_SR_HARMONIZED` is stored as scaled integers (DN, scale factor 10000); Earth Engine does **not** apply that factor automatically. The code confirms the app treats the values as DN: the true-colour stretch max is `3000`/`5000`, not `0.3` (`ee-data/index.ts:104`, `src/config.js:41`). There is no `divide(10000)`, `multiply(0.0001)` or equivalent before SAVI/EVI.

Because the additive constants (`+0.5 +1`, `+1`) are negligible against DN values in the thousands, the ratios behave like a plain normalized difference and **EVI can exceed 1**. Example with plausible DN (`NIR=7000, RED=800, BLUE=500`): `2.5×6200/(7000+4800−3750+1) ≈ 1.93`; the reported `2.05` is consistent with that.

#### 5. Is `aim.components.evi` raw or normalized? Why can it be 2.05?

**CONFIRMED — the exported `aim.components` are raw values, not normalized.**

- Server: `actionGetFieldHealthScore` returns both `components: normalized` and `rawValues: raw` (`ee-data/index.ts:1693-1706`).
- UI: the AIM chips use `a.components` (normalized) for the percentage and `a.rawValues` for the tooltip raw number (`FieldDetailPanel.vue:580-585`).
- **Export:** `fieldExport.js:243-252` maps `components: extras.rawValues || null` — so the exported key named `components` is actually the raw values. `rawValues.evi` is 2.0512; a normalized EVI would be `clamp((2.0512 − 0) / (1 − 0)) = 1.0`.

So `2.05` is raw EVI on the DN scale; it is not a normalized component, and it is not what the score used directly.

#### 6. Which cloud and shadow mask applies? Is the result clamped or filtered?

**CONFIRMED.** The AIM score reads through:

`actionGetFieldHealthScore` (`ee-data/index.ts:1597-1707`) → `computeIndexOverWindow` (`1382-1396`) → `reduceIndexMean` (`1400-1421`) → `s2Collection` (`356-372`).

`s2Collection` applies:

```js
const raw = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
  .filterBounds(geom).filterDate(start, end)
  .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 40));
const withProb = addCloudProbability(raw, ee);
return withProb.map(scene => scene.updateMask(validPixelMask(scene, ee)));
```

`validPixelMask` (`_shared/cloudMask.ts:88-110`) masks:

1. s2cloudless `probability > 55` (`CLOUD_PROBABILITY_THRESHOLD`);
2. SCL classes `[0,1,3,8,9,10,11]` (no-data, saturated, shadow, cloud, cirrus, snow);
3. `baseInvalid.focal_max(2, "square")` — a **2-pixel** dilation, not the 300 m constant;
4. pixels with no B8 data.

Then `collection.median()` is taken, `applyIndex` is applied to the median bands, and `reduceRegion(mean, scale:10)` is evaluated. The raw EVI is **not clamped**, filtered, or capped. The clamp happens later, only for scoring:

`normalizeToUnitRange` (`ee-data/index.ts:1426-1435`):

```js
return Math.max(0, Math.min(1, (value - v.min) / span));
```

**Bug worth noting:** `CLOUD_EDGE_BUFFER_METERS = 300` is declared (`cloudMask.ts:22`) but never used; the actual edge dilation is `focal_max(2, "square")` (`cloudMask.ts:104`), i.e. ~20 m at 10 m resolution. The comment and the code disagree.

#### 7. How does EVI 2.05 affect the 84? Show the arithmetic.

**CONFIRMED — it reproduces exactly.**

- Day count for the scrubbed month uses **month-end**, not 11-27: `Date.UTC(year, month, 1) - 1` in `ee-data/index.ts:1615`. For November 2026 and planting 2026-07-08 that is **145 days**, not 142. Both fall in the server's `Harvest` stage (`_shared/growthStage.ts:11`), so the weights are the "later" set.
- Weights: `{ ndvi: 0.6, lswi: 0.3, evi: 0.1 }` (`_shared/primaryIndex.ts:43-50`).
- Normalization (VIS from `ee-data/index.ts:74-99`):

```
NDVI: (0.7256 − (−0.2)) / (0.8 − (−0.2)) = 0.925600
LSWI: (0.2461 − (−0.3)) / (0.6 − (−0.3)) = 0.606778
EVI : (2.0512 − 0) / (1 − 0) = 2.0512 → clamp to 1.000000
```

- Weighted score:

```
0.6×0.925600 + 0.3×0.606778 + 0.1×1.000000
= 0.555360 + 0.182033 + 0.100000
= 0.837393
× 100 = 83.7393 → Math.round = 84
```

The `Math.round` is in `ee-data/index.ts:1681-1686`; the clamp is `1426-1435`; the weights are `primaryIndex.ts:49`.

So EVI contributes its **full 0.1 weight** (not 0.2051) because of the clamp; NDVI contributes ~0.555 and LSWI ~0.182.

#### 8. Why do `aim.components.ndvi` (0.7256) and `current.value` (0.711) differ?

**CONFIRMED for the code paths; LIKELY for the exact 0.0146 difference.**

- `current.value` in the export is the **latest point of the trend series** (`fieldExport.js:110-112,210-214`), i.e. one scene: `2026-11-18`, mean NDVI over the field from `actionGetIndexTimeSeries` (`ee-data/index.ts:1161-1196`) — per-scene `applyIndex` then `reduceRegion(mean, scale 10)` on the pixel-masked scene. (If the export was triggered from the top menu rather than the open panel, the series may instead be the unmasked bulk `getAllFieldTrends` series — see A.3.)
- `aim.components.ndvi` is the **month-scoped median composite**: `computeIndexOverWindow(..., {year, month})` → `reduceIndexMean` for the whole scrubbed month (`ee-data/index.ts:1388-1392,1400-1421`): `collection.median()` of all clean November scenes, then `applyIndex`, then `reduceRegion(mean, scale 10)`.

Different temporal reducers/windows (one scene vs. median of the month), same reducer (mean) and scale (10 m), both pixel-masked. A small difference is expected; the exact value cannot be recomputed without Earth Engine.

A second, smaller difference: the trend path uses `s2Collection` (scene-level cloud < 40 **plus** pixel mask), while the tile path `buildMaskedComposite` does **not** apply the scene-level < 40 filter (it relies only on the pixel mask). So a heavily-cloudy scene that is clear over this field can be included in the tile value but dropped from the trend/AIM value. See `ee-data/index.ts:178-189` vs `356-372`.

---

### C. Stale data and confidence

#### 9. How is confidence calculated? Does image age affect it?

**CONFIRMED — yes, age affects it in both layers.**

Client (`src/store.js:2939-2967`):

```js
export const CONFIDENCE_STALE_DAYS = 21
export function getConfidenceTier(signals) {
  ...
  if (cloudBlocked) return { tier: 'low', reason: ... }
  if (sceneCount === 0) return { tier: 'low', ... }
  if (lastValidDate) {
    const ageDays = Math.floor((Date.now() - new Date(lastValidDate).getTime()) / 86400000)
    if (ageDays > CONFIDENCE_STALE_DAYS) return { tier: 'low', reason: ... }
  }
  if (sceneCount <= 2) return { tier: 'medium', ... }
  if (plantingDateSource === 'estimated') return { tier: 'medium', ... }
  return { tier: 'high', ... }
}
```

So: cloud-blocked → low; no scenes → low; **last valid date older than 21 days → low**; 1–2 scenes → medium; estimated planting date → medium; otherwise high.

The field panel adds presentation overrides (`FieldDetailPanel.vue:617-663`): pinned-scene fallback → low; cloud-blocked main view → low; radar → medium; pinned optical `validFraction < 0.6` → medium; pinned observation with `cloudCover >= 40` → low; clean pinned observation → high; otherwise `fieldConfidence(field)`.

Server status (`ee-data/index.ts:1552-1585`): a clean scene in the last 14 days → `high`; only a 90-day fallback → `low`; neither → `low`. A pinned optical scene → `high`; pinned radar → `medium`; no data → `low`. The server's `getObservations` row status also ages at 21 days (`1998-2001`): `cloudCover >= 40 → blocked`, `ageDays >= 21 → low`, else `clear`.

AIM confidence (`ee-data/index.ts:1634-1647`) is `high` unless a required index had to fall back to the 90-day window, then `low`.

For the test case, 2026-11-18 at export on 2026-11-27 is **9 days old**, so the client's 21-day stale rule does **not** downgrade it; `high` is consistent.

#### 10. Does the UI show the image date and age next to the status?

**CONFIRMED — only partially.** The normal hero card shows the value, status badge, stage and a confidence badge; it does **not** show the scene date next to the status (`FieldDetailPanel.vue:79-99`).

Date/age appears in these places:

- `hero-stale-note` — "Last clear view: … · date" only when the month is cloud-blocked/radar/no clear reading (`FieldDetailPanel.vue:85-93,897-918`).
- `obsFallbackNote` — selected vs. actual date when a pinned observation falls back (`956-973`).
- `radarSceneNote` — the exact date is shown but read by radar (`979-988`).
- Decision card footer — `data_age` days when a pinned scene supplies `daysSinceObservation` (`194-196`, computed at `1111-1113`).
- Observations strip / chart tooltip — dates are listed there (`388-400`).

So there is no always-visible "image date · N days old" line beside the status.

#### 11. Were there Sentinel-2 passes between 11-18 and 11-27?

**UNKNOWN.** This cannot be answered from the repository:

- the test case does not include the field geometry (needed to filter `filterBounds`);
- the repository has no stored per-scene list for this field (the observation cache is disabled: `USE_EE_OBS_CACHE = false`, `ee-data/index.ts:61`);
- the exported JSON's `trend.points` only contains **clean** points that survived the scene-level <40 % cloud filter and the pixel mask, not rejected passes;
- querying `ee-data` would require a signed-in user JWT and would run real Earth Engine compute; no credentials/session is available here.

To answer it, run `ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED").filterBounds(<geometry>).filterDate("2026-11-18","2026-11-28")` and evaluate each scene's `system:time_start`, `CLOUDY_PIXEL_PERCENTAGE`, and `validPixelFraction` over the field. Expect some passes to exist; they were either >40 % scene cloud (the trend's `s2Collection` filter), had no valid pixels over the field (the per-scene reduce returned null), were filtered out by the per-scene/tile `validFraction < 0.6` acceptance rule, or were simply not the latest clean point. Which applies is UNKNOWN.

---

### D. Harvest stage

#### 12. What are the rice stage ranges and NDVI thresholds at day 142?

**CONFIRMED — and the client/server tables disagree.**

Client table (`src/config.js:182-189`):

| maxDay | Stage | NDVI min | NDVI max |
|---|---|---|---|
| 10 | Transplanting | −0.1 | 0.3 |
| 30 | Tillering | 0.3 | 0.55 |
| 55 | Stem Elongation / Booting | 0.5 | 0.75 |
| 75 | Flowering / Heading | 0.6 | 0.85 |
| 100 | Grain Filling / Maturity | 0.4 | 0.7 |
| 130 | Harvest / Senescence | −0.1 | 0.4 |

`getGrowthStage` returns the first row where `days <= maxDay`, else the last row (`store.js:385-393`). At day 142, the client therefore returns **Harvest / Senescence** (−0.1 … 0.4).

Server table (`_shared/growthStage.ts:5-12`):

| maxDay | Stage | NDVI min | NDVI max |
|---|---|---|---|
| 10 | Germination | 0.05 | 0.15 |
| 25 | Seedling | 0.15 | 0.3 |
| 55 | Vegetative | 0.3 | 0.55 |
| 90 | Reproductive | 0.55 | 0.75 |
| 110 | Maturation | 0.35 | 0.55 |
| ∞ | Harvest | 0.1 | 0.3 |

At day 142 the server returns **Harvest** (0.1 … 0.3); at the AIM month-end day 145 it is also **Harvest**.

Grading with NDVI 0.711:

- Client `buildStatusObject` (`store.js:2892-2934`): `0.711` is above the Harvest max 0.4, so it falls into the final `else` → **healthy**. The client only penalises values **below** `min`; above `max` is still healthy.
- Server `statusFromNdvi` (`growthStage.ts:27-45`): `deficit = 0.1 − 0.711 < 0`, so not stressed; `0.711 < 0.1` is false, so **healthy**.

So both call it healthy, but for different reasons/ranges. This is a real consistency risk at other day counts (e.g. day 60: client has "Stem Elongation / Booting" min 0.5, server has "Vegetative" min 0.3, so the same NDVI can be healthy on the server and below-expected in the client).

Also note the Help modal says harvest is "111+" (`HelpModal.vue:93`), which matches the server table but not the client table's 130-day boundary.

#### 13. Why can the result be "keep normal practices" while the season note says to drain before harvest?

**CONFIRMED.** They are independent systems by design.

- The decision engine only escalates when there is evidence of a problem. In this case: status `healthy`, confidence `high`, `trendPct` is **positive** (+60.1, not declining), `rainfall` is null, LSWI 0.2461 does not meet the dry (`<0`) or wet (`>0.3`) thresholds, and the harvest stage sets `waterHungry = false` and `sensitive = false` (`decision.js:51-60,204-217`). Score stays 0 → tier `monitor`, headline `decision.h_healthy`, action `decision.act_monitor` = "Keep normal practices and check again after the next satellite pass." (`decision.js:239-252,303-310`; `src/i18n/en.js`).
- The season note is **timing-only** and unconditional. `seasonPhase("Harvest / Senescence")` returns `maturity` (`season.js:28-37`), so the nudge is `season.tip_maturity_rice` = "Drain the field about 1–2 weeks before harvest and plan harvest timing." (`season.js:79-81`).

So the two sentences describe different things: "no stress signal" vs. "this is the usual harvest-time action". They are not contradictory in the code, but the UI does not explain that distinction, which makes them read as contradictory. The decision engine never consumes the season note (`season.js:90-94` is prompt-only), and the season note never changes the tier.

#### 14. Can a user record a harvest date? What happens to status, alerts and triage after harvest?

**CONFIRMED — no harvest date exists, and nothing changes after harvest.**

- `fields` has `planting_date` and `planting_date_source`, but **no** `harvest_date`/`harvested` column (`migrations/000,008,011,012,016,018`; `grep -i harvest migrations` returns nothing).
- The field form only collects name, planting date, crop and location (`FieldFormModal.vue:95-100,154-160`).
- After day 130 (client) / day 110 (server) the stage no longer advances: the client returns the last row forever (`store.js:385-393`) and the server's last row is `Harvest` with `maxDay: Infinity` (`growthStage.ts:11`). There is no "harvested" state.
- The worker sends on every run unless the farmer explicitly acknowledged the previous alert (`ee-alerts-worker/index.ts:835-840`), and acknowledgement suppression is only `done` 3 days / `dismissed` 7 days / `snoozed` until date (`504-517`). It does **not** look at `next_expected_pass` (grep returns no match), so a post-harvest field keeps producing stress/healthy advisories based on the next satellite scenes.
- Today triage includes every field and ranks any non-`monitor` decision (`TodayTriage.vue:71-104`). A harvested field with low NDVI (bare soil) can therefore be ranked as `stressed`/`scout`/`act` and keep appearing.

---

### E. Rainfall

#### 15. Why is `rainfall_21d_mm` null?

**CONFIRMED mechanism; root cause UNKNOWN.**

The export copies the global UI state, not the weather object (`src/services/fieldExport.js:253-262`):

```js
weather: {
  rainfall_21d_mm: round(state.rainfallMm, 1),
  forecast: ...,
  official_current: ...
}
```

`state.rainfallMm` is only assigned when a field bundle loads (`store.js:2637`) or when `loadRainfall()` is explicitly called (`store.js:2767-2770`); it is reset to `null` when detaching a field (`store.js:521`). The bundle's rainfall comes from `actionGetRainfall` (`ee-data/index.ts:1807-1833`) → `computeImergTotalMm` (`1783-1805`), which returns `null` when:

- the IMERG `ImageCollection` has no granules in the window (`if (!count) return null`), or
- the reduce result has no `precipitation` property (`result?.precipitation ?? null`), or
- the call fails/times out (client `earthEngine.js:364-370` catches and passes `null`).

Likely causes, in order:

1. The export was triggered from the top menu without the field panel having loaded the bundle, so `state.rainfallMm` was still `null` (the menu path calls `downloadFieldJson(field)` with no extras — `TopBar.vue:342-343`).
2. IMERG returned null for this field/window (missing granules, band-name change, or a failed reduce).
3. The bundle request failed entirely; the UI would then also show no rainfall, but the export does not record the error.

It is **not** the export formatting: `round(null, 1)` is `null` (`fieldExport.js:26-37`). To distinguish "not loaded" from "data source returned null", add a marker/error to the export and log the `getRainfall` response.

---

### F. Field geometry and pixels

#### 16. Are edge pixels included? Is there an inward buffer?

**CONFIRMED no inward buffer; LIKELY edge pixels can contribute.**

Every value reduce passes the GeoJSON geometry unchanged:

`ee-data/index.ts:1400-1421`:

```js
const collection = s2Collection(geom, start, end);
...
const img = applyIndex(collection.median(), index, name);
const result = await evaluate(img.reduceRegion({
  reducer: ee.Reducer.mean(),
  geometry: geom,
  scale: 10,
  maxPixels: 1e9,
}));
```

There is no `buffer(-10)`, no erosion, and no pixel-coverage threshold. Earth Engine's `reduceRegion` evaluates pixels intersecting the region, so a long narrow field (~50–65 m wide ≈ 5–7 pixels at 10 m) can include partial/edge pixels. The only buffering in the code is **around cloud pixels** (`focal_max(2, "square")`), not around the field boundary.

At 10 m, a 50–65 m width is about 5–7 pixels; if edge pixels are mixed with the surrounding field/road, the mean can be diluted. This is a plausible driver of differences between the field mean and a farmer's impression, but the exact effect cannot be quantified without the geometry and an EE query. **LIKELY.**

#### 17. Which reducer and scale are used, and how many valid pixels does the field have?

**CONFIRMED.** Index value reduces use `ee.Reducer.mean()` at `scale: 10`, `maxPixels: 1e9` (`ee-data/index.ts:1412-1417`; same for trend `1176-1181`, per-scene `1478-1483`, recent `1757-1762`). The zone breakdown uses `scale: 10` (`1096-1103`). RVI uses `scale: 10` (`1237-1241`). The valid-pixel fraction is deliberately sampled at **20 m** (`buildMaskedComposite`, `209-216`), because validity comes from 60 m s2cloudless + 20 m SCL.

**The valid pixel count is never computed, stored or shown.** What exists:

- `clearSceneCount` — number of scenes with a surviving valid mask (`buildMaskedComposite` returns `maskedIndices.size()`).
- `validFraction` — fraction 0–1 of valid pixels (`_shared/cloudMask.ts:118-145`), stored in `ee_tile_cache.valid_fraction` (`ee-data/index.ts:871-885`, migration 016).
- `totalAreaSqm`/per-bucket area in the Health Zone breakdown (`1084-1114`).

The exact number of valid 10 m pixels for this field is **UNKNOWN** without querying EE. It is not stored in `fields`, `ee_tile_cache`, `ee_trend_cache` or `ee_observation_cache`.

---

### G. Caching

#### 18. Could any server or client cache have served old values for this field?

**CONFIRMED list; LIKELY none caused the 9-day-old reading.**

| Cache | Key | TTL / lifetime | Can serve stale? | Evidence |
|---|---|---|---|---|
| `ee_tile_cache` (server, Supabase) | `(index, year, month, geometry_hash, mode)` | closed month **2 h**, open month **20 min** | Yes, within TTL; reads the **newest any mode** for month scrubs | `ee-data/index.ts:59,407-409,411-462,630-648`; `015/016` migrations |
| `ee_trend_cache` (server) | `(field_id, index, year, month)` | closed = permanent | Disabled: `USE_EE_TREND_CACHE = false` | `ee-data/index.ts:60,2154-2175,2289-2299` |
| `ee_observation_cache` (server) | `(field_id, scene_date)` | permanent | Disabled: `USE_EE_OBS_CACHE = false` | `ee-data/index.ts:61,1878-1901,1967-1984` |
| IndexedDB tile cache (`ceres-tile-cache`) | `index|year|month|geometryHash` | 2 h closed / 20 min open, 60 entries | Yes, within TTL; not per-scene, not true-colour | `src/services/tileCache.js:13-18,74-76,78-121` |
| Client chart cache (memory) | `subject|index|start|end` | **15 min** | Yes, within TTL; cleared per field on boundary edit | `src/store.js:288-301,1871-1913` |
| AIM score cache (memory) | `fieldId|plantingDate|geometryHash|year-month` | **5 days** | Yes, up to 5 days | `src/services/aimScoreCache.js:16-35,50-56` |
| Open-Meteo cache (memory) | `lat,lng` (4 dp) | 15 min | Yes, within TTL | `src/services/weatherService.js:11-15,47-64` |
| `ai_explanations` (server) | `field_id` (+ reading/status guard) | until data changes | Disabled: `USE_EXPLANATION_CACHE = false` | `consult-ai/index.ts:14,169-190,349-359` |

Assessment for this field:

- The exported `current.value` is the latest point in `state.chartData`; that series comes from a fresh `getFieldBundle` (`store.js:2609-2637`) and the chart cache at worst 15 min old. The tile cache is 20 min old for an open month (Nov 2026). Neither can explain a **9-day-old** (11-18) reading.
- The 5-day AIM cache could serve an old **score**, but it does not drive `current.value`; it could explain a mismatch between the AIM card and the trend.
- The 11-18 date is most likely simply the newest **clean** scene available (see C.11) — not a cache artefact. **LIKELY.**

---

### H. Security

#### 19. Can a user update `subscription_*`, `role`, or call `upgrade_my_subscription` for a free paid plan?

**CONFIRMED for `subscription_*`; `role` is protected by a trigger; `upgrade_my_subscription` is revoked from users; `set_subscription_tier` is likely exposed.**

**19.1 Direct profile update (CONFIRMED from SQL).** The baseline policy is row-scoped, not column-scoped (`migrations/000_baseline_schema.sql:16-20`):

```sql
alter table profiles enable row level security;
create policy "Users can view own profile" on profiles
  for select using (auth.uid() = id);
create policy "Users can update own profile" on profiles
  for update using (auth.uid() = id);
```

There is no column list, no `WITH CHECK` beyond the implicit `USING`, and no trigger guarding subscription columns. `migrations/012_subscription_tiers.sql:43-64` adds:

```sql
subscription_tier   text not null default 'free' check (...),
subscription_status text not null default 'active' check (...),
subscription_source text not null default 'none' check (...),
subscription_renews_at timestamptz,
max_aois            integer not null default 1,
max_hectares        numeric not null default 10,
consult_ai_enabled  boolean not null default false
```

Migration 019 only protects `role` (`019_roles_and_commune_summary.sql:20-32`):

```sql
create or replace function public.protect_profile_role() returns trigger
language plpgsql as $$
begin
  if new.role is distinct from old.role and auth.role() = 'authenticated' then
    raise exception 'role cannot be changed by the user';
  end if;
  return new;
end $$;
create trigger profiles_protect_role before update on public.profiles
  for each row execute function public.protect_profile_role();
```

So a signed-in user can `PATCH /rest/v1/profiles?id=eq.<own-uuid>` with `{"subscription_tier":"coop","max_aois":20,"max_hectares":1000,"consult_ai_enabled":true}` and bypass payment. **This is the same known issue flagged in `docs/PROJECT_CONTEXT.md`, still present.** The `role` change is blocked if migration 019 is applied; if the live DB lacks 019, role is also self-escalatable.

**19.2 `upgrade_my_subscription` (CONFIRMED revoked).** Migration 013 granted it to `authenticated` (`013:48`), but migration 014 revoked it (`014:166-171`):

```sql
revoke execute on function public.upgrade_my_subscription(text) from authenticated;
grant execute on function public.upgrade_my_subscription(text) to service_role;
```

So that specific RPC no longer works for users.

**19.3 `set_subscription_tier` (LIKELY exposed).** Migration 012 creates it `security definer` with no `REVOKE`/`GRANT` (`012:103-152`). No later migration revokes it (grep for `set_subscription_tier` finds only 012/013/014 references; 014 only revokes `finalize_aba_payment` and `upgrade_my_subscription`). PostgreSQL grants `EXECUTE` to `PUBLIC` by default for new functions, and Supabase/PostgREST exposes `public` functions at `/rest/v1/rpc/set_subscription_tier`. Unless the live database has custom default privileges, **any authenticated (and possibly anon) caller can call it with their own profile id** and grant themselves `individual`/`coop`. This is a **HIGH** severity finding; the live grant must be checked with `\df+ public.set_subscription_tier` / `information_schema.routine_privileges`.

**19.4 Other function grants to verify.** `redeem_link_code` (`002:10-34`) and `cleanup_expired_link_codes` (`002:81-90`) are `security definer` with no revoke; they are also likely `PUBLIC`. `redeem_link_code` needs `code_input`, `chat_id_input`, `user_id_input`; a leaked short-lived code plus a user UUID could let an attacker rebind a chat. `cleanup_expired_link_codes` is destructive but low-impact. Both should be revoked from `anon`/`authenticated` unless required.

**19.5 Full SQL for this section** is in the Appendix (§5.2), including profiles policies, subscription columns, `set_subscription_tier`, `upgrade_my_subscription`, `cancel_my_subscription`, `finalize_aba_payment`, the role trigger and the billing/payment RLS.

#### 20. Is there a bot token or JWT in `testcommand.txt`, other files or git history?

**CONFIRMED — locations only, values intentionally not reproduced.**

- **`testcommand.txt`** (tracked in git): line 1 contains an **anon JWT**; line 4 contains a **Telegram bot token**; line 5 contains a **chat id**. The file is tracked (`git ls-files` includes it) and present in git history (commits `58313ad`, `da84f12`, `bfe17d8`, `e3b2c5b`, `dcc9faa`, …). A regex scan of `git log -p -- testcommand.txt` finds the bot-token pattern **twice**.
- **`src/config.js:6`** contains a **hardcoded anon JWT fallback** (the public client key). It is in the bundle and in git.
- **`.env`** (untracked): line 2 is an **anon JWT**; line 4 is a **Google OAuth client ID** (not a secret); line 5 is the bot username (not a secret).
- **`supabase/.temp/pooler-url:1`** (tracked): a database pooler URL with host/user but **no password** in the file.
- **`supabase/.temp/linked-project.json`** (tracked): project ref and org id; not a secret.
- **`test-consult.json`**: field UUID and test values; no secret. **`test-gemini.json`**: prompt only. **`webhook.json`**: function URL only.
- **Secrets are read from environment variables, not hardcoded**, in the Edge Functions: `EE_SERVICE_ACCOUNT_KEY` (`ee-data/index.ts:40`, `ee-alerts-worker/index.ts:33`, `ee-spike/index.ts:9`), `SUPABASE_SERVICE_ROLE_KEY` (consult-ai, ee-data, worker, payments), `TELEGRAM_BOT_TOKEN` (`ee-alerts-worker/index.ts:32`, `telegram-webhook/index.ts:22`), `GEMINI_API_KEY`/`DEEPSEEK_API_KEY`/`QWEN_API_KEY` (`_shared/llm.ts:13-15`), `ABA_API_KEY`/`ABA_MERCHANT_ID` (`initiate-payment`, `aba-payway-webhook`).

**Recommendation:** treat the Telegram bot token as compromised (it is in a tracked file and history), rotate it with BotFather, delete `testcommand.txt`, and purge the token from git history. Rotate the anon key if you consider the hardcoded one sensitive (anon keys are public by design, but hardcoding them is still poor practice).

#### 21. `.env` lacks the `VITE_` prefix. Which hardcoded fallbacks are used?

**CONFIRMED.** Vite only exposes variables prefixed with `VITE_` to client code. `.env` has:

```
SUPABASE_URL=https://wopwwtnvqyomiwbsxiks.supabase.co
SUPABASE_ANON_KEY=...
VITE_EE_CLIENT_ID=...
VITE_TELEGRAM_BOT_USERNAME=ndvi_monitor_bot
```

`src/config.js:5-9` reads `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`:

```js
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://wopwwtnvqyomiwbsxiks.supabase.co'
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJ...'
export const TELEGRAM_BOT_USERNAME = import.meta.env.VITE_TELEGRAM_BOT_USERNAME || 'ndvi_monitor_bot'
```

So the **hardcoded URL and anon key in `config.js` are always used** (the `.env` names are ignored), and the bot username uses the `.env` value because it is correctly prefixed. `VITE_EE_CLIENT_ID` is unused (Earth Engine direct auth was removed). `CONSULT_AI_URL` and `EE_DATA_URL` are hardcoded to the project functions URL (`config.js:4,13`).

---

### I. Organization version (ministry/NGO)

#### 22. Full current schema and RLS + next free migration number

**CONFIRMED. Next free migration number: `023`** (highest existing prefix is `022_add_ndre_index.sql`; note the repo already has duplicate `012_*` and `016_*` prefixes, so use `023`).

**`profiles`** (000/009/012/019):

```sql
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  co_op_name text,
  telegram_chat_id text unique,
  created_at timestamptz not null default now(),
  organization_id uuid references organizations(id) on delete set null,
  subscription_tier text not null default 'free' check (subscription_tier in ('free','individual','coop')),
  subscription_status text not null default 'active' check (subscription_status in ('active','trialing','past_due','canceled')),
  subscription_source text not null default 'none' check (subscription_source in ('none','manual_grant','aba_payway')),
  subscription_renews_at timestamptz,
  max_aois integer not null default 1,
  max_hectares numeric not null default 10,
  consult_ai_enabled boolean not null default false,
  preferred_language text not null default 'en' check (preferred_language in ('en','km')),
  role text not null default 'farmer' check (role in ('farmer','extension_viewer'))
);
alter table profiles enable row level security;
create policy "Users can view own profile" on profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on profiles for update using (auth.uid() = id);
```

Triggers: `on_auth_user_created` (`handle_new_user`, 000:30-32), `trg_protect_telegram_chat_id` (002:48-52), `prevent_direct_telegram_chat_id` (002:74-77), `profiles_protect_role` (019:29-32).

**`fields`** (000/001/008/011/012/016/018):

```sql
create table fields (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references profiles(id) on delete cascade,
  name text not null,
  geojson jsonb not null,
  area_ha numeric,
  planting_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  aoi_id uuid references aois(id) on delete set null,
  centroid_lat double precision,
  centroid_lng double precision,
  planting_date_source text not null default 'manual' check (planting_date_source in ('manual','estimated')),
  next_expected_pass date,
  imagery_source text not null default 'sentinel-2',
  crop_name text,
  crop_english text,
  province_code text references admin_provinces(code),
  district_code text references admin_districts(code),
  commune_code text references admin_communes(code),
  village_code text references admin_villages(code),
  share_with_authorities boolean not null default false
);
alter table fields enable row level security;
create policy "Users can view own fields" on fields for select using (auth.uid() = owner_id);
create policy "Users can insert own fields" on fields for insert with check (auth.uid() = owner_id);
create policy "Users can update own fields" on fields for update using (auth.uid() = owner_id);
create policy "Users can delete own fields" on fields for delete using (auth.uid() = owner_id);
```

Triggers: `fields_set_updated_at` (000:65-67). Index: `fields_commune_idx` (018:66).

**`aois`** (001):

```sql
create table aois (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references profiles(id) on delete cascade,
  name text not null,
  bounds jsonb not null,
  created_at timestamptz not null default now()
);
alter table aois enable row level security;
create policy "Users can view own aois" on aois for select using (auth.uid() = owner_id);
create policy "Users can insert own aois" on aois for insert with check (auth.uid() = owner_id);
create policy "Users can update own aois" on aois for update using (auth.uid() = owner_id);
create policy "Users can delete own aois" on aois for delete using (auth.uid() = owner_id);
```

Trigger: `aois_enforce_limit` → `enforce_aoi_limit()` (001:26-37, replaced in 012:166-180 to read `profiles.max_aois`).

**`alerts_log`** (000/010):

```sql
create table alerts_log (
  id uuid primary key default gen_random_uuid(),
  field_id uuid not null references fields(id) on delete cascade,
  status text not null,
  ndvi_value numeric,
  message text,
  chat_id text,
  sent_at timestamptz not null default now(),
  telegram_sent boolean default null
);
alter table alerts_log enable row level security;
create policy "Users can view own field alerts" on alerts_log for select using (
  exists (select 1 from fields where fields.id = alerts_log.field_id and fields.owner_id = auth.uid())
);
```

No insert/update/delete policy for users (the worker uses service_role).

**`field_observations`** (020):

```sql
create table public.field_observations (
  id uuid primary key default gen_random_uuid(),
  field_id uuid not null references public.fields(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  observed_on date not null default current_date,
  tags text[] not null default '{}' check (tags <@ array['water','weed','pest','disease','nutrient','other','none']::text[]),
  outcome text not null default 'unknown' check (outcome in ('improved','same','worse','unknown')),
  notes text,
  photo_path text,
  source text not null default 'app' check (source in ('app','telegram')),
  created_at timestamptz not null default now()
);
alter table public.field_observations enable row level security;
create policy "field_observations_owner_select" ... for select using (owner_id = auth.uid());
create policy "field_observations_owner_insert" ... for insert with check (
  owner_id = auth.uid() and exists (select 1 from public.fields f where f.id = field_id and f.owner_id = auth.uid())
);
create policy "field_observations_owner_update" ... for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "field_observations_owner_delete" ... for delete using (owner_id = auth.uid());
```

**`field_actions`** (020):

```sql
create table public.field_actions (
  id uuid primary key default gen_random_uuid(),
  field_id uuid not null references public.fields(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  alert_id uuid references public.alerts_log(id) on delete set null,
  decision_tier text check (decision_tier in ('monitor','scout','act')),
  action_key text,
  status text not null default 'done' check (status in ('done','snoozed','dismissed','rated')),
  useful boolean,
  reason text,
  snooze_until timestamptz,
  notes text,
  created_at timestamptz not null default now()
);
alter table public.field_actions enable row level security;
create policy "field_actions_owner_select" ... for select using (owner_id = auth.uid());
create policy "field_actions_owner_insert" ... for insert with check (
  owner_id = auth.uid()
  and exists (select 1 from public.fields f where f.id = field_id and f.owner_id = auth.uid())
  and (alert_id is null or exists (
    select 1 from public.alerts_log a join public.fields f2 on f2.id = a.field_id
    where a.id = alert_id and f2.owner_id = auth.uid()
  ))
);
-- Append-only: no update/delete policies.
```

Other relevant RLS: `billing_events` select own (`012:87-90`); `payment_transactions` select own (`014:81-86`); `subscription_prices` select authenticated (`014:47-52`); `field_photos` owner select/insert/delete (`010:14-24`); `link_codes` select/insert own (`000:78-82`); `ai_usage` select own (`004:8-10`); `ai_explanations` select via field owner (`004:21-25`); `admin_*` select authenticated (`018:42-56`); `ee_*_cache` RLS enabled with no policies (`012:50-54`, `015:45-49`).

#### 23. What in the code assumes one owner per field?

**CONFIRMED.** The ownership model is one user → many fields, with no org/membership layer:

- `fields.owner_id` is `not null default auth.uid()` (`000:37`); every field RLS policy is `auth.uid() = owner_id` (`000:48-55`, `005:10-26`).
- `supabase.js` inserts `owner_id: session.user.id` (`supabase.js:143`) and `loadFields()` selects `*` relying on owner-only RLS (`99-106`).
- `aois`, `field_observations`, `field_actions`, `alerts_log`, `field_photos` all derive ownership from the field/owner (`000`, `001`, `007/010`, `020`).
- Storage paths are `{owner_id}/{timestamp}.jpg` with policies keyed on `(storage.foldername(name))[1] = auth.uid()::text` (`010:38-50`, `supabase.js:385`).
- The alerts worker reads **all** fields with a linked Telegram chat using service_role, but each field carries a single `owner_id` and uses that owner's profile for language/chat (`ee-alerts-worker/index.ts:703-720`).
- `organizations` exists but has **no membership table**, no `fields.organization_id`, and its only policy is owner-only (`012:20-35`). `profiles.organization_id` is a bare FK. So an org cannot have staff who see the org's fields.
- `get_commune_stress_summary` is the only cross-owner read; it is `security definer`, requires `extension_viewer`, returns aggregates only, and suppresses groups < 3 (`019:41-116`).
- `consult-ai` is a latent cross-tenant risk: it trusts the `fieldId` in the request body and uses the service-role client; it never verifies that `fieldId` belongs to `auth.uid()` (`consult-ai/index.ts:83-112,165-190,349-359`). With `USE_EXPLANATION_CACHE = false` this is currently limited, but re-enabling the cache would let anyone who knows a field UUID read/overwrite its cached explanation.

**Implication for the ministry/NGO version:** you need `organizations` membership (roles: owner/manager/extension officer), `fields.organization_id` (nullable for personal fields), org-scoped RLS (or a `security definer` RPC with org checks), and an ownership check in `consult-ai` before it reads/writes any field-scoped data.

---

## 3. Suggested fixes (do not apply)

### P0 — security (do first)

1. **Rotate the Telegram bot token** with BotFather, delete `testcommand.txt`, and purge the token from git history (BFG Repo-Cleaner or `git filter-repo`), then force-push. Add a `.gitignore` for local test/token files. Re-scan history for `\d{8,10}:[A-Za-z0-9_-]{30,}`.
2. **Stop self-service subscription edits.** Either:
   - add a `protect_profile_subscription()` trigger (mirroring `protect_profile_role`) that rejects changes to `subscription_*`, `max_aois`, `max_hectares`, `consult_ai_enabled`, `organization_id` from `auth.role() = 'authenticated'`; **and**
   - revoke column-level UPDATE on those columns from `authenticated`; or
   - move them to a separate `profile_subscriptions` table with no user UPDATE policy.
3. **Revoke/limit function execute privileges:** `revoke execute on function public.set_subscription_tier(uuid,text,text,text) from public, anon, authenticated;` then grant only to `service_role` (or a checked admin RPC). Do the same review for `redeem_link_code` and `cleanup_expired_link_codes`. Verify the live DB with `information_schema.routine_privileges`.
4. **Do not hardcode the anon key** in `src/config.js`; use `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` in `.env` (or rely on the platform). Remove the dead `VITE_EE_CLIENT_ID`.

### P1 — correctness of the satellite numbers

5. **Fix SAVI/EVI scaling.** Divide all S2 bands by 10000 before the index expressions (e.g. `img.select(...).divide(10000)`), then retune `VIS.evi`/`VIS.savi` to physically meaningful 0–1 ranges and update `INDEX_BANDS`/`indexTranslations.ts`. Clamp EVI to a sane range (e.g. −1..1) before storing/exporting.
6. **Fix the export's AIM naming.** Export `aim.components_normalized` and `aim.raw_values` separately; do not label raw values as `components`. Consider also exporting `weights`.
7. **Make the "14-day" metric honest.** Either compute a true 14-day-window change (interpolate/select the point closest to 14 days, or return the actual gap), or rename it to `change_since_last_14d_point_pct` and include `compared_from`/`compared_to` dates and `gap_days` in the export. Apply the same helper to all five call sites so they cannot drift.
8. **Align the trend/health/tile sampling.** Decide whether a scene with `CLOUDY_PIXEL_PERCENTAGE >= 40` but mostly clear over the field should be usable. Today `s2Collection` drops it, while `buildMaskedComposite` keeps it; that makes AIM/trend and tile disagree. Unify the policy.
9. **Fix or remove `CLOUD_EDGE_BUFFER_METERS`.** Either implement a real metre buffer (reproject, `focal_max` in metres) or delete the constant and document the 2-pixel dilation.
10. **Unify the rice stage tables.** `src/config.js` and `_shared/growthStage.ts` are not the same model. Either make the client consume the shared table (a generated JSON/import) or explicitly document the divergence and ensure the server uses the client table for the hero/status. Add a parity test.

### P2 — product/UX correctness

11. **Show the image date and age next to the hero status** (e.g. "NDVI 0.711 · 18 Nov 2026 · 9 days old"), not only in the fallback note.
12. **Add a harvest date/state.** Add `harvest_date` (and/or `harvested_at`) to `fields`, expose it in the field form, cap the stage at harvest, and suppress alerts/triage after harvest (or on an explicit "harvested" acknowledgement). Wire `next_expected_pass` into the worker if it is meant to gate alerts.
13. **Make the rainfall state explicit.** Distinguish "not loaded", "source unavailable" and "0 mm" in the export/UI; add a retry and surface the `getRainfall` error. Consider a CHIRPS fallback for the UI when IMERG is missing.
14. **Add an inward buffer or coverage weighting for narrow fields.** At least document the edge-pixel effect and expose `validFraction` plus a pixel-count estimate in the UI/export.
15. **Clarify season-note vs. decision wording** so "keep normal practices" and "drain before harvest" do not read as contradictory — e.g. label the season card "Timing guidance (does not change the action)" or merge the harvest timing into the decision card when the tier is monitor at maturity.
16. **Fix the organization model** (membership, `fields.organization_id`, org-scoped RLS, ownership check in `consult-ai`) before selling to ministries/NGOs.

---

## 4. Could not verify

- **Deployed entrypoint (`index.ts` vs stale `index.js`).** The repo contains both for `ee-data` (2469 lines vs 1976), `consult-ai` (366 vs 256) and `ee-alerts-worker` (1049 vs 527); the `.js` copies lack the newer logic. `supabase/config.toml` only declares `verify_jwt = false` for the two webhooks. We could not run `supabase functions list`/`logs` or inspect the deployed bundle, so we cannot confirm which file is live. `docs/PROJECT_CONTEXT.md` claims `.ts` (ee-data v70) is deployed; that is a claim, not verified here.
- **Live database state.** We read the migration SQL, not the live catalog. Policies/grants/triggers could have been changed in the dashboard. The subscription findings are CONFIRMED from the migration text but should be re-checked against `pg_policies` / `information_schema.routine_privileges` / `\df+` on the project.
- **Sentinel-2 passes 11-19 … 11-27**, cloud percentages, and which were rejected (C.11). Needs the field geometry and an Earth Engine query.
- **The exact valid-pixel count for this field** (F.17). Not stored anywhere; needs EE.
- **The exact cause of `rainfall_21d_mm = null`** (E.15). Needs the `ee-data` logs (IMERG count/result) and knowledge of whether the panel had loaded the bundle.
- **The exact reason for the 0.7256 vs 0.711 gap** (B.8). The code paths are confirmed; the numeric difference is consistent with monthly median vs single scene, but only Earth Engine can reproduce it exactly.
- **Some very large files were read by targeted section rather than line-by-line:** `src/store.js` (3425 lines), `src/components/FieldDetailPanel.vue` (1708), `supabase/functions/ee-data/index.ts` (2469), `supabase/functions/ee-alerts-worker/index.ts` (1049). Every code path cited above was read directly.

---

## 5. Appendix

### 5.1 Source of the functions behind A–D

**A. `trendPct` — `src/services/fieldExport.js:76-86`**

```js
function trendPct(points) {
  if (!Array.isArray(points) || points.length < 2) return null
  const recent = points[points.length - 1]
  let earlier = null
  for (let i = points.length - 2; i >= 0; i--) {
    const days = (new Date(recent.date) - new Date(points[i].date)) / 86400000
    if (days >= 14) { earlier = points[i]; break }
  }
  if (!earlier || !earlier.value) return null
  return ((recent.value - earlier.value) / earlier.value) * 100
}
```

**A. `ndviTrendPct` — `src/components/FieldDetailPanel.vue:1070-1088`**

```js
const ndviTrendPct = computed(() => {
  const series = state.currentIndex === 'ndvi' && Array.isArray(state.chartData)
    ? state.chartData
    : (Array.isArray(state.ndviChartData) ? state.ndviChartData : null)
  if (!series || series.length < 2) return null
  const pts = series
    .filter((p) => p && p.date && typeof p.value === 'number' && isFinite(p.value))
    .slice().sort((a, b) => String(a.date).localeCompare(String(b.date)))
  if (pts.length < 2) return null
  const recent = pts[pts.length - 1]
  let earlier = null
  for (let i = pts.length - 2; i >= 0; i--) {
    const days = (new Date(recent.date) - new Date(pts[i].date)) / 86400000
    if (days >= 14) { earlier = pts[i]; break }
  }
  if (!earlier || !earlier.value) return null
  return ((recent.value - earlier.value) / earlier.value) * 100
})
```

**A. `trendPctOf` — `src/components/TodayTriage.vue:48-64`** — identical rule over `fieldTrends[f.id]`.

**A. `trendPctFromHistory` — `supabase/functions/consult-ai/index.ts:47-68`**

```ts
function trendPctFromHistory(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const pts = list
    .filter(h => h && typeof h.date === "string" && typeof h.ndvi === "number" && isFinite(h.ndvi))
    .slice(0, 10)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  if (pts.length < 2) return null;
  const recent = pts[pts.length - 1];
  let earlier = null;
  for (let i = pts.length - 2; i >= 0; i--) {
    const days = (new Date(recent.date) - new Date(pts[i].date)) / 86400000;
    if (days >= 14) { earlier = pts[i]; break; }
  }
  if (!earlier || !earlier.ndvi) return null;
  return ((recent.ndvi - earlier.ndvi) / earlier.ndvi) * 100;
}
```

**A. `getNdviTrendPct` — `supabase/functions/ee-alerts-worker/index.ts:310-364`** (scene-level, 90 days, no pixel mask; returns a positive "fall"):

```ts
function getNdviTrendPct(geojson) {
  return new Promise((resolve, reject) => {
    const geom = toEeGeometry(geojson);
    const end = ee.Date(Date.now());
    const start = end.advance(-90, "day");
    const collection = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
      .filterBounds(geom).filterDate(start, end)
      .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 40))
      .sort("system:time_start", false);
    const series = collection.map((img) => {
      const ndvi = img.normalizedDifference(["B8", "B4"]).rename("ndvi");
      const value = ndvi.reduceRegion({ reducer: ee.Reducer.mean(), geometry: geom, scale: 10, maxPixels: 1e9 });
      return ee.Feature(null, { date: img.date().format("YYYY-MM-dd"), value: value.get("ndvi") });
    });
    series.filter(ee.Filter.notNull(["value"])).evaluate((result, err) => {
      if (err) return reject(new Error(err));
      const pts = (result?.features || []).map(f => ({ date: f.properties.date, value: f.properties.value }))
        .sort((a, b) => a.date.localeCompare(b.date));
      if (pts.length < 2) return resolve(null);
      const recent = pts[pts.length - 1].value;
      let earlier = null;
      for (let i = pts.length - 2; i >= 0; i--) {
        const d = pts[i];
        if (d.value != null) {
          const diffDays = (new Date(pts[pts.length - 1].date).getTime() - new Date(d.date).getTime()) / 86400000;
          if (diffDays >= 14) { earlier = d.value; break; }
        }
      }
      if (earlier === null || !earlier) return resolve(null);
      resolve(((earlier - recent) / earlier) * 100);
    });
  });
}
```

**B. `applyIndex` — `ee-data/index.ts:113-150`**

```ts
function applyIndex(img, index, name) {
  if (index === "savi") {
    const L = 0.5;
    return img.expression("((NIR - RED) / (NIR + RED + L)) * (1 + L)", {
      NIR: img.select("B8"), RED: img.select("B4"), L: L,
    }).rename(name);
  }
  if (index === "evi") {
    const G = 2.5, C1 = 6, C2 = 7.5, L = 1;
    return img.expression("G * ((NIR - RED) / (NIR + C1 * RED - C2 * BLUE + L))", {
      NIR: img.select("B8"), RED: img.select("B4"), BLUE: img.select("B2"),
      G, C1, C2, L,
    }).rename(name);
  }
  if (index === "gci") {
    return img.expression("(NIR / GREEN) - 1", { NIR: img.select("B8"), GREEN: img.select("B3") }).rename(name);
  }
  return img.normalizedDifference(BANDS[index]).rename(name);
}
```

**B. `s2Collection` — `ee-data/index.ts:356-372`**

```ts
function s2Collection(geom, start, end) {
  const raw = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
    .filterBounds(geom).filterDate(start, end)
    .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 40));
  const withProb = addCloudProbability(raw, ee);
  return withProb.map(scene => scene.updateMask(validPixelMask(scene, ee)));
}
```

**B. `reduceIndexMean` + `normalizeToUnitRange` — `ee-data/index.ts:1400-1435`**

```ts
async function reduceIndexMean(geom, index, start, end) {
  const collection = s2Collection(geom, start, end);
  const count = await evaluate(collection.size());
  if (!count) return null;
  const name = index.toUpperCase();
  const img = applyIndex(collection.median(), index, name);
  const result = await evaluate(img.reduceRegion({
    reducer: ee.Reducer.mean(), geometry: geom, scale: 10, maxPixels: 1e9,
  }));
  return result && result[name] != null ? result[name] : null;
}

function normalizeToUnitRange(index, value) {
  if (value == null) return null;
  const v = VIS[index];
  if (!v || v.min == null || v.max == null) return null;
  const span = v.max - v.min || 1;
  return Math.max(0, Math.min(1, (value - v.min) / span));
}
```

**B. Score core — `ee-data/index.ts:1597-1707` (abridged to the arithmetic)**

```ts
const stage = stageNameForDayCount(dayCount);
const primaryIndex = primaryIndexForStage(stage);
const baseWeights = healthScoreWeights(stage);   // {ndvi:.6,lswi:.3,evi:.1} later
...
for (const index of Object.keys(baseWeights)) {
  let value = await computeIndexOverWindow(geom, index, 0, { year, month });
  if (value === null) {
    value = await reduceIndexMean(geom, index, monthEnd.advance(-90, "day"), monthEnd);
    confidence = "low";
  }
  if (value === null) return { score: null, noData: true, ... };
  raw[index] = value;
  normalized[index] = normalizeToUnitRange(index, value);
}
...
const score = Math.round(
  Object.entries(weights).reduce((sum, [i, w]) => sum + (normalized[i] ?? 0) * w, 0) * 100
);
return { score, components: normalized, rawValues: raw, weights, ... };
```

**B. `validPixelMask` — `_shared/cloudMask.ts:88-110`**

```ts
export function validPixelMask(scene, ee) {
  const cfg = CLOUD_RESILIENCE;
  const probInvalid = scene.select("probability").gt(cfg.CLOUD_PROBABILITY_THRESHOLD); // 55
  const scl = scene.select("SCL");
  let sclInvalid = null;
  for (const klass of cfg.INVALID_SCL_CLASSES) {        // [0,1,3,8,9,10,11]
    const hit = scl.eq(klass);
    sclInvalid = sclInvalid ? sclInvalid.or(hit) : hit;
  }
  const baseInvalid = probInvalid.or(sclInvalid);
  const bufferedInvalid = baseInvalid.focal_max(2, "square"); // 2 px, not 300 m
  const noData = scene.select("B8").mask().not();
  return bufferedInvalid.or(noData).not().rename("validMask");
}
```

**C. `getConfidenceTier` — `src/store.js:2941-2967`**

```js
export function getConfidenceTier(signals) {
  const { cloudBlocked, sceneCount, plantingDateSource, lastValidDate } = signals
  if (cloudBlocked) return { tier: 'low', reason: confReason(lang, 'cloudBlocked') }
  if (sceneCount === 0) return { tier: 'low', reason: confReason(lang, 'noData') }
  if (lastValidDate) {
    const ageDays = Math.floor((Date.now() - new Date(lastValidDate).getTime()) / 86400000)
    if (ageDays > CONFIDENCE_STALE_DAYS) return { tier: 'low', reason: confReason(lang, 'stale', { days: ageDays }) }
  }
  if (sceneCount > 0 && sceneCount <= 2) return { tier: 'medium', reason: confReason(lang, 'fewScenes', { count: sceneCount }) }
  if (plantingDateSource === 'estimated') return { tier: 'medium', reason: confReason(lang, 'estimatedDate') }
  return { tier: 'high', reason: '' }
}
```

**D. `statusFromNdvi` + stage tables — `_shared/growthStage.ts:5-45`**

```ts
export const RICE_GROWTH_STAGES = [
  { name: "Germination", maxDay: 10, min: 0.05, max: 0.15 },
  { name: "Seedling", maxDay: 25, min: 0.15, max: 0.3 },
  { name: "Vegetative", maxDay: 55, min: 0.3, max: 0.55 },
  { name: "Reproductive", maxDay: 90, min: 0.55, max: 0.75 },
  { name: "Maturation", maxDay: 110, min: 0.35, max: 0.55 },
  { name: "Harvest", maxDay: Infinity, min: 0.1, max: 0.3 },
];
export function stageForDay(day, useGeneric = false) {
  const table = useGeneric ? GENERIC_GROWTH_STAGES : RICE_GROWTH_STAGES;
  return table.find(s => day <= s.maxDay) || table[table.length - 1];
}
export function statusFromNdvi(ndvi, plantingDate, useGeneric = false) {
  if (!plantingDate) {
    if (ndvi >= 0.6) return { status: "healthy", stage: null };
    if (ndvi >= 0.3) return { status: "below_expected", stage: null };
    return { status: "stressed", stage: null };
  }
  const day = Math.floor((Date.now() - new Date(plantingDate).getTime()) / 86400000);
  const stage = stageForDay(day, useGeneric);
  const deficit = stage.min - ndvi;
  if (deficit > 0.15) return { status: "stressed", stage: stage.name };
  if (ndvi < stage.min) return { status: "below_expected", stage: stage.name };
  return { status: "healthy", stage: stage.name };
}
```

**D. `buildStatusObject` (client) — `src/store.js:2892-2934`** — uses the client `config.js` table and treats values above `max` as healthy:

```js
const stage = getGrowthStage(daysSincePlanting, field)
if (value >= stage.min && value <= stage.max) { cls3 = 'healthy' }
else if (value < stage.min) {
  const deficit = stage.min - value
  if (deficit > 0.15) cls3 = 'stressed'
  else cls3 = 'moderate'
} else { cls3 = 'healthy' } // above max
```

**D. `seasonPhase` / `seasonNudge` — `src/services/season.js:28-58`**

```js
export function seasonPhase(stage) {
  const s = String(stage || '').toLowerCase()
  if (/germinat|seedling|transplant/.test(s)) return 'establishment'
  if (/grain|fill/.test(s)) return 'grainfill'
  if (/tiller|vegetative/.test(s)) return 'vegetative'
  if (/booting|elongation|flower|heading|reproductive|fruiting/.test(s)) return 'reproductive'
  if (/harvest|senescence|(^|[^a-z])mature([^a-z]|$)|maturation/.test(s)) return 'maturity'
  return null
}
export function seasonNudge(input) {
  const phase = seasonPhase(input.stage)
  if (!phase) return null
  const rice = isRiceCrop(input.cropEnglish)
  return { phase, isRice: rice, tipKey: `season.tip_${phase}_${rice ? 'rice' : 'generic'}`, windowKey: `season.window_${phase}` }
}
```

### 5.2 SQL for H (subscriptions) and I (schema/RLS)

**Profiles policies / subscription columns / role trigger** (000/009/012/019):

```sql
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text, co_op_name text, telegram_chat_id text unique,
  created_at timestamptz not null default now()
);
alter table profiles enable row level security;
create policy "Users can view own profile" on profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on profiles for update using (auth.uid() = id);

alter table profiles add column organization_id uuid references organizations(id) on delete set null;
alter table profiles add column subscription_tier text not null default 'free'
  check (subscription_tier in ('free','individual','coop'));
alter table profiles add column subscription_status text not null default 'active'
  check (subscription_status in ('active','trialing','past_due','canceled'));
alter table profiles add column subscription_source text not null default 'none'
  check (subscription_source in ('none','manual_grant','aba_payway'));
alter table profiles add column subscription_renews_at timestamptz;
alter table profiles add column max_aois integer not null default 1;
alter table profiles add column max_hectares numeric not null default 10;
alter table profiles add column consult_ai_enabled boolean not null default false;
alter table profiles add column preferred_language text not null default 'en'
  check (preferred_language in ('en','km'));

alter table public.profiles add column if not exists role text not null default 'farmer'
  check (role in ('farmer','extension_viewer'));

create or replace function public.protect_profile_role() returns trigger
language plpgsql as $$
begin
  if new.role is distinct from old.role and auth.role() = 'authenticated' then
    raise exception 'role cannot be changed by the user';
  end if;
  return new;
end $$;
create trigger profiles_protect_role before update on public.profiles
  for each row execute function public.protect_profile_role();
```

**`set_subscription_tier`** (012:103-152) — the missing REVOKE is the issue:

```sql
create or replace function public.set_subscription_tier(
  p_profile_id uuid, p_tier text,
  p_source text default 'manual_grant', p_notes text default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_max_aois integer; v_max_hectares numeric; v_consult_ai boolean;
begin
  if p_tier not in ('free','individual','coop') then raise exception 'invalid tier: %', p_tier; end if;
  case p_tier
    when 'free' then v_max_aois := 1; v_max_hectares := 10; v_consult_ai := false;
    when 'individual' then v_max_aois := 5; v_max_hectares := 100; v_consult_ai := true;
    when 'coop' then v_max_aois := 20; v_max_hectares := 1000; v_consult_ai := true;
  end case;
  update profiles set subscription_tier = p_tier, subscription_status = 'active',
    subscription_source = p_source, subscription_renews_at = now() + interval '30 days',
    max_aois = v_max_aois, max_hectares = v_max_hectares, consult_ai_enabled = v_consult_ai
  where id = p_profile_id;
  insert into billing_events (profile_id, event_type, tier, source, notes)
  values (p_profile_id, 'grant', p_tier, p_source, p_notes);
end;
$$;
-- NO revoke/grant in 012. Default PostgreSQL privilege = EXECUTE to PUBLIC.
```

**`upgrade_my_subscription`** (013:24-48) and its lock-down (014:166-171):

```sql
create or replace function public.upgrade_my_subscription(p_tier text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_tier not in ('individual','coop') then raise exception 'invalid tier: %', p_tier; end if;
  perform public.set_subscription_tier(auth.uid(), p_tier, 'manual_grant',
    'placeholder checkout — no real payment (ABA PayWay not wired yet)');
end; $$;
grant execute on function public.upgrade_my_subscription(text) to authenticated;

-- 014:
revoke execute on function public.upgrade_my_subscription(text) from authenticated;
grant execute on function public.upgrade_my_subscription(text) to service_role;
```

**`cancel_my_subscription`** (013:54-99): `security definer`, authenticated only, sets `status='canceled'` and inserts a `cancel` event.

**`finalize_aba_payment`** (014:103-158): `security definer`, `revoke all ... from public, authenticated`, grant to `service_role`; idempotent, locks the `payment_transactions` row, calls `set_subscription_tier` on approval.

**Billing/payment RLS** (012/014):

```sql
alter table billing_events enable row level security;
create policy "Users can view own billing events" on billing_events
  for select using (auth.uid() = profile_id);
-- No insert/update/delete for authenticated.

alter table public.subscription_prices enable row level security;
create policy "anyone can read prices" on public.subscription_prices
  for select to authenticated using (true);
-- No insert/update/delete for authenticated.

alter table public.payment_transactions enable row level security;
create policy "users can read their own payment transactions"
  on public.payment_transactions for select to authenticated
  using (profile_id = auth.uid());
-- No insert/update/delete for authenticated (service_role only).
```

**Fields/AOIs/alerts/observations/actions** full SQL is in I.22 above (`000`, `001`, `005`, `008`, `011`, `012`, `016`, `018`, `020`). `admin_*` RLS: select authenticated, no write policies (`018:42-56`).

**`get_commune_stress_summary`** (019:41-116): `security definer`, checks `profiles.role = 'extension_viewer'`, reads only `share_with_authorities = true` fields with `commune_code`, suppresses groups with fewer than 3 fields, returns `includes_demo`, and `revoke all ... from public, anon; grant execute ... to authenticated`.
