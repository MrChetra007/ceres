-- 021_add_gci_index.sql
--
-- GCI (Green Chlorophyll Index) = (NIR / Green) - 1.
-- Visual-only optical index, but both Earth Engine caches whitelist the index
-- column, so their CHECK constraints must include 'gci' or tile/trend cache
-- writes for GCI fail (and every month recomputes).
--
-- The constraint names are not stable across environments (Postgres may name
-- an inline CHECK differently), so drop any CHECK that is specifically on the
-- `index` column of these two tables, then recreate explicit named ones.
-- Safe to re-run.

do $$
declare
  r record;
begin
  for r in
    select conrelid::regclass as tbl, conname
    from pg_constraint
    where contype = 'c'
      and conrelid in (
        'public.ee_trend_cache'::regclass,
        'public.ee_tile_cache'::regclass
      )
      and lower(pg_get_constraintdef(oid)) like 'check ((index%'
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;

alter table public.ee_trend_cache
  drop constraint if exists ee_trend_cache_index_check;
alter table public.ee_trend_cache
  add constraint ee_trend_cache_index_check
  check (index in ('ndvi','ndwi','lswi','savi','evi','gndvi','gci'));

alter table public.ee_tile_cache
  drop constraint if exists ee_tile_cache_index_check;
alter table public.ee_tile_cache
  add constraint ee_tile_cache_index_check
  check (index in ('ndvi','ndwi','lswi','savi','evi','gndvi','rvi','gci'));

-- Verification:
--   select conrelid::regclass, conname, pg_get_constraintdef(oid)
--   from pg_constraint
--   where conname in ('ee_trend_cache_index_check','ee_tile_cache_index_check');
