-- migration11_add_field_centroid.sql
--
-- Adds centroid_lat / centroid_lng columns to the fields table, so a single
-- lat/lng point exists per field for weather lookups (Open-Meteo) without
-- re-parsing the geojson polygon on every scheduled worker run.
--
-- IMPORTANT: confirm the actual table name before running — this assumes
-- "fields" based on the row structure shared (id, owner_id, name, geojson,
-- area_ha, planting_date, notes, created_at, updated_at, aoi_id,
-- planting_date_source). Rename below if your table is called something else.
--
-- Assumes `geojson` is a jsonb column storing a GeoJSON Feature, e.g.:
--   {"type": "Feature", "geometry": {"type": "Polygon",
--     "coordinates": [[[lng, lat], [lng, lat], ...]]}, "properties": {}}
-- If `geojson` is stored as plain text instead of jsonb in your schema,
-- cast it with `geojson::jsonb` wherever it's referenced below.

-- 1. Add the new columns (nullable — existing rows will be NULL until backfilled)
ALTER TABLE fields
  ADD COLUMN IF NOT EXISTS centroid_lat double precision,
  ADD COLUMN IF NOT EXISTS centroid_lng double precision;

-- 2. Helper function: compute an approximate centroid (average of ring points,
--    excluding the duplicate closing point) from a GeoJSON Polygon Feature.
--    This is a simple average, not a true area-weighted geometric centroid —
--    fine for small field-sized polygons like these, where the difference is
--    negligible for a weather-lookup point.
CREATE OR REPLACE FUNCTION field_geojson_centroid(geom jsonb)
RETURNS TABLE(lng double precision, lat double precision) AS $$
DECLARE
  ring jsonb;
  ring_len int;
  pt jsonb;
  sum_lng double precision := 0;
  sum_lat double precision := 0;
  n int := 0;
BEGIN
  -- First ring of the polygon (outer boundary)
  ring := geom -> 'geometry' -> 'coordinates' -> 0;
  ring_len := jsonb_array_length(ring);

  -- Exclude the last point, which duplicates the first (closed ring)
  FOR i IN 0..(ring_len - 2) LOOP
    pt := ring -> i;
    sum_lng := sum_lng + (pt ->> 0)::double precision;
    sum_lat := sum_lat + (pt ->> 1)::double precision;
    n := n + 1;
  END LOOP;

  IF n = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY SELECT sum_lng / n, sum_lat / n;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 3. Backfill: compute centroid for every existing field that doesn't have one yet
UPDATE fields f
SET
  centroid_lng = c.lng,
  centroid_lat = c.lat
FROM (
  SELECT id, (field_geojson_centroid(geojson)).*
  FROM fields
  WHERE centroid_lat IS NULL OR centroid_lng IS NULL
) c
WHERE f.id = c.id;

-- 4. Verification query — run manually after the migration to confirm no
--    field was left without a centroid (should return 0 rows):
-- SELECT id, name, geojson FROM fields WHERE centroid_lat IS NULL OR centroid_lng IS NULL;
