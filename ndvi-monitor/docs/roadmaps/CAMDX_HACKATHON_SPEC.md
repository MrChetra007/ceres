# Ceres × CamDX Hackathon 2026 — Implementation Spec

**For:** the AI coding assistant working in `D:\SAAS\NDVI\ndvi-monitor`
**Owner:** Tra (Seth Sochetra). Prefers: full file rewrites (not diffs), copy-paste-ready output, frank assessments over reassurance.
**Event:** CamDX Hackathon, 12–13 Dec 2026, Phnum Penh. Theme: "EXCHANGE DATA. CREATE PUBLIC VALUE". Judged on a working prototype showing data exchange between systems/institutions for a public service.

---

## 0. Read this first (rules for you, the AI)

1. **Read before you write.** Open every file you plan to change and read it in full first. The codebase was audited on 2026-11-20; line-level facts below may have drifted.
2. **Full-file rewrites.** When you change a file, output the complete new file, not a diff.
3. **Scope discipline.** Do only what this spec lists. Do not refactor, rename, restyle, or "improve" unrelated code. If you see something broken that is not listed, report it at the end; do not fix it silently.
4. **No secrets in code or output.** Never print, commit, or hard-code service-role keys, bot tokens, or JWTs. Use env/secrets.
5. **Migrations:** the repo already has two `016_*` files. Pick the next free numbers for new migrations and keep them idempotent (`if not exists`, `drop policy if exists`).
6. **Don't claim what you did not verify.** At the end, report: files changed, migrations to run (in order), commands to run, and anything you could not test.
7. **If something in this spec contradicts the code, stop and ask Tra** with the specific conflict. Do not guess.

---

## 1. Goal

Turn Ceres (satellite crop-health monitoring for rice farmers, already deployed) into a **two-sided data-exchange prototype**:

- **Farmer side:** each field is tagged with **official Province → District → Commune → Village codes** (DataEF 2025 lists) and the farmer can opt in to share anonymized field health with local agriculture officers.
- **Official data in:** DataEF **current weather per province** is added to the alert advisory and field panel. (Open-Meteo stays for the 5-day forecast at the field centroid.)
- **Public side:** an extension-officer role and a `/government` dashboard showing **commune-level aggregated stress summaries** (privacy-safe: no names, no boundaries, no owners, small groups suppressed).

Why: the theme is data *exchange* between systems. Weather-into-an-app alone is one-way consumption. Standard admin codes + a privacy-safe aggregate going back out to a public-sector user is the exchange story.

### Non-goals (do NOT build)

- No map/choropleth of communes: DataEF lists have **no geometry**.
- No exchange-rate feature (endpoint details not provided yet).
- No change to Earth Engine logic, tile caching, billing, Telegram linking, or Consult AI.
- No loosening of RLS on `fields`, `alerts_log`, or `profiles`.

---

## 2. Verified external API facts (DataEF, tested 2026-11-20, no API key needed)

Base: `https://data.mef.gov.kh/api/v1`

### 2.1 Admin lists (CSV-like datasets via JSON)

`GET /public-datasets/<id>/json?page=<n>&page_size=<n>` → `{ items, total_items, page, page_size, total_pages }`

| Dataset | ID | Rows | Item fields |
|---|---|---|---|
| Province List 2025 | `pd_66a8603700604c000123e144` | ~25 | `province_code`, `province_kh`, `province_en` |
| District List 2025 | `pd_66a8603800604c000123e145` | 210 | `province_code`, `district_code`, `district_kh`, `district_en` |
| Commune List 2025 | `pd_66a8603900604c000123e146` | (unchecked) | `province_code`, `district_code`, `commune_code`, `commune_kh`, `commune_en` |
| Village List 2025 | `pd_66a8603a00604c000123e147` | 14,576 | `province_code`, `district_code`, `commune_code`, `village_code`, `village_kh`, `village_en` |

- Codes are **TEXT with leading zeros** (`"01"`, `"0102"`, `"010201"`, `"01020101"`). Each level's code starts with its parent's code. **Never store codes as numbers.**
- `page_size` may be capped (a test with `page_size=500` came back with `page_size: 10`). The seed script handles this by trusting the API's reported `total_pages`.
- The data is static (yearly). **Do not call these live from the UI.** Seed once into Supabase.

### 2.2 Real-time weather (province level, current conditions only)

`GET /realtime-api/weather?province=<province_en>` e.g. `?province=Battambang`

```json
{"data":{"id":1207859,"name":"Battambang","created_at":"2026-11-20T15:00:08.581927+07:00","last_updated_epoch":1795160700,"last_updated":"2026-11-20T14:45:00","temp_c":31.0,"temp_f":87.8,"is_day":true,"condition":{"text":"Patchy rain nearby","icon":"//cdn.weatherapi.com/weather/64x64/day/176.png","code":1063},"wind_mph":4.7,"wind_kph":7.6,"wind_degree":59,"wind_dir":"ENE","pressure_mb":1013.0,"pressure_in":29.93,"precip_mm":0.02,"precip_in":0.0,"humidity":60,"cloud":86,"feelslike_c":35.0,"feelslike_f":95.0,"windchill_c":31.0,"windchill_f":87.9,"heatindex_c":35.2,"heatindex_f":95.4,"dewpoint_c":22.5,"dewpoint_f":72.5,"vis_km":10.0,"vis_miles":6.0,"uv":null,"gust_mph":11.0,"gust_kph":17.6}}
```

- Errors: `400 {"name":"ERROR_PARAMS","errorMsg":"Invalid province"}`, `404 {"name":"REAL_TIME_API_DATA_NOT_FOUND","errorMsg":"Weather data not found"}`.
- **Current conditions only. No multi-day forecast, no rain probability.** It does NOT replace Open-Meteo. Do not describe it as a forecast anywhere in code, UI, or copy.
- `uv` can be `null`. Province name matching is by English name; not all 25 spellings are verified (the seed script prints OK/FAIL per province).

---

## 3. Existing system facts you must respect (from the 2026-11-20 audit)

- Stack: Vue 3 + Vite, `@supabase/supabase-js` 2.x, Supabase Edge Functions (Deno), pg_cron → `ee-alerts-worker`.
- `fields` columns include: `id, owner_id, name, geojson, area_ha, planting_date, planting_date_source, notes, aoi_id, centroid_lat, centroid_lng, crop_name, crop_english, next_expected_pass, imagery_source`. **No address columns exist today.**
- RLS on `fields`, `alerts_log`, `profiles`, `aois`: **owner-only**. There is **no role model** (`profiles` has no `role` column; `organizations` is a bare owner-only table). Keep it that way for end users.
- `alerts_log(field_id, status, ndvi_value, message, chat_id, sent_at, telegram_sent)`. `status` values: `healthy`, `below_expected`, `stressed`, `radar_flag`, `no_data`. **Rows exist only for fields whose owner has linked Telegram** (the worker selects `profiles!inner(telegram_chat_id…)`).
- Weather today: Open-Meteo, 5-day, at field centroid, in `src/services/weatherService.js` (frontend) and `supabase/functions/_shared/weather.ts` (worker). Keep both.
- `ee-alerts-worker` builds the LLM advisory in `buildAdvisoryPrompt(field, ndvi, status, stage, rainfall, weather, lang)`; the forecast line comes from `forecastContextLine(weather)`.
- Frontend field flow: `FieldFormModal.vue` → `store.submitFieldForm` → `store.saveField` → `supabase.insertField`.
- Language: app supports `en` and `km` (`src/i18n/en.js`, `km.js`, `profiles.preferred_language`). Show Khmer names when the UI language is `km`.
- Supabase project ref: `wopwwtnvqyomiwbsxiks`.

---

## 4. Deliverables already written (Tra will place them; do not rewrite unless broken)

| File | Target path |
|---|---|
| `017_admin_boundaries.sql` | `ndvi-monitor/migrations/` (renumber if needed) |
| `migrations/seed/*.sql` | `ndvi-monitor/migrations/seed/` |
| `dataef.ts` | `ndvi-monitor/supabase/functions/_shared/dataef.ts` |
| `dataef-weather-index.ts` | `ndvi-monitor/supabase/functions/dataef-weather/index.ts` |

`dataef.ts` exports `getProvinceWeather(provinceEn)` (30-min cache, 8 s timeout, returns last good response with `stale: true` on failure, never throws) and `provinceWeatherLine(w)` (one line for the LLM prompt). `dataef-weather` is a JWT-verified proxy: `POST {province}` → `{ weather }`.

Review these files once. If you find a real bug, report it and propose the fix; don't silently change behavior.

---

## 5. Work plan (do in this order; each phase must leave the app working)

### Phase 0 — Fix known issues first (small, safety-relevant)

**0.1 Verify the add-field bug.** In `src/store.js`, `saveField` is declared `saveField(name, geojson, plantingDate, cropRaw)` but `submitFieldForm` calls `saveField(name, plantingDate || null, cropRaw || null)` and never passes `geojson` (the local `const geojson` is unused). Confirm by reading the code. If confirmed, fix the call to `saveField(name, geojson, plantingDate || null, cropRaw || null)`. Phase 2 rewrites this function anyway, so make the fix there and mention it in your report.

**0.2 Lock down `trigger-alerts-worker`.** Today any signed-in user can fire a cross-user alert run. Require the caller to be the service role (or reject all user JWTs). Keep the function working for Tra's manual curl with the service-role key.

**0.3 Report (do not fix) secrets hygiene:** `ndvi-monitor/testcommand.txt` contains what looks like a Telegram bot token + Supabase anon JWT. Tell Tra to rotate the bot token in BotFather and delete the file and its git history. Do not repeat the token in your output.

**0.4 Report only:** `.env` uses `SUPABASE_URL`/`SUPABASE_ANON_KEY` (no `VITE_` prefix) so `src/config.js` falls back to hard-coded values.

### Phase 1 — Data layer

1. Apply `018_admin_boundaries.sql`.
2. Run the files in `migrations/seed/` in numeric order (001 provinces, 002 districts, 003 communes 01-04, 004 villages 01-30) in the Supabase SQL editor. Expected: provinces 25, districts 210, communes 1,661, villages 14,512. The source has 14,576 village rows, but 54 duplicate codes, one malformed code (`0506140-`), and 9 villages under missing commune `120913` mean the usable total is 14,512. The seed files are data-only; province→weather name matching is validated in Phase 3 through `_shared/dataef.ts` (`PROVINCE_WEATHER_ALIASES`).
3. Deploy `dataef-weather`.

### Phase 2 — Field location picker + consent (frontend)

**New:** `src/services/adminBoundaries.js`
- `listProvinces()`, `listDistricts(provinceCode)`, `listCommunes(districtCode)`, `listVillages(communeCode)`, `getProvinceName(code)`.
- Read from Supabase tables (`admin_*`) via the existing supabase client; order by `code`; in-memory cache per parent code. Select only `code,name_kh,name_en`.

**New:** `src/components/AdminLocationPicker.vue`
- 4 cascading `<select>`s: Province → District → Commune → Village. Changing a parent clears all children. Children disabled until parent chosen.
- Display name by UI language (`km` → `name_kh`, else `name_en`; fall back to the other if empty).
- `v-model` object: `{ province_code, district_code, commune_code, village_code }` (all `null` when unset).
- Loading and error states (if the lookup fails, show a non-blocking message; the form must still be savable without a location).
- Match existing styling conventions (look at `FieldFormModal.vue` and the `styles/` folder; do not invent a new design system).

**Change:** `FieldFormModal.vue`
- Add the picker (optional section, labelled clearly).
- Add a consent checkbox, **unchecked by default**, shown only when a **commune** is selected. EN copy: "Share anonymized field health with local agriculture officers. Only commune-level summaries are shared. Your name, field boundary and exact location are never shared." Add Khmer translation.
- Emit/pass location + consent to the store.

**Change:** `src/store.js`
- `submitFieldForm(name, plantingDate, cropRaw, location)` where `location = { province_code, district_code, commune_code, village_code, share_with_authorities }`.
- Pass `geojson` correctly into `saveField` (see 0.1) and pass location through to `supabase.insertField`.
- Add `updateFieldLocation(fieldId, location)` (see below).
- Ensure `share_with_authorities` can only be `true` when `commune_code` is set.

**Change:** `src/services/supabase.js`
- `insertField` accepts and inserts the 5 new columns.
- `mapRowToField` maps them (camelCase vs snake_case: follow the existing convention in that file).
- Add `updateField` support for the 5 columns (reuse the existing update path if there is one).

**Change:** `FieldDetailPanel.vue`
- Show the field's location as "Commune, District, Province" (resolved from codes) with an **Edit location** button reusing the picker + consent checkbox. Needed because all existing fields have `NULL` location.
- Do not break the existing forecast card.

**i18n:** add keys to **both** `en.js` and `km.js`: location section title, province/district/commune/village labels and placeholders, consent text, "Edit location", "Location saved", loading/error strings. No hard-coded English strings in components.

### Phase 3 — DataEF weather into the product

**Worker (`ee-alerts-worker/index.ts`):**
- Extend the fields select to include `province_code`.
- At the start of a run, load `admin_provinces` once into a `Map<code, name_en>` (service-role client).
- For each field with a `province_code`, call `getProvinceWeather(name_en)` (never block the alert on failure) and build `provinceWeatherLine(w)`.
- Add the line to `buildAdvisoryPrompt` (new parameter, default `""`) right after the forecast line. Add one sentence to the prompt: official current conditions are context for *now*; the 5-day forecast is the only forecast; don't present current conditions as a prediction.
- Leave the flat fallback message and all alert-sending policy unchanged.

**Frontend:**
- New `src/services/dataefService.js`: `getProvinceWeather(provinceNameEn)` calls the `dataef-weather` function via the supabase client (`functions.invoke`, POST body `{ province }`), 30-min in-memory cache, returns `null` on failure.
- `FieldDetailPanel.vue`: below the existing forecast card, add an "Official current conditions" card (source label: "DataEF · Ministry of Economy and Finance") showing condition text, temp, humidity, rain now, and "updated <time>". If `stale`, show a small "last known" tag. Hide the card when the field has no province. Do not touch the Open-Meteo forecast card.

### Phase 4 — Roles + privacy-safe aggregation (database)

Create a new migration (next free number, e.g. `018_roles_and_commune_summary.sql`) containing exactly the following. Review it carefully before applying; fix real errors but keep the privacy properties.

```sql
-- 1. Role on profiles
alter table profiles
  add column if not exists role text not null default 'farmer'
  check (role in ('farmer', 'extension_viewer'));

-- 2. Users must NOT be able to change their own role (existing policy lets them
--    update their own profile row). Service role / SQL editor can.
create or replace function public.protect_profile_role() returns trigger
language plpgsql as $$
begin
  if new.role is distinct from old.role and auth.role() = 'authenticated' then
    raise exception 'role cannot be changed by the user';
  end if;
  return new;
end $$;

drop trigger if exists profiles_protect_role on profiles;
create trigger profiles_protect_role
  before update on profiles
  for each row execute function public.protect_profile_role();

-- 3. Commune-level summary. Only extension_viewer can call it. It reads ONLY fields
--    where the owner opted in (share_with_authorities = true) and returns NO field
--    names, owner ids, geometry, or coordinates. Groups with fewer than 3 fields are
--    suppressed (counts returned as null) to avoid identifying individuals.
create or replace function public.get_commune_stress_summary(p_province_code text default null)
returns table (
  commune_code text,
  commune_name_en text,
  commune_name_kh text,
  district_code text,
  province_code text,
  field_count integer,
  healthy_count integer,
  below_expected_count integer,
  stressed_count integer,
  radar_flag_count integer,
  no_data_count integer,
  last_alert_at timestamptz,
  suppressed boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from profiles p where p.id = auth.uid() and p.role = 'extension_viewer'
  ) then
    raise exception 'not authorized';
  end if;

  return query
  with latest as (
    select distinct on (a.field_id) a.field_id, a.status, a.sent_at
    from alerts_log a
    order by a.field_id, a.sent_at desc
  ),
  shared as (
    select f.commune_code as ccode, l.status, l.sent_at
    from fields f
    left join latest l on l.field_id = f.id
    where f.share_with_authorities = true
      and f.commune_code is not null
      and (p_province_code is null or f.province_code = p_province_code)
  ),
  agg as (
    select s.ccode,
           count(*)::int as n,
           count(*) filter (where s.status = 'healthy')::int as healthy,
           count(*) filter (where s.status = 'below_expected')::int as below_expected,
           count(*) filter (where s.status = 'stressed')::int as stressed,
           count(*) filter (where s.status = 'radar_flag')::int as radar_flag,
           count(*) filter (where s.status is null or s.status = 'no_data')::int as no_data,
           max(s.sent_at) as last_alert
    from shared s
    group by s.ccode
  )
  select c.code, c.name_en, c.name_kh, c.district_code, c.province_code,
         case when a.n >= 3 then a.n end,
         case when a.n >= 3 then a.healthy end,
         case when a.n >= 3 then a.below_expected end,
         case when a.n >= 3 then a.stressed end,
         case when a.n >= 3 then a.radar_flag end,
         case when a.n >= 3 then a.no_data end,
         case when a.n >= 3 then a.last_alert end,
         (a.n < 3)
  from agg a
  join admin_communes c on c.code = a.ccode
  order by c.province_code, c.district_code, c.code;
end;
$$;

revoke all on function public.get_commune_stress_summary(text) from public, anon;
grant execute on function public.get_commune_stress_summary(text) to authenticated;
```

**Notes you must honor:**
- Granting the role is manual (SQL editor, as postgres): `update profiles set role = 'extension_viewer' where id = '<user uuid>';`. There is no self-serve upgrade path. Do not build one.
- **Limitation:** statuses come from `alerts_log`, which only has rows for fields whose owner linked Telegram. Fields without alert rows count as `no_data`. For the demo, create a clearly-labelled **demo seed** (`scripts/seed-demo-shared-fields.sql`): ~12 fake fields across 3–4 communes (≥3 per commune) with `share_with_authorities = true` and matching `alerts_log` rows, using a dedicated demo owner profile. Mark every demo row (e.g. field name prefix `[DEMO]`) so it can be deleted with one statement. In the UI, show a visible "Includes demo data" notice whenever any `[DEMO]` field exists in the viewer's results — this requires NOT exposing names; instead, derive the notice from a separate boolean returned by the function or a config flag. Propose the simplest honest approach to Tra before implementing.
- Report (do not fix) that `profiles` RLS "update own profile" also lets users edit their own `subscription_*`, `max_aois`, `max_hectares` columns. Out of scope here, but Tra should know.

### Phase 5 — `/government` view (frontend)

- New route `/government` in `src/router/index.js` and new `src/views/GovernmentDashboard.vue`.
- Guard: load `profiles.role` with the user's profile (add it to wherever the profile/subscription is loaded into `state`). If role ≠ `extension_viewer`, redirect to `/map`. The DB function is the real security boundary; the guard is UX only.
- Province filter (from `admin_provinces`, default = all). Calls `supabase.rpc('get_commune_stress_summary', { p_province_code })`.
- Table grouped by province → district → commune: field count, a stacked bar (healthy / below expected / stressed / radar flag / no data), last alert date. Suppressed rows show "Fewer than 3 fields — hidden for privacy".
- When a province is selected: show the DataEF "Official current conditions" for that province (reuse `dataefService.js`) in a header card.
- Top summary tiles: total communes reporting, total fields (sum of non-suppressed), % stressed.
- Short privacy note on the page: "Aggregated at commune level. Only fields whose owners opted in. No names or field boundaries are shown."
- Navigation: show a "Government" entry in `TopBar.vue` **only** for `extension_viewer` users.
- Reuse existing styles/components (legend colors for status should match the app's existing 🟢🟡🔴 semantics). Full i18n (en + km).

### Phase 6 — Polish for demo

- Make sure the app degrades gracefully when DataEF is down (cards hidden or "last known", never a crash).
- No console errors/leftover debug logs in the new code.

---

## 6. Acceptance checks (run or describe how to verify)

1. Seeded counts: provinces = 25, districts = 210, communes = 1,661, villages = 14,512 (DataEF source has 54 duplicate village codes, 1 malformed code, and 9 orphan villages under missing commune `120913`); codes keep leading zeros.
2. New field with Battambang → … → village saves all 4 codes; `share_with_authorities` is false unless the box is ticked and a commune is set.
3. A field can be saved with no location (old flow still works). Existing fields can have a location added via Edit location.
4. Field panel shows Open-Meteo 5-day forecast **and** the DataEF official-conditions card; with DataEF blocked, the app still works.
5. Worker advisory prompt includes the DataEF line for fields with a province, and is unchanged for fields without one. Manual run: `curl` the worker with the service-role key and confirm a Telegram message arrives.
6. A normal farmer calling `get_commune_stress_summary` gets `not authorized`; a farmer cannot change their own `role` (trigger raises).
7. As `extension_viewer`: `/government` lists communes; communes with <3 shared fields are suppressed; no field names/ids/coordinates appear anywhere in the payload (inspect the network response).
8. `/government` redirects non-viewers to `/map`.
9. Khmer UI shows Khmer admin names and translated labels.

---

## 7. Demo flow the build must support (5 minutes)

1. Farmer signs in, draws a field, picks Battambang → district → commune → village, opts in to sharing.
2. Field panel: satellite stress + 5-day forecast + DataEF official current conditions.
3. Telegram advisory in Khmer that mentions both the forecast and the official conditions.
4. Switch to the extension officer account → `/government` → commune table with stress counts and the province's official weather.
5. Say out loud: farmer data is shared only with consent, only aggregated, only at commune level; admin codes come from DataEF so any ministry system can join on them.

---

## 8. Open questions — ask Tra, don't assume

- Does the hackathon allow an existing product? (If not, the new work is Phases 2–5 built during the event; keep them cleanly separable.)
- Exchange-rate / other DataEF endpoints: not specified yet. Do not build until Tra provides the API Query page.
- Which Supabase account should be seeded as the `extension_viewer` and the demo owner?

## 9. End-of-task report format

1. Files created/changed (paths).
2. Migrations to apply, in order, with exact numbers used.
3. Commands to run (seed, deploy functions).
4. What you verified vs. could not verify.
5. Anything suspicious you noticed but did not change.
