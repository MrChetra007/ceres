-- ============================================================================
-- EE Cost Control — index tile cache
-- migrations/015_ee_tile_cache.sql
--
-- Targets actionGetIndexTile in supabase/functions/ee-data/index.ts — the
-- interactive map overlay (NDVI/NDWI/LSWI/SAVI/EVI/GNDVI + the radar/cloud-
-- blocked true-color fallbacks). Unlike the trend/observation caches, this
-- action was previously NOT cached at all: every slider/month change that
-- landed back on an already-visited (index, month) re-ran the full Earth
-- Engine composite computation and minted a fresh tile URL.
--
-- What we cache: the tile URL + the parallel facts the frontend renders
-- (mode, count, index_used, cloud_pct, last_valid_date), keyed on
-- (index, year, month, geometry_hash). The geometry hash is a stable server-
-- side digest of the AOI/field GeoJSON, so a given area always maps to the
-- same row.
--
-- IMPORTANT — unlike ee_trend_cache (which stores immutable VALUES and can
-- hold closed months forever), a cached tile row stores a SIGNED Earth Engine
-- MAP URL, which is time-limited and expires. So even "closed" months must be
-- refreshed periodically (TTL), never cached permanently. See the function:
--   - closed month  → TTL 12h (the composite is deterministic once the month
--                      has elapsed, but the token still lapses)
--   - open month    → TTL 20min (so newly-captured scenes surface promptly)
-- ----------------------------------------------------------------------------
create table if not exists ee_tile_cache (
  index text not null check (index in ('ndvi','ndwi','lswi','savi','evi','gndvi','rvi')),
  year int not null,
  month int not null check (month between 1 and 12),
  geometry_hash text not null,
  mode text not null,
  url text,
  count int not null default 0,
  index_used text,
  cloud_pct numeric,
  last_valid_date text,
  is_closed_period boolean not null default false,
  computed_at timestamptz not null default now(),
  primary key (index, year, month, geometry_hash)
);

create index if not exists ee_tile_cache_lookup
  on ee_tile_cache (index, year, month, geometry_hash);

alter table ee_tile_cache enable row level security;
-- No end-user policies: this table is only ever read/written by the ee-data
-- Edge Function using the service_role key (same trust boundary as
-- ee_trend_cache / ee_observation_cache). RLS enabled with zero policies so
-- it fails closed for anon/authenticated roles.

-- ============================================================================
-- Verification queries — run manually after applying:
--
-- select count(*) from ee_tile_cache where is_closed_period = true;
-- select index, year, month, mode, count, computed_at from ee_tile_cache
--   order by computed_at desc limit 10;
-- ============================================================================
