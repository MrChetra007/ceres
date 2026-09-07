# NDVI Monitor — Current Process Log

File that lets a future session (or a fresh AI context) pick up the exact state of the
NDWI/NDVI/RVI cloud-resilience work: what was fixed, how it was verified, what is still
open, and the deploy/push bookkeeping.

Last updated: 2026-09-07

---

## 0. TL;DR — where we are

- RVI (radar) substitution exists, and it is **NDVI-only by design** (see `no-data.md`).
  NDWI/LSWI/SAVI/EVI/GNDVI return honest `no_data` on a cloud-blocked date rather than a
  radar stand-in.
- Two backend bugs that were blocking ANY clear NDWI render are **fixed and pushed**:
  1. `s2cloudless` missing-granule → `Image.select: Band pattern 'probability' did not match
     any bands` and the homogeneous-type error: fixed by `addCloudProbability` cast-to-Float32
     + constant-0 band `merge()`. Committed: `e030468`, pushed.
  2. `validPixelFraction` was computing the `Math.max(0, mean-of-band-values)` — index
     dependent. NDWI is ≤ 0 over dry vegetation → always clamped to 0 → every clear NDWI
     scene failed the 0.6 coverage gate → `no_data_for_scene`. Fixed to measure the index
     band **mask** (0/1) instead. Committed: `26bbe76`, pushed.
- A **third** backend bug — `actionGetFieldStatus` hardcoded `"ndvi"` instead of
  `payload.index` — is **fixed in the working tree but NOT yet committed/deployed**.
- NDWI tile renders correctly (post-fix) — verified visually on 2026-09-05, ~19% cloud.

---

## 1. Repository layout

- Git repo root: `D:\vue projects\NDVI` (worktree subdir `ndvi-monitor/`).
- Remote: `origin https://github.com/MrChetra007/ndvi.git` (GitHub notes the canonical
  location has *moved* to `https://github.com/MrChetra007/ceres.git` — push still works to
  the old URL, but be aware).
- Frontend SPA: `ndvi-monitor/src/` (Vue 3 store: `src/store.js`, EE client:
  `src/services/earthEngine.js`).
- Backend Edge Functions: `ndvi-monitor/supabase/functions/`.
  - `ee-data/index.ts` — the deployed function (Deno bundles `_shared/*.ts`).
  - `ee-data/index.js` — a hand-maintained mirror, **NOT deployed** -> keep in sync anyway.
  - `_shared/cloudMask.ts` (+ `.js` mirror) — s2cloudless/SCL cloud mask + coverage helpers.
- Deploy command (from `ndvi-monitor/supabase`): `supabase functions deploy ee-data`.

---

## 2. What got fixed, in order (with evidence)

### 2.1 s2cloudless probability band — 500 errors (committed `e030468`, pushed)
Symptoms (4xx/500 from `ee-data`):
`Image.select: Band pattern 'probability' did not match any bands` then, after the first
attempt, `Expected a homogeneous image collection ... Mismatched type for band 'probability':
Expected MaskOnly, Actual Short<0,255>`.

Root cause: recent S2 scenes whose `COPERNICUS/S2_CLOUD_PROBABILITY` granule hasn't landed
yet produce an EMPTY lookup; `.sum()` over it yields no bands; `addBands` then drops it and
`scene.select("probability")` throws. Merging a plain `ee.Image(0)` fallback introduced a type
mismatch (Short vs MaskOnly).

Fix: in `_shared/cloudMask.ts` `addCloudProbability` — `.map(b => b.toFloat())` on the
selection and `ee.Image(0).toFloat().rename("probability")` merged in, so `.sum()` is
homogeneous and always carries the band (missing granule → all-zero probability = intended).

### 2.2 `validPixelFraction` measured band VALUES, not VALIDITY (committed `26bbe76`, pushed)
This is the one that kept NDWI in permanent "no data."
- OLD: `image.select(band).unmask(0)` then `Reducer.mean()` and `Math.max(0, …)`.
  Because masked pixels -> 0, the "fraction" was really the mean of the index with nodata
  counted as zero. NDVI (positive) could pass, NDWI (≤ 0 over vegetation) always read 0.
- NEW: `image.select(band).mask().unmask(0)` then `Reducer.mean()` — averages the 0/1 mask,
  i.e. the true fraction of valid pixels, index-independent.
- Applied to BOTH `.ts` and `.js` mirrors of `cloudMask`.

Verification: per-scene NDWI 2026-09-05 previously logged
`validFraction: 0, threshold: 0.6` (coverage gate fails). After the fix the same
(index, sceneDate) pair renders a real optical NDWI tile (dry tan/salmon over post-harvest
field, matches "Harvest / Senescence, Day 247"), no error toast, no radar fallback. That is
the "validFraction ≈ 1 → optical" outcome, confirmed visually.

### 2.3 `actionGetFieldStatus` hardcoded `"ndvi"` (working tree, NOT committed/deployed)
Bug: the scene-anchored sidebar grade in `actionGetIndexTile`'s sibling
`actionGetFieldStatus` always built the single-day composite with `"ndvi"` and read the
result under the `NDVI` band name, ignoring `payload.index` even though the frontend sends it
(`store.js: fetchSelectedSceneStatus` → `ee.getFieldStatus(..., forceRadar, state.currentIndex)`).

Fix applied (index.ts lines ~1480-1508, mirror `.js` same):
- `const index = payload.index && BANDS[payload.index] ? payload.index : "ndvi";`
  (same pattern as elsewhere; `BANDS` has no `"rvi"` key so a radar tab resolves to ndvi and
  reaches radar via `forceRadar` only).
- `buildMaskedComposite(geom, day, day.advance(1,"day"), index)`.
- `const name = index.toUpperCase();` for reading the reduced value.

Deliberately unchanged:
- Radar fallback remains NDVI-only (`allowRadarFallback` already respects index).
- The non-sceneDate 14/90-day window path (`computeNdviOverWindow`) stays NDVI — it's the
  field-health status, not the tile/hero series.

---

## 3. Debug logging added (kept in source, harmless after fix confirmed)

In `ee-data/index.ts`:
- `[DEBUG-RVI] actionGetIndexTile payload geometry` — payload dump (index/year/month/sceneDate/
  vertex count/bbox).
- `[DEBUG-RVI] step0-scene coverage check` — per-scene branch: index, sceneDate, dayCount,
  dayStartISO/dayEndISO, clearSceneCount, validFraction, threshold.
- `[DEBUG-RVI] step1 coverage check` — month-level branch: clearSceneCount, validFraction, threshold.
- `[DEBUG-RVI] per-scene optical RESULT returned in HTTP body` — logs the actual mode + validFraction
  put in the HTTP response (added to CORRELATE "computed" vs "returned").
- Various `[DEBUG-RVI]` branches in store.js (radar_fallback/cloud_blocked) from earlier.

Decision point: these were debugging aids. Once 2.3 is verified end-to-end, consider removing
or reducing them.

---

## 4. What to CHECK NEXT (in order)

1. **Deploy 2.3**: commit/push the current working tree, then
   `supabase functions deploy ee-data` (it bundles `_shared/cloudMask.ts`; the `.js` mirror is
   NOT what deploys).
2. **Verify 2.3 on the NDWI tab** (the exact scenario from the screenshot):
   - Load the same field, pin 2026-09-05, NDWI tab.
   - Sidebar "Field Reading" should now show the **real per-scene NDWI**, consistent with the
     tile's palette (dry end, plausibly ≈ -0.6). Previously it showed a hardcoded-NDVI number
     mislabeled "NDWI" (the -0.624 screenshot case: for dry harvest-stage surfaces the numbers
     happen to be numerically similar, so "it changed/stayed the same" both need a sanity read
     against the tile).
   - If the number is now NDWI-consistent -> bug 2.3 confirmed live before and fixed after.
3. **RVI tab regression check**: per-scene status on the RVI tab must still come from radar
   (`forceRadar` untouched) — spot-check one cloud-blocked + one clean date.
4. **NDVI regression**: the most-used tab — a clean month must still be `optical`, a
   cloud-blocked month must still fall back to RVI month-level (`radar_fallback`) and, for a
   per-scene click, `radar_scene_fallback`.
5. **Confidence badge**: with 2.3 deployed, verify HIGH/MEDIUM confidence still reads from
   `selectedSceneStatus.validFraction` (now NDWI-true) — `fieldConfidence` in
   FieldDetailPanel.vue downgrades to MEDIUM below 0.6; the pinned-scene cloud badge path is
   unaffected.
6. **Cleanup logging** (optional): strip `[DEBUG-RVI]` after everything is confirmed.

---

## 5. Bookkeeping + gotchas

- Local branch is currently in sync with `origin/main` for pushed commits; the 2.3 fix is
  UNCOMMITTED working-tree changes to `ee-data/index.ts` + `ee-data/index.js`.
- NEVER commit or push the three untracked credential JSONs in the repo root
  (`oauth-client_secret_…json`, `old-project-worker-gen-lang-client-…json`,
  `trim-array-479621-…json`) — they are credentials. Stage only the intended files.
- `.js` mirrors exist for `_shared/cloudMask.ts` and `ee-data/index.ts`; they must be edited in
  lockstep (grep for `index.js` duplicates when changing `index.ts`).
- Cloud-resilience rules to preserve (they are deliberate):
  - Radar fallback is **NDVI-only** + explicit RVI tab. Never widen to NDWI/LSWI without user approval.
  - `clearSceneCount` is the raw scene count, NOT "number of clear scenes".
  - `MIN_VALID_PIXEL_FRACTION = 0.6` gates both per-scene (step0) and month-level (step1) optical.
  - Per-scene requests bypass the tile cache (`if (!payload.sceneDate)` guard) — do not "optimize"
    that away; cache rows are keyed on (index, year, month, geometry_hash, mode), not date.
- "three numbers, one panel" caveat for the record: the AIM card (80/100) comes from a THIRD
  action `getFieldHealthScore` (blends ndvi/lswi/evi), independent of the NDWI tile and the
  Field Reading card. Don't expect them to match the tile.