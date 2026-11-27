# Task: investigate Ceres and write a report

You are investigating the Ceres app at `D:\SAAS\NDVI\ndvi-monitor`. Read `docs/PROJECT_CONTEXT.md` first.

## Rules
- **Investigation only.** Do not edit code, run migrations, deploy, or change database data.
- The only file you may create is `docs/INVESTIGATION_REPORT.md`.
- Read each relevant file in full before answering.
- Back every answer with `file path : line numbers` and a short code excerpt.
- Label each answer **CONFIRMED** (seen in code or output), **LIKELY** (inferred) or **UNKNOWN** (say what is needed).
- Never write secrets (keys, tokens, JWTs, passwords) into the report. Say only where they are.
- Check which entrypoint is really deployed (`index.ts` vs stale `index.js`). If you cannot verify it, say so.

## Test case
Export from 2026-11-27 for field `srea sdav` (id `03be58a4-daf2-45a3-924d-999b3cb69439`):
- rice, 3.18 ha, planted 2026-07-08, harvested around 2026-11-27 (day 142)
- latest reading 2026-11-18: NDVI 0.711, `healthy`, confidence `high`
- trend points: 2026-08-25 = 0.444, 2026-11-15 = 0.745, 2026-11-18 = 0.711
- `change_14d_pct` = 60.1
- `aim.components`: ndvi 0.7256, lswi 0.2461, evi 2.0512; `aim.score` 84
- `weather.rainfall_21d_mm` = null

## Questions

### A. 14-day trend
1. How is `change_14d_pct` calculated? 60.1 equals the change from 08-25 to 11-18. Is that what happens?
2. What happens when no point exists near 14 days earlier?
3. Where is this value used (UI, decision engine, Consult AI, alerts worker, export)? Do they all calculate it the same way?

### B. EVI and AIM score
4. Show the EVI formula and band scaling. Are bands converted to reflectance (divided by 10000) before EVI and SAVI?
5. Is `aim.components.evi` raw EVI or a normalized value? Why can it be 2.05?
6. Which cloud and shadow mask applies to this value? Is the result clamped or filtered?
7. How does an EVI of 2.05 affect the AIM score of 84? Show the arithmetic.
8. Why do `aim.components.ndvi` (0.7256) and `current.value` (0.711) differ (date window, mask, reducer)?

### C. Stale data and confidence
9. How is confidence calculated? Does image age affect it?
10. Does the UI show the image date and age next to the status?
11. Were there Sentinel-2 passes over this field between 11-18 and 11-27? If you can query it, list date, cloud percentage and why each was used or rejected.

### D. Harvest stage
12. What are the rice stage ranges and NDVI thresholds at day 142?
13. Why can the result be "keep normal practices" while the season note says to drain before harvest?
14. Can a user record a harvest date? What happens to status, alerts and triage after harvest?

### E. Rainfall
15. Why is `rainfall_21d_mm` null? Is it the export, the UI state, the data source or an error?

### F. Field geometry and pixels
16. This field is long and narrow (about 50-65 m wide). Are edge pixels included? Is there an inward buffer?
17. Which reducer and scale are used, and how many valid pixels does this field have? Is that count stored or shown?

### G. Caching
18. Could any server or client cache have served old values for this field? List each cache, its key and its expiry.

### H. Security
19. Can a user update their own `subscription_*` columns, `role`, or call `upgrade_my_subscription` to get a paid plan free? Include the full SQL of every related policy, grant, trigger and function.
20. Is there a bot token or JWT in `testcommand.txt`, other files or git history? Report locations only.
21. `.env` lacks the `VITE_` prefix. Which hardcoded fallbacks are used?

### I. Organization version (for ministry and NGO users)
22. Include the full current schema and RLS for `profiles`, `fields`, `aois`, `alerts_log`, `field_observations`, `field_actions`, plus the next free migration number.
23. What in the code assumes one owner per field?

## Report format
1. **Summary:** table of issue, status, severity (high / medium / low), files.
2. **Answers:** numbered 1-23, with evidence.
3. **Suggested fixes:** describe them in order of priority. Do not apply them.
4. **Could not verify:** what you could not check and why.
5. **Appendix:** full source of the functions behind sections A-D and the SQL for H and I.
