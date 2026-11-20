-- ============================================================================
-- CamDX demo shared fields
--
-- Creates 12 clearly-labelled [DEMO] fields in 4 Battambang communes (3 per
-- commune) with matching latest alerts. All are share_with_authorities = true
-- and are owned by the first extension_viewer profile.
--
-- Prerequisite (SQL editor, as postgres):
--   update public.profiles
--   set role = 'extension_viewer'
--   where id = '<extension-viewer-user-uuid>';
--
-- Safe to re-run: deletes the previous [DEMO] fields first (their alerts_log
-- rows cascade). Delete everything with:
--   delete from public.fields where name like '[DEMO]%';
-- ============================================================================

begin;

create temp table _demo_seed (
  label text primary key,
  commune_code text not null,
  district_code text not null,
  province_code text not null,
  status text not null,
  ndvi numeric,
  lat double precision not null,
  lng double precision not null
) on commit drop;

insert into _demo_seed (label, commune_code, district_code, province_code, status, ndvi, lat, lng) values
  ('Tuol Ta Ek 1',     '020301', '0203', '02', 'healthy',        0.72, 13.0980, 103.1980),
  ('Tuol Ta Ek 2',     '020301', '0203', '02', 'below_expected', 0.41, 13.0990, 103.1990),
  ('Tuol Ta Ek 3',     '020301', '0203', '02', 'stressed',       0.22, 13.1000, 103.2000),

  ('Prek Preah Sdach 1', '020302', '0203', '02', 'healthy',      0.68, 13.1010, 103.2010),
  ('Prek Preah Sdach 2', '020302', '0203', '02', 'healthy',      0.75, 13.1020, 103.2020),
  ('Prek Preah Sdach 3', '020302', '0203', '02', 'stressed',     0.25, 13.1030, 103.2030),

  ('Rottaknak 1',      '020303', '0203', '02', 'below_expected', 0.44, 13.1040, 103.2040),
  ('Rottaknak 2',      '020303', '0203', '02', 'below_expected', 0.38, 13.1050, 103.2050),
  ('Rottaknak 3',      '020303', '0203', '02', 'radar_flag',     null, 13.1060, 103.2060),

  ('Bavel 1',          '020401', '0204', '02', 'healthy',        0.70, 13.1070, 103.2070),
  ('Bavel 2',          '020401', '0204', '02', 'stressed',       0.20, 13.1080, 103.2080),
  ('Bavel 3',          '020401', '0204', '02', 'no_data',        null, 13.1090, 103.2090);

do $$
declare
  demo_owner uuid;
begin
  select id into demo_owner
  from public.profiles
  where role = 'extension_viewer'
  order by created_at
  limit 1;

  if demo_owner is null then
    raise exception 'No extension_viewer profile. Set profiles.role first.';
  end if;

  delete from public.fields where name like '[DEMO]%';

  insert into public.fields (
    owner_id, name, geojson, area_ha, planting_date, planting_date_source,
    crop_name, crop_english, province_code, district_code, commune_code,
    village_code, share_with_authorities, centroid_lat, centroid_lng
  )
  select
    demo_owner,
    '[DEMO] ' || d.label,
    jsonb_build_object(
      'type', 'Feature',
      'properties', '{}'::jsonb,
      'geometry', jsonb_build_object(
        'type', 'Polygon',
        'coordinates', jsonb_build_array(
          jsonb_build_array(
            jsonb_build_array(d.lng - 0.0008, d.lat - 0.0008),
            jsonb_build_array(d.lng + 0.0008, d.lat - 0.0008),
            jsonb_build_array(d.lng + 0.0008, d.lat + 0.0008),
            jsonb_build_array(d.lng - 0.0008, d.lat + 0.0008),
            jsonb_build_array(d.lng - 0.0008, d.lat - 0.0008)
          )
        )
      )
    ),
    1.2,
    current_date - 45,
    'manual',
    'rice',
    'rice',
    d.province_code,
    d.district_code,
    d.commune_code,
    null,
    true,
    d.lat,
    d.lng
  from _demo_seed d;

  insert into public.alerts_log (
    field_id, status, ndvi_value, message, chat_id, sent_at, telegram_sent
  )
  select
    f.id,
    d.status,
    d.ndvi,
    '[DEMO] ' || d.label || ' seed alert',
    'demo-seed',
    now() - (row_number() over (order by d.label) || ' hours')::interval,
    false
  from public.fields f
  join _demo_seed d on f.name = '[DEMO] ' || d.label;
end $$;

drop table _demo_seed;

commit;

-- Verify:
-- select count(*) from public.fields where name like '[DEMO]%';  -- 12
-- select count(*) from public.alerts_log a
-- join public.fields f on f.id = a.field_id where f.name like '[DEMO]%';  -- 12
