-- 022_add_ndre_index.sql
--
-- NDRE (Normalized Difference Red Edge) = (NIR - RedEdge) / (NIR + RedEdge).
-- Visual-only optical index; the Earth Engine caches whitelist the index
-- column, so both CHECK constraints must include 'ndre'.
--
-- Drop any CHECK specifically on the `index` column (names are stable now, but
-- the discovery block keeps this safe if Postgres named one differently), then
-- recreate explicit named constraints. Safe to re-run.

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
  check (index in ('ndvi','ndwi','lswi','savi','evi','gndvi','gci','ndre'));

alter table public.ee_tile_cache
  drop constraint if exists ee_tile_cache_index_check;
alter table public.ee_tile_cache
  add constraint ee_tile_cache_index_check
  check (index in ('ndvi','ndwi','lswi','savi','evi','gndvi','rvi','gci','ndre'));

-- Verification:
--   select conrelid::regclass, conname, pg_get_constraintdef(oid)
--   from pg_constraint
--   where conname in ('ee_trend_cache_index_check','ee_tile_cache_index_check');
