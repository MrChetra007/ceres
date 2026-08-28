# Ceres — Field Centroid + Weather Forecast in Telegram Advisories

## Context

Ceres is rain-fed rice monitoring for Battambang, Cambodia — most farmers have no irrigation source, so rainfall forecast is high-value advisory content, not a cosmetic add-on.

Fields are stored in Supabase in a table (referred to below as `fields` — confirm actual name) with this shape:
`id, owner_id, name, geojson (Feature/Polygon, jsonb), area_ha, planting_date, notes, created_at, updated_at, aoi_id, planting_date_source`.

There is currently **no stored lat/lng per field** — only the full polygon in `geojson`. The Telegram advisory pipeline runs via a **pg_cron → SQL function → net.http_post → Deno Edge Function worker**, looping through monitored fields on a schedule, running the Earth Engine stress check, generating advisory text (Gemini → DeepSeek → Qwen fallback), and sending via Telegram.

## Ground rules for you (the coding agent)

1. **Explore first.** Confirm the actual fields table name, confirm whether `geojson` is `jsonb` or text, and locate the existing pg_cron/Edge Function worker file(s) before changing anything. Mirror existing code patterns (error handling, logging, fallback structure) rather than introducing new ones.
2. **Do the DB layer fully before touching the worker.** Steps 1–3 below must be done and verified before Step 4.
3. **GeoJSON coordinate order is `[longitude, latitude]`**, not `[lat, lng]`. Every place a coordinate is read, written, or passed to Open-Meteo, verify this order is respected. This is the single easiest bug to introduce in this whole change — Open-Meteo will silently return weather for the wrong hemisphere if lat/lng are swapped, with no error.

## Step 1 — Run the centroid migration

Use the provided `migration11_add_field_centroid.sql` (adjust the table name inside if it isn't `fields`). This:
- Adds nullable `centroid_lat` / `centroid_lng` columns
- Adds a `field_geojson_centroid()` helper function (simple average-of-ring-points — sufficient accuracy for field-sized polygons)
- Backfills every existing field's centroid from its stored `geojson`

**Verify after running:** query for any field where `centroid_lat IS NULL OR centroid_lng IS NULL` — should return zero rows. If any exist, their `geojson` may be malformed or use a different geometry type (MultiPolygon) — check those individually rather than assuming the migration silently succeeded everywhere.

## Step 2 — Forward-fix: populate centroid on field create/edit

Find wherever the app currently saves a new field or edits an existing field's boundary (this is where `geojson` gets written from the drawn/searched polygon). Add centroid calculation there so it happens at save time, not just via the one-time backfill:
- Compute the centroid from the polygon the same way the migration does (average of ring points, or reuse Turf.js `centroid()` if that's already a frontend dependency — check before adding a new one)
- Save `centroid_lat` / `centroid_lng` alongside `geojson` in the same write

**Verify:** draw and save a brand-new test field, then confirm its row has non-null `centroid_lat`/`centroid_lng` immediately, without needing to re-run the backfill.

## Step 3 — Weather fetch module

Build a small, isolated module (naming/location to match existing conventions — check how the app already structures API-calling code, e.g. for Gemini/DeepSeek/Qwen or the EE queries).

- Function signature: takes `lat`, `lng` → returns a clean `weatherContext` object (e.g. `{ precipitation_probability, precipitation_mm, temp_min, temp_max, forecast_days: [...] }` — shape it however fits the advisory prompt, but keep it a single well-defined object, not scattered fields).
- Use the Open-Meteo forecast API (free, no key). Fetch a short window — 3–5 days — of precipitation and temperature.
- Cache appropriately (per field, short TTL) if this will be called from both the right-panel display (built earlier) and the Telegram worker, so both don't double-fetch unnecessarily.
- Handle the "no forecast data returned" case gracefully — don't let a weather API failure block the rest of the advisory pipeline from running.

## Step 4 — Wire weather into the Telegram advisory worker

In the existing pg_cron → Edge Function worker loop (the one that already runs the EE stress check per field):

1. After fetching each field's stress data, also call the Step 3 weather function using that field's `centroid_lat`/`centroid_lng` (now guaranteed non-null from Steps 1–2).
2. Pass both the stress data **and** the weather forecast into the advisory-text generation prompt (Gemini/DeepSeek/Qwen). Update the prompt template to actually reference the forecast — e.g. instruct it to mention upcoming rain or its absence when relevant to the stress finding, in both Khmer and English per the existing bilingual output.
3. If the weather fetch fails for a field, the worker should still send the advisory using stress data alone (don't let a weather API hiccup block the whole alert) — log the failure, don't silently swallow it.

## Step 5 — Verify end-to-end

- Trigger the worker manually (however you currently test it — check for an existing manual-trigger method rather than waiting for the cron schedule) for a field with a known centroid.
- Confirm the resulting Telegram message includes both the stress/health finding and a weather-forecast-informed line.
- Confirm a field with a deliberately-broken weather fetch (e.g. temporarily bad coordinates) still sends a message using stress data alone, without crashing the worker for other fields in the same run.
- Confirm no regressions to the existing Part 8/9 functionality (cloud-blocked fallback, confidence badges, photo attachments, planting-date auto-detection) — this change should only add to the advisory pipeline, not alter those.
