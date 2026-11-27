# Task: fix confirmed Ceres bugs

Project: `D:\SAAS\NDVI\ndvi-monitor`. Read `docs/PROJECT_CONTEXT.md` and `INVESTIGATION_REPORT.md` first.

## Owner decision (fill in before running)
RICE_STAGE_TABLE = ASK
(`CLIENT` = table in src/config.js, `SERVER` = table in _shared/growthStage.ts, or paste a new table)

## Rules
- Work on a new branch `fix/audit-2026-11`. One commit per phase. Do not push.
- Do not deploy, run migrations, or change live data. Write the SQL and commands; the owner runs them.
- Read each file in full before editing. Re-verify each bug in code; the report may be wrong.
- Edit only `index.ts` entrypoints, never the stale `index.js` files.
- Keep `decision.js`/`decision.ts`, `season.js`/`season.ts` and the stage tables in sync.
- Every new UI string goes in both `en.js` and `km.js`. Keep layouts mobile-safe.
- No refactoring outside these fixes. Never print or commit secrets.
- After each phase run `npm run build` and the tests, report the real results, then STOP and wait for "continue".

## Phase 1: security
1. Ensure `migrations/023_lock_subscription_security.sql` is in the repo (ask for it if missing). Do not rewrite it.
2. `consult-ai/index.ts`: before any service-role read or write, verify the JWT user owns `fieldId`. Return 403 otherwise. Check every other Edge Function that accepts a field id and report the results.
3. Remove `testcommand.txt` from tracking and add it to `.gitignore`. Do not rewrite git history; give the owner the steps.

## Phase 2: satellite numbers
4. SAVI and EVI: divide NIR, RED and BLUE by 10000 before the expressions, everywhere they are computed. Leave ratio indices unchanged. Limit EVI to -1..1.
5. Invalidate old SAVI/EVI values: provide SQL for `ee_tile_cache` and `ee_trend_cache`, and invalidate the IndexedDB and AIM caches. Check the color ranges and report before/after values if you can.
6. Export: `aim.components` = normalized values, `aim.raw_values` = raw values. Bump the schema to `ceres.field.v2`.

## Phase 3: trend and stages
7. 14-day change: compare the latest clean point with the one closest to 14 days earlier, only if the gap is 10-24 days. Otherwise return null. Exclude cloud-blocked rows and use the same cloud mask in every series.
8. Apply this in all call sites: export, field panel, triage, consult-ai, alerts worker. Keep each caller's sign convention. Export `compared_from`, `compared_to`, `gap_days`.
9. Add tests: gap of 3 and 85 days (null), exactly 14 days, empty series, zero value.
10. Rice stages: if RICE_STAGE_TABLE = ASK, show both tables side by side and stop. Otherwise use one table in client and server, update the Help modal and season mapping, and add a parity test.

## Phase 4: harvest and freshness
11. `migrations/024_harvest_date.sql`: add nullable `fields.harvest_date`, not earlier than `planting_date`.
12. Let the user set and clear it. On or after that date: show "Harvested", no health status or action tier, and skip in triage and alerts. Earlier readings stay visible. Check the effect on the government summary and report it.
13. Next to the status, always show the image date and age in days.
14. Near maturity, make clear that the season note is timing guidance, so it does not read as contradicting "keep normal practices".
15. Rainfall: distinguish "not loaded", "unavailable" and 0 mm. The menu export must load it or say it was not loaded.

## Out of scope
Edge-pixel buffer, cloud-buffer constant, organization tables (now migration 025), PlanetScope.

## Final report
Write `docs/FIX_REPORT.md`: files changed, tests run with real output, what was not verified, SQL and deploy commands in the order the owner must run them, and a manual test checklist. Remember `ee-data`, `consult-ai` and `ee-alerts-worker` need deploying with the matching client build.
