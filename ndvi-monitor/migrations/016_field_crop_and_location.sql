-- migrations/016_field_crop_and_location.sql
--
-- Adds crop identity to the fields table so the app can serve crops beyond
-- rice in both Khmer and English:
--   crop_name      – exactly what the farmer typed ("ស្រូវ", "rice", "mango")
--   crop_english   – normalized English key driving growth-stage logic + AI
--                    ("rice", "mango", ...). NULL for unrecognized Khmer names.
--
-- No location column: the field's dynamic location (region/province name for
-- the AI and alerts) is reverse-geocoded from the existing `geojson` polygon
-- at consult time — the coordinates are the single source of truth, there is
-- nothing to keep in sync.
--
-- Existing rows keep NULL crop columns — treated as the historical default
-- (rice) by both the client and the alert worker, so nothing changes for
-- current users until they set a crop.

ALTER TABLE fields
  ADD COLUMN IF NOT EXISTS crop_name text,
  ADD COLUMN IF NOT EXISTS crop_english text;

-- Useful before/after verification:
-- SELECT id, name, crop_name, crop_english FROM fields;