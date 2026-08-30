# EE Cost Control — Implementation Directive

Target file: `supabase/functions/ee-data/index.ts`
Migration: `012_ee_cost_control_cache.sql` (run this first)

Scope: this pass touches ONLY `actionGetAllFieldTrends` and
`actionGetObservations` — the two confirmed hotspots (recomputing ~720 and
~84 images respectively on every call). Every other action in this file
(`getIndexTile`, `getFieldStatus`, `getFieldHealthScore`,
`getRecentIndexValue`, `getAllFieldStatuses`, etc.) is intentionally left
untouched — they use rolling 14/90-day "as of now" windows, not closed
calendar periods, so the permanent-cache approach below does not apply to
them. Do not extend this pattern to those functions without a separate
design pass.

---

## 0. Add a Supabase client to the function

`ee-data/index.ts` currently has no Supabase client — it only talks to Earth
Engine. Add one, using the service role key so cache reads/writes bypass RLS
(this function is already a trusted server context, same as the EE service
account credential it holds):

```ts
import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected into every
Supabase Edge Function — no new secret to add.

---

## 1. `actionGetAllFieldTrends` — closed-month cache

Current behavior: for every call, computes `points` for every field × every
month in `payload.months`, via one batched `fc.map()` + `evaluate()`.

New behavior:

1. Split `payload.months` into `closedMonths` and `openMonths`:
   a month is closed when `end-of-month <= now` (i.e. `ee.Date.fromYMD(year, month, 1).advance(1, "month")` has passed real-world "now" — compute this in plain JS with `Date`, not EE, since it's just a calendar comparison).

2. For `closedMonths`, query `ee_trend_cache` for all `(field_id, index, year, month)` combinations across the incoming field list in one `select ... in (...)` call. Track which `(field, month)` pairs came back — those are served straight from cache, no EE call.

3. Build the actual EE request set = `openMonths` (always recomputed — current month isn't final yet) **plus** any `closedMonths` not found in cache (first time this field/month/index combo has ever been requested). Run the *existing* `fc.map()` batched logic, but scoped to just this reduced month set instead of the full `payload.months`.
   - In steady state, after the first pass populates the cache, this reduces to "just the open month" — matching the ~93% reduction from the plan doc.
   - Early on (first calls after this ships), the missing-closed-month set may still be large per field — that's expected; it's a one-time backfill cost, not a per-call recurring one.

4. After EE returns results for the computed month set, `upsert` them into `ee_trend_cache`:
   - Rows for months that are now closed → `is_closed_period = true`.
   - Row for the current open month → `is_closed_period = false`, overwritten every call (upsert on the `(field_id, index, year, month)` primary key handles this).

5. Merge: for each field, concatenate `points` from (cached closed months) + (freshly computed months, in month order) and return in the same `{ trends: [{ id, points }] }` shape as today. Order matters for the trend chart — sort the merged point list by `date` before returning, don't rely on months already being in order after the merge.

**Edge case to handle explicitly:** if `ee_trend_cache` has cached months for some fields but not others (e.g., a field was added after the cache was last populated for that month), the missing-month set differs per field. Simplest correct approach: compute the *union* of missing months across all fields, request that whole month range for the whole field batch (some fields will get months they already had cached recomputed — wasteful but rare and self-correcting after one call), rather than building N different per-field EE requests. Only optimize this further if it turns out to matter in practice.

---

## 2. `actionGetObservations` — per-scene cache

Current behavior: recomputes NDVI over the full lookback window (default 14
months) on every call, one `fc.map()` + `evaluate()` over every S2 image in
range.

New behavior:

1. Query `ee_observation_cache` for `field_id = ?` and `scene_date` within `[startISO, endISO]`. These rows are permanent — a scene that's already in the table never needs to be recomputed.

2. Determine the actual EE query range as `[max(cached max scene_date) + 1 day, endISO]` — i.e., only fetch scenes newer than the newest one already cached. If nothing is cached yet for this field, fall back to the full `[startISO, endISO]` range (first-time population).

3. Run the *existing* `collection.map()` logic scoped to that reduced date range, computing `cloudCover` and `ndvi` per scene (drop the `status`/`stale`/`blocked` computation from what gets stored — see the note below).

4. `upsert` the newly computed scenes into `ee_observation_cache` (`cloud_cover`, `ndvi`, `source = 'Sentinel-2'`), keyed on `(field_id, scene_date)`.

5. Merge cached rows + newly fetched rows, then **compute `status` at read time** for every row (cached and fresh alike), using the same logic already in the file:
   ```ts
   const ageDays = (Date.now() - new Date(row.scene_date).getTime()) / 86400000;
   const status = row.cloud_cover >= 40 ? "blocked" : ageDays >= 21 ? "low" : "clear";
   ```
   This must run on cached rows too, every call — do not store `status` in `ee_observation_cache` and do not skip this step for cache hits. A scene cached last month as `"clear"` needs to report `"low"` today if it's now more than 21 days old, even though its `cloud_cover`/`ndvi` never changed.

6. Return `{ rows }` in the same shape as today, sorted by date (the merge from two sources needs an explicit sort — don't assume cache rows and fresh rows arrive pre-interleaved).

---

## 3. Testing before shipping

- Call `getAllFieldTrends` twice in a row for the same field/index/month range. Second call should show near-zero EE compute time in the `[ee-data] getAllFieldTrends ok in Nms` log line, and `ee_trend_cache` should have `is_closed_period = true` rows for every month except the current one.
- Call `getObservations` for a field, wait (or manually insert an old cached row with `scene_date` 25+ days in the past), call again — confirm that scene's `status` reads as `"low"` even though nothing recomputed it.
- Confirm a brand-new field (nothing in either cache table) still returns correct, complete data on its first call — this is the fallback path in step 2 of each section above and is the easiest place for an off-by-one on the date range to hide.

## 4. Explicitly out of scope for this pass

- `next_expected_pass` / `imagery_source` gating in the alert worker (§3.2/§3.3 of the original cost-control plan) — those columns are added by the migration but not wired up here, since `ee-alerts-worker`'s source wasn't available to write against directly. Do that as a separate pass once you can share that function's code.
- Tile-grouping (§3.3) and the concurrency-capped queue (§3.5) — both alert-worker-side, same reason.
- Consult AI usage quotas (§7 of the original plan) — unrelated system, separate schema addition.
