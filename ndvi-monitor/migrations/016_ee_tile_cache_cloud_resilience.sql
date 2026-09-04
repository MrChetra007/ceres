-- ============================================================================
-- EE Cost Control — cloud-resilient tile cache (mode-aware + metadata)
-- migrations/016_ee_tile_cache_cloud_resilience.sql
--
-- Two changes for the cloud-resilience data flow (Ceres):
--   1. The tile cache key gains `mode`. Without it, an `optical` row and a
--      `radar_fallback` row for the same (index, year, month, geometry_hash)
--      would collide — e.g. a month cached as radar while S2 was cloudy would
--      wrongly keep serving radar even after clear S2 arrives. Expressing the
--      source/mode in the key (the spec's "include source/mode in cache keys")
--      lets each source cache independently.
--   2. New metadata columns so a cached optical tile can still label its own
--      confidence/age honestly (clear scene count, field valid-pixel fraction,
--      the actual composite window) — these are the values the frontend shows
--      as "4 clear scenes · High confidence · composite 01–30 Aug".
--
-- NOTE: `count` historically held the scene count; we keep it for compat and
-- add clear_scene_count for the pixel-masked monthly path.
-- ----------------------------------------------------------------------------
alter table ee_tile_cache drop constraint if exists ee_tile_cache_pkey;
alter table ee_tile_cache drop constraint if exists ee_tile_cache_index_year_month_geometry_hash_key;

alter table ee_tile_cache add column if not exists clear_scene_count int;
alter table ee_tile_cache add column if not exists valid_fraction numeric;
alter table ee_tile_cache add column if not exists composite_start text;
alter table ee_tile_cache add column if not exists composite_end text;
alter table ee_tile_cache add column if not exists days_since_observation int;

-- mode-aware primary key: a source (optical/radar_fallback/...) for a given
-- index+month+geometry is a distinct cache unit.
alter table ee_tile_cache add primary key (index, year, month, geometry_hash, mode);

create index if not exists ee_tile_cache_lookup_mode
  on ee_tile_cache (index, year, month, geometry_hash, mode);

-- ============================================================================
-- Verification queries — run manually after applying:
--
-- select index, year, month, mode, clear_scene_count, valid_fraction
--   from ee_tile_cache order by computed_at desc limit 10;
-- ============================================================================