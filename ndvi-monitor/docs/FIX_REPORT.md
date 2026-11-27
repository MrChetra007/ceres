# Ceres Fix Report — audit/2026-11

Branch: `fix/audit-2026-11`
Scope: `docs/fixes/ceres-fix-prompt.md` (Phases 1–4), investigation evidence in `docs/INVESTIGATION_REPORT.md`.
No Edge Function was deployed, no migration was run, and no live data was changed. The SQL/commands below are for the owner to run.

**Remote note:** `origin` is still `https://github.com/MrChetra007/ndvi.git`, but GitHub now reports the repo as `https://github.com/MrChetra007/ceres.git`. The push to the old URL redirected successfully. The branch was pushed through commit `9e40bfc`; the Phase 4 commit is local until you ask to push it.

---

## 1. Commits

| Commit | Scope |
|---|---|
| `be8b592` | Phase 1 — 023 migration, consult-ai ownership check, untrack `testcommand.txt` |
| `a247c0b` | Docs — investigation report + fix prompt |
| `86b56e0` | Phase 2 — SAVI/EVI reflectance scaling, export v2, client cache invalidation |
| `1af0f29` | Phase 3a — bounded 14-day trend + shared cloud-aware helper |
| `9e40bfc` | Phase 3b — CLIENT rice table as single source + parity tests |
| Phase 4 (this commit) | Harvest date, harvested state, image date/age, season note, rainfall states, this report |

---

## 2. Files changed

### Phase 1 — security
- `supabase/functions/consult-ai/index.ts` — after the JWT user is resolved and before any field-scoped service-role read/write, verifies `fields.id = fieldId AND owner_id = user.id`. Missing id → 400, not owned → 403, lookup error → 500.
- `migrations/023_lock_subscription_security.sql` — added unchanged (committed, not applied). Adds `protect_profile_billing` trigger and revokes/grants the privileged RPCs.
- `.gitignore` — adds `testcommand.txt`.
- `testcommand.txt` — removed from tracking (`git rm --cached`); the local file still exists on disk. It remains in git history; see §5.

### Phase 2 — satellite numbers
- `supabase/functions/ee-data/index.ts` — `applyIndex()` now scales B8/B4/B2 by `10000` for SAVI/EVI only (`scaledBand()`), and clamps EVI to `[-1, 1]`. Ratio indices unchanged. Only `index.ts`; stale `index.js` untouched.
- `src/services/fieldExport.js` — schema `ceres.field.v2`; `aim.components` = normalized, `aim.raw_values` = raw; added `weights` unchanged.
- `src/services/tileCache.js` — IndexedDB `DB_VERSION = 2` deletes the v1 store on upgrade (invalidates all cached SAVI/EVI tiles).
- `src/services/aimScoreCache.js` — cache key includes `AIM_CACHE_VERSION='v2'`.
- `docs/PROJECT_CONTEXT.md` — v1 → v2 export references.

### Phase 3 — trend + stages
- `src/services/trend.js` + `supabase/functions/_shared/trend.ts` — new shared `calcTrendChange()`: latest **clean** point vs. the clean point **closest to 14 days** earlier, only if gap 10–24 days; drops `cloudPct >= 40` and `status === 'blocked'`; one row per date (lowest cloud); returns signed `pct`, `comparedFrom`, `comparedTo`, `gapDays`; zero baseline → null.
- `src/services/fieldExport.js` — uses the helper; exports `change_14d_pct`, `compared_from`, `compared_to`, `gap_days`.
- `src/components/FieldDetailPanel.vue`, `src/components/TodayTriage.vue` — use the helper.
- `supabase/functions/consult-ai/index.ts` — uses the helper; prefers the client’s clean `ndviTrend`, falls back to `observationHistory` for older clients.
- `supabase/functions/ee-alerts-worker/index.ts` — trend series now uses the pixel-level cloud mask; keeps its local “positive = fall” prompt convention and passes the signed value to `buildDecision`.
- `supabase/functions/ee-data/index.ts` — `getAllFieldTrends` now uses `s2Collection` (pixel mask), matching `getIndexTimeSeries`.
- `src/data/stages.js` — new pure source for `RICE_GROWTH_STAGES` / `GENERIC_GROWTH_STAGES`; `src/config.js` re-exports.
- `supabase/functions/_shared/growthStage.ts` — rice table is now the CLIENT table verbatim; generic `Flowering` → `Flowering / Fruiting`.
- `supabase/functions/_shared/primaryIndex.ts` — early stages `Transplanting`/`Tillering` (SAVI).
- `src/components/HelpModal.vue` — new rice stage ranges (1–10, 11–30, 31–55, 56–75, 76–100, 101+).
- `src/i18n/en.js`, `src/i18n/km.js` — new stage labels + descriptions.
- `tests/trend.test.js`, `tests/stages.test.js` — parity/behaviour tests.
- `package.json` — `npm test` script.

### Phase 4 — harvest + freshness
- `migrations/024_harvest_date.sql` — nullable `fields.harvest_date` + `CHECK (harvest_date IS NULL OR planting_date IS NULL OR harvest_date >= planting_date)`; safe to re-run.
- `src/services/harvest.js` — `harvestDateOf`, `isHarvestedOn`, `isHarvestedNow`, `isHarvestedForMonth`. A future planned date does **not** mark a field harvested; the harvest month and later do, once the date has passed.
- `src/services/supabase.js` — `mapRowToField` includes `harvestDate`.
- `src/store.js` — `rainfallStatus` state (`idle`/`loading`/`ready`/`unavailable`); sets it in `loadField`/`loadRainfall`/detach; new `setFieldHarvestDate()` (updates DB + reactive field).
- `src/components/FieldHarvestModal.vue` — date picker (min = planting date), Save, Clear; future dates allowed for planning.
- `src/components/FieldDetailPanel.vue` — harvest row + edit pencil; "Harvested" hero status; hides AIM/decision/stress/season/stage/confidence/benchmark when viewing the harvest month or later; earlier months remain in health view; always shows image date + age; season-note timing disclaimer near maturity; rainfall state text.
- `src/components/TodayTriage.vue` — skips harvested fields.
- `supabase/functions/ee-alerts-worker/index.ts` — selects `harvest_date`; skips a field on/after its harvest date before any EE work or Telegram message.
- `src/services/fieldExport.js` — adds `field.harvest_date`, `current.harvested`; calls `decision`/`season_note`/`aim` null when harvested; adds `weather.rainfall_status`; loads rainfall if not loaded (menu export) or reports `not_loaded`/`unavailable`.
- `src/i18n/en.js`, `src/i18n/km.js`, `src/styles/field-detail.css` — harvest strings + small layout additions.
- `tests/harvest.test.js` — harvest-state tests.

---

## 3. Tests and build (real output)

`npm test`:

```
✔ 22 tests, 22 pass, 0 fail
  - trend.test.js (10): gap 3/85 rejected; exactly 14 accepted; empty/null; zero baseline; zero latest; 10/24 bounds; closest-to-14; cloud-blocked row/candidate skipped
  - stages.test.js (6): client/server rice + generic tables identical; stageForDay parity days 0–200; season mapping for every stage; rice/generic nudge
  - harvest.test.js (6): harvestDateOf; on/after date; past/future now; earlier months visible; future planned date; missing month
ℹ duration_ms ~80ms
```

`npm run build`:

```
✓ 386 modules transformed
✓ built in 436ms
Warnings (pre-existing): direct eval in lottie-web; chunks >500 kB; ineffective dynamic imports
```

`deno` is not installed in this environment, so the Edge Functions were **not** Deno type-checked. The tests do import `_shared/growthStage.ts` and `_shared/season.ts` via Node 24 type stripping, so those modules were parsed/executed.

---

## 4. What was not verified

- Live database: migrations 023/024, policies, triggers and function grants were not applied or inspected in the project. Re-check `pg_policies`, `information_schema.routine_privileges` and `\df+` after running the SQL.
- Deployed entrypoints: the repo still contains stale `index.js` files next to every `index.ts`. We edited only `.ts`. It is **UNKNOWN** which file the live project currently runs; deploy `.ts` explicitly and verify with `supabase functions logs`.
- Earth Engine values: the post-fix SAVI/EVI values, Sentinel-2 passes between 2026-11-18 and 2026-11-27, the field’s valid-pixel count, and the actual IMERG response were not queried (no session/geometry/EE access).
- Manual browser tests: not run here (no signed-in browser session). Use the checklist in §7.
- Government summary behaviour: not changed; see §6.
- `testcommand.txt` history purge and bot-token rotation: not performed; see §5.

---

## 5. Secrets / history actions (owner)

`testcommand.txt` is untracked and ignored, but the Telegram bot token and anon JWT are still present in git history and on disk. The bot token must be treated as compromised:

1. Rotate the Telegram bot token with BotFather.
2. Delete the local `testcommand.txt`.
3. Purge it from history (choose one) and force-push all branches/tags:
   ```powershell
   git filter-repo --path ndvi-monitor/testcommand.txt --invert-paths
   # or: bfg --delete-files testcommand.txt
   git push --force --all
   git push --force --tags
   ```
4. Tell collaborators to re-clone; old clones still contain the token.

The anon JWT is a public client key by design, but it is hardcoded in `src/config.js:6`. For a clean setup, put `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` in `.env` (or the host’s build env) and remove the fallback.

---

## 6. Government summary effect (reported, not changed)

`public.get_commune_stress_summary()` (019) selects every shared field with a `commune_code`; it has **no harvest filter**. Consequences after Phase 4:

- A harvested field still contributes to `field_count`.
- Its latest `alerts_log` status still contributes to `healthy_count` / `below_expected_count` / `stressed_count` / `radar_flag_count` / `no_data_count` until a newer alert exists.
- `suppressed` (< 3 fields) and `includes_demo` behave as before.

If you want harvested fields excluded, add this predicate to the `shared` CTE in `get_commune_stress_summary` (not applied):

```sql
and (f.harvest_date is null or f.harvest_date > current_date)
```

Alternatively, keep them counted for historical transparency and add a separate `harvested_count` column. Decide before a ministry/NGO demo.

---

## 7. SQL + deploy commands, in order

Run from `D:\SAAS\NDVI\ndvi-monitor`. Replace `psql` with the Supabase SQL Editor if preferred. **Do not deploy the new `ee-alerts-worker` before migration 024** (it selects `harvest_date`).

```powershell
# 0. Sanity
npm install
npm test
npm run build

# 1. Phase 1 security (run 023, then verify the grant check output)
psql -v ON_ERROR_STOP=1 -f .\migrations\023_lock_subscription_security.sql

# 2. Phase 4 schema (must precede the new worker/client)
psql -v ON_ERROR_STOP=1 -f .\migrations\024_harvest_date.sql

# 3. Deploy the changed functions (confirm the .ts entrypoint is used)
supabase functions deploy ee-data
supabase functions deploy consult-ai
supabase functions deploy ee-alerts-worker

# 4. Invalidate pre-fix SAVI/EVI server caches AFTER the ee-data deploy
psql -v ON_ERROR_STOP=1 -c "delete from public.ee_tile_cache where index in ('savi','evi'); delete from public.ee_trend_cache where index in ('savi','evi');"

# 5. Deploy the client build produced by step 0 (same release as the functions)
#    Users must reload once; the IndexedDB v2 store and AIM v2 key do the rest.

# 6. Optional: retire the stale index.js duplicates so deploys cannot pick them
#    (review first; do not delete until the .ts entrypoint is confirmed live)
```

Deploy `ee-data`, `consult-ai` and `ee-alerts-worker` together with the matching client build. The client now sends `ndviTrend` (consult-ai accepts old clients via fallback), the worker expects `harvest_date`, and the client/server stage tables must be the same release.

---

## 8. Manual test checklist

1. **Security**
   - As a signed-in user, try `PATCH /rest/v1/profiles?id=eq.<own>` with `subscription_tier=coop` / `max_aois=20`: must fail.
   - `select public.set_subscription_tier(...)`, `upgrade_my_subscription`, `finalize_aba_payment` as a normal user: must fail (service_role only; `cancel_my_subscription` still works).
   - Call `consult-ai` with another user’s field id: expect 403; own field: works.
2. **SAVI/EVI**
   - After the ee-data deploy + cache delete, open SAVI/EVI: values are ~0–1, EVI no longer saturates; AIM score changes.
3. **Trend**
   - JSON export from the test field (`srea sdav`): `trend.change_14d_pct` is `null` (08-25 is 85 days away, 11-15 is 3 days away); `compared_from/to/gap_days` are null together.
   - Find a field with a clean point ~10–24 days earlier: the percentage is computed and the compared dates are present.
4. **Stages**
   - Help modal shows Transplanting 1–10, Tillering 11–30, Stem/Booting 31–55, Flowering/Heading 56–75, Grain Fill/Maturity 76–100, Harvest/Senescence 101+.
   - Day 142 shows Harvest/Senescence on both the client hero and the worker/alert path.
5. **Harvest**
   - Open a field → metadata → pencil beside Harvest date → set a date; Save. Status becomes “Harvested”, AIM/decision/stress/season/stage/confidence/benchmark disappear; chart/rainfall/forecast/observations remain.
   - Scrub to a month before the harvest month: health/AIM/decision return; harvest month/later: Harvested.
   - Clear the date: normal health view returns.
   - Today triage does not list the harvested field.
   - Run the alerts worker: the field is skipped with reason `harvested`.
   - JSON export: `field.harvest_date`, `current.harvested=true`, `decision=null`, `season_note=null`, `aim=null`, `trend.points` still present.
6. **Image date/age**
   - Hero always shows “Image <date> · N days old”; cloud-blocked/radar months show the last-clear date/age honestly; no date → “Image date unavailable”.
7. **Season note**
   - Near maturity, the card shows the timing-only disclaimer; it does not change the decision tier.
8. **Rainfall**
   - Fresh field: “Loading…” then either `N mm` (including `0 mm`) or “Data unavailable”.
   - Panel not loaded: “Not loaded”.
   - Menu JSON export with rainfall not loaded: it fetches and writes `rainfall_status: ready`/`unavailable`, or `not_loaded` when there is no geometry.
9. **Government (after deciding §6)**
   - If you add the optional harvest filter, a harvested shared field must disappear from the commune `field_count`/status counts; otherwise confirm it is still counted and label it as historical.
