-- ============================================================================
-- EE Cost Control — closed-period cache
-- migrations/012_ee_cost_control_cache.sql
--
-- Targets the two confirmed hotspots in supabase/functions/ee-data/index.ts:
--   - actionGetAllFieldTrends  (fields x months, recomputed in full every call)
--   - actionGetObservations    (~14-month lookback, recomputed in full every call)
--
-- Design note: these two functions return different shapes, so they get two
-- cache tables rather than one generic ee_cache table:
--   - ee_trend_cache        one row per (field, index, calendar month)
--   - ee_observation_cache  one row per (field, scene date)
--
-- IMPORTANT — ee_observation_cache deliberately does NOT store `status`
-- ('blocked'/'low'/'clear'). In actionGetObservations, `status` depends on
-- ageDays relative to the CURRENT date ("low" = older than 21 days from
-- *today*, not from the scene date), so it is not a fixed fact about a past
-- scene — it changes over time even for a scene that will never get new
-- satellite data. Only cloudCover and ndvi are true immutable facts once a
-- scene's date has passed. `status` must be recomputed at read time from
-- cached cloudCover + "now", never cached as a stored value.
-- ============================================================================

-- ── ee_trend_cache ───────────────────────────────────────────────────────
-- One row per (field, index, year, month). `points` mirrors the per-field
-- `points` array actionGetAllFieldTrends already returns
-- ([{date, cloudPct, value}, ...]), so callers merge cached + freshly
-- computed months without reshaping data.
--
-- is_closed_period = true  → the calendar month has fully elapsed; the row
--   is permanent and is never recomputed or overwritten.
-- is_closed_period = false → this is the current, still-in-progress month;
--   it gets recomputed on every call it's included in (short-lived, not
--   really "cached" — the row just holds the latest computed value so the
--   function can UPSERT it without an extra branch).
create table if not exists ee_trend_cache (
  field_id uuid not null references fields(id) on delete cascade,
  index text not null check (index in ('ndvi','ndwi','lswi','savi','evi','gndvi')),
  year int not null,
  month int not null check (month between 1 and 12),
  points jsonb not null,
  is_closed_period boolean not null default false,
  computed_at timestamptz not null default now(),
  primary key (field_id, index, year, month)
);

create index if not exists ee_trend_cache_lookup
  on ee_trend_cache (field_id, index, year, month);

alter table ee_trend_cache enable row level security;
-- No end-user policies: this table is only ever read/written by the ee-data
-- Edge Function using the service_role key (same trust boundary as the EE
-- service account itself). RLS is enabled with zero policies so it fails
-- closed if anon/authenticated roles are ever queried against it directly.

-- ── ee_observation_cache ─────────────────────────────────────────────────
-- One row per (field, scene_date). A given Sentinel-2 scene for a given
-- field+date never changes once it exists in the archive, so every row here
-- is permanent — there is no is_closed_period flag, because there is no
-- "open" state for an individual scene (see the status note above for the
-- one field that's still time-dependent).
create table if not exists ee_observation_cache (
  field_id uuid not null references fields(id) on delete cascade,
  scene_date date not null,
  source text not null default 'Sentinel-2',
  cloud_cover numeric,
  ndvi numeric,
  computed_at timestamptz not null default now(),
  primary key (field_id, scene_date)
);

create index if not exists ee_observation_cache_lookup
  on ee_observation_cache (field_id, scene_date);

alter table ee_observation_cache enable row level security;
-- Same reasoning as ee_trend_cache — service_role only, no end-user policies.

-- ── fields: revisit-cadence gating columns (§3.2 of the cost-control plan) ─
-- Used by the alert worker to only act on fields whose next expected
-- Sentinel-2/Landsat pass has arrived, instead of a blind daily cron sweep.
-- Not wired up in this migration — see the .md directive for the worker-side
-- changes, since ee-alerts-worker's source wasn't available to reference here.
alter table fields
  add column if not exists next_expected_pass date,
  add column if not exists imagery_source text not null default 'sentinel-2';

-- ============================================================================
-- Verification queries — run manually after applying:
--
-- select count(*) from ee_trend_cache where is_closed_period = true;
-- select count(*) from ee_observation_cache;
-- select id, next_expected_pass, imagery_source from fields limit 5;
-- ============================================================================
