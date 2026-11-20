# Ceres Codebase Audit

**Audit date:** 2026-11-20  
**Repo root:** `D:\SAAS\NDVI`  
**App root:** `ndvi-monitor/`  
**Scope:** Vue 3 + Vite frontend, Supabase schema/RLS, `ee-data`, `ee-alerts-worker`, weather, fields, alerts, auth/roles, env/versions.  
**Mode:** Read-only audit. No source files were changed while producing this report.

---

## Contents

1. [Weather integration](#1-weather-integration)
2. [Fields data model](#2-fields-data-model)
3. [Alerts worker](#3-alerts-worker)
4. [Auth and roles](#4-auth-and-roles)
5. [API surface](#5-api-surface)
6. [Frontend structure](#6-frontend-structure)
7. [Environment and constraints](#7-environment-and-constraints)
8. [Quick findings summary](#8-quick-findings-summary)

---

## 1. Weather integration

### Sources actually used

| Source | Used for | Where |
|---|---|---|
| **Open-Meteo** forecast API | 5-day rain probability + min/max temperature | frontend field panel, `ee-alerts-worker` |
| **CHIRPS Daily** | 21-day rainfall total in worker; monthly dry-month flags in `ee-data` | `ee-alerts-worker`, `ee-data` |
| **GPM IMERG V07** | trailing rainfall total + 3 buckets for the frontend field panel / stress context | `ee-data` |

Open-Meteo is **not** called from `ee-data`.

---

### Frontend weather service

**File:** `ndvi-monitor/src/services/weatherService.js`

```js
const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast'
const FORECAST_DAYS = 5
const CACHE_TTL_MS = 15 * 60 * 1000
// TEST FLAG: cache disabled globally — every field open refetches the forecast.
const USE_CACHE = false
const cache = new Map()

function cacheKey(lat, lng) {
  return lat.toFixed(4) + ',' + lng.toFixed(4)
}
```

```js
export async function getWeatherContext(lat, lng) {
  const key = cacheKey(lat, lng)
  const hit = USE_CACHE ? cache.get(key) : null
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.data

  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    timezone: 'auto',
    forecast_days: String(FORECAST_DAYS),
  })
  const res = await fetch(OPEN_METEO_URL + '?' + params.toString())
  if (!res.ok) throw new Error('weather_unavailable')
  const raw = await res.json()
  const ctx = buildWeatherContext(raw)
  if (USE_CACHE) cache.set(key, { ts: Date.now(), data: ctx })
  return ctx
}
```

Frontend response shape:

```js
function buildWeatherContext(raw) {
  const times = (raw.daily && raw.daily.time) || []
  const days = times.map((date, i) => ({
    date,
    rainPct:
      raw.daily && raw.daily.precipitation_probability_max
        ? raw.daily.precipitation_probability_max[i] ?? null
        : null,
    tMax:
      raw.daily && raw.daily.temperature_2m_max
        ? raw.daily.temperature_2m_max[i] ?? null
        : null,
    tMin:
      raw.daily && raw.daily.temperature_2m_min
        ? raw.daily.temperature_2m_min[i] ?? null
        : null,
  }))
  return { updatedAt: new Date().toISOString(), days }
}
```

Location input is **lat/lng of the field centroid**, not a place name:

```js
// lat/lng are the field centroid coordinates (Open-Meteo resolves the nearest
// grid point automatically).
```

---

### Frontend consumption

**File:** `ndvi-monitor/src/components/FieldDetailPanel.vue`

Weather is fetched when the selected field changes:

```js
watch(() => currentField.value && currentField.value.id, () => { loadWeather(); loadAim() })
```

```js
function fieldCentroid() {
  const f = currentField.value
  if (!f) return null
  const geom = (f.geojson && (f.geojson.geometry || f.geojson)) || null
  if (!geom || !geom.coordinates) return null
  if (geom.type === 'Point') return { lng: geom.coordinates[0], lat: geom.coordinates[1] }
  const c = turfCentroid({ type: 'Polygon', coordinates: geom.coordinates })
  return { lng: c.geometry.coordinates[0], lat: c.geometry.coordinates[1] }
}
```

```js
async function loadWeather() {
  const c = fieldCentroid.value
  if (!c) { wxDays.value = []; wxLoading.value = false; wxError.value = false; return }
  const req = ++wxReq
  wxLoading.value = true
  wxError.value = false
  try {
    const ctx = await getWeatherContext(c.lat, c.lng)
    if (req !== wxReq) return
    wxDays.value = ctx.days
    wxLoading.value = false
  } catch (e) {
    if (req !== wxReq) return
    wxError.value = true
    wxLoading.value = false
  }
}
```

Display block:

```html
<div class="detail-section forecast-card">
  <p class="detail-card-label">{{ t('field.forecast') }} <span class="mono">({{ t('field.forecast_days') }})</span></p>
  <div v-if="wxLoading" class="forecast-note">{{ t('field.loading') }}</div>
  <div v-else-if="wxError" class="forecast-note">{{ t('field.forecast_unavailable') }}</div>
  <template v-else-if="wxDays.length">
    <div class="forecast-grid">
      <div v-for="d in wxDays" :key="d.date" class="forecast-day">
        <span class="forecast-day-label">{{ dayLabel(d.date) }}</span>
        <span class="forecast-temp mono" :title="t('field.forecast_temp_tip')">{{ d.tMax != null ? Math.round(d.tMax) + '°' : '—' }}</span>
        <span class="forecast-rain" :class="{ risk: d.rainPct != null && d.rainPct >= 50 }" :title="t('field.forecast_rain_tip')">
          <i class="ti ti-umbrella"></i>{{ d.rainPct != null ? d.rainPct + '%' : '—' }}
        </span>
      </div>
    </div>
    <p class="forecast-hint">{{ t('field.forecast_hint') }}</p>
  </template>
  <div v-else class="forecast-note">{{ t('field.data_unavailable') }}</div>
</div>
```

Frontend stress scoring does **not** use Open-Meteo. It uses `ee-data` rainfall (IMERG).

**File:** `ndvi-monitor/src/store.js`

```js
export function checkStress(data, lat, lng, index) {
  index = index || 'ndvi'
  if (index !== 'ndvi') { state.stressAlert = null; return }
  if (data.length < 2) { state.stressAlert = null; return }
  const sorted = data.slice().sort((a, b) => a.date.localeCompare(b.date))
  const recent = sorted[sorted.length - 1]
  if (!recent || recent.value === null) { state.stressAlert = null; return }
  let earlier = null
  for (let i = sorted.length - 2; i >= 0; i--) {
    const d = sorted[i]
    if (d.value !== null) {
      const daysDiff = (new Date(recent.date) - new Date(d.date)) / 86400000
      if (daysDiff >= 14) { earlier = d; break }
    }
  }
  if (!earlier || !earlier.value) { state.stressAlert = null; return }
  const drop = ((earlier.value - recent.value) / earlier.value) * 100
  if (drop > 15) {
    const baseMsg = '\u26a0 Possible stress detected \u2014 NDVI dropped ' + drop.toFixed(0) + '% (' + earlier.date + ' \u2192 ' + recent.date + ')'
    state.stressAlert = baseMsg
    if (lat != null && lng != null) {
      const point = pointGeometry(lng, lat)
      ee.getRainfallMm(point, 21, (mm) => {
        if (mm == null) return
        const rainNote = mm < 10
          ? ' \u2014 only ' + mm.toFixed(0) + 'mm rain in that period, drought stress is plausible'
          : ' \u2014 ' + mm.toFixed(0) + 'mm rain in that period, so low rainfall likely isn\'t the cause'
        state.stressAlert = baseMsg + rainNote
      })
    }
  } else {
    state.stressAlert = null
  }
}
```

---

### Backend weather service

**File:** `ndvi-monitor/supabase/functions/_shared/weather.ts`

```ts
const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";
const FORECAST_DAYS = 5;
const CACHE_TTL_MS = 15 * 60 * 1000;
const cache = new Map<string, { ts: number; data: WeatherContext }>();
```

```ts
export async function getWeatherContext(
  lat: number,
  lng: number,
): Promise<WeatherContext | null> {
  const key = cacheKey(lat, lng);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.data;

  try {
    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lng),
      daily:
        "temperature_2m_max,temperature_2m_min,precipitation_probability_max",
      timezone: "auto",
      forecast_days: String(FORECAST_DAYS),
    });
    const res = await fetch(
      `${OPEN_METEO_URL}?${params.toString()}`,
      { headers: { Accept: "application/json" } },
    );
    if (!res.ok) {
      console.warn(`[weather] Open-Meteo HTTP ${res.status} for ${key}`);
      return null;
    }
    const raw = await res.json();
    if (!raw?.daily?.time?.length) {
      console.warn(`[weather] no forecast data returned for ${key}`);
      return null;
    }
    const ctx = buildContext(raw);
    cache.set(key, { ts: Date.now(), data: ctx });
    return ctx;
  } catch (e) {
    console.warn(
      `[weather] failed to fetch forecast for ${key}: ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
    return null;
  }
}
```

Backend response shape:

```ts
export interface WeatherContext {
  updatedAt: string;
  forecast_days: ForecastDay[];
  // Convenience rollups the advisory prompt can reference directly.
  precipitation_probability: number | null;
  precipitation_mm: number | null;
  temp_min: number | null;
  temp_max: number | null;
}
```

```ts
function buildContext(raw: any): WeatherContext {
  const times = (raw?.daily?.time || []) as string[];
  const days: ForecastDay[] = times.map((date, i) => ({
    date,
    rainPct:
      raw.daily.precipitation_probability_max != null
        ? (raw.daily.precipitation_probability_max[i] ?? null)
        : null,
    tMax:
      raw.daily.temperature_2m_max != null
        ? (raw.daily.temperature_2m_max[i] ?? null)
        : null,
    tMin:
      raw.daily.temperature_2m_min != null
        ? (raw.daily.temperature_2m_min[i] ?? null)
        : null,
  }));
```

`precipitation_mm` is always `null` currently:

```ts
    precipitation_mm: null,
```

---

### CHIRPS usage

**File:** `ndvi-monitor/supabase/functions/ee-alerts-worker/index.ts`

```ts
function getRainfallMm(geojson: any): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const geom = toEeGeometry(geojson);
    const end = ee.Date(Date.now());
    const start = end.advance(-21, "day");
    ee.ImageCollection("UCSB-CHG/CHIRPS/DAILY")
      .filterDate(start, end)
      .sum()
      .reduceRegion({
        reducer: ee.Reducer.mean(),
        geometry: geom,
        scale: 5000,
        maxPixels: 1e9,
      })
      .evaluate((result: any, err: string) => {
        if (err) reject(new Error(err));
        else resolve(result?.precipitation ?? 0);
      });
  });
}
```

**File:** `ndvi-monitor/supabase/functions/ee-data/index.ts`

```ts
async function actionGetDryMonths(payload: any) {
  const geom = toEeGeometry(payload.geometry);
  const months = payload.months || [];
  if (!months.length) return { dryMonths: [] };
  const monthFC = ee.FeatureCollection(
    months.map((m: any, i: number) =>
      ee.Feature(null, { idx: i, year: m.year, month: m.month }),
    ),
  );
  const results = monthFC.map((ft: any) => {
    ft = ee.Feature(ft);
    const year = ee.Number(ft.get("year"));
    const monthNum = ee.Number(ft.get("month"));
    const start = ee.Date.fromYMD(year, monthNum, 1);
    const end = start.advance(1, "month");
    const totalMm = ee
      .ImageCollection("UCSB-CHG/CHIRPS/DAILY")
      .filterDate(start, end)
      .filterBounds(geom)
      .sum()
      .reduceRegion({
        reducer: ee.Reducer.mean(),
        geometry: geom,
        scale: 5000,
        maxPixels: 1e9,
      })
      .get("precipitation", 1e3);
    return ft.set("totalMm", totalMm);
  });
```

### IMERG usage

**File:** `ndvi-monitor/supabase/functions/ee-data/index.ts`

```ts
async function computeImergTotalMm(
  geom: any,
  start: any,
  end: any,
): Promise<number | null> {
  const collection = ee
    .ImageCollection("NASA/GPM_L3/IMERG_V07")
    .filterDate(start, end)
    .filterBounds(geom)
    .select("precipitation"); // confirm this exact band name in the EE Code Editor before deploying
  const count = await evaluate(collection.size());
  if (!count) return null;
  const totalImg = collection.sum().multiply(0.5);
  const result = await evaluate(
    totalImg.reduceRegion({
      reducer: ee.Reducer.mean(),
      geometry: geom,
      scale: 10000, // IMERG native grid is ~0.1° (~10km)
      maxPixels: 1e9,
    }),
  );
  return result && result.precipitation != null ? result.precipitation : null;
}
```

```ts
async function actionGetRainfall(payload: any) {
  const geom = toEeGeometry(payload.geometry);
  const daysBack = payload.daysBack || 21;
  const end = ee.Date(Date.now());
  const start = end.advance(-daysBack, "day");
  const mm = await computeImergTotalMm(geom, start, end);
```

### Weather cache summary

- **Database table:** NOT FOUND. No weather table exists.
- **Frontend cache:** in-memory `Map`, key `lat.toFixed(4),lng.toFixed(4)`, TTL 15 min — currently disabled (`USE_CACHE = false`).
- **Worker cache:** in-memory `Map`, same key/TTL 15 min, but per function isolate; no persistent cache.
- Open-Meteo results are **not** stored in Supabase.

---

## 2. Fields data model

### Baseline tables

**File:** `ndvi-monitor/migrations/000_baseline_schema.sql`

```sql
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  co_op_name text,
  telegram_chat_id text unique,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;
create policy "Users can view own profile" on profiles
  for select using (auth.uid() = id);
create policy "Users can update own profile" on profiles
  for update using (auth.uid() = id);

-- auto-create a profile row whenever someone signs up
create function public.handle_new_user() returns trigger as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create table fields (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references profiles(id) on delete cascade,
  name text not null,
  geojson jsonb not null,
  area_ha numeric,
  planting_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table fields enable row level security;
create policy "Users can view own fields" on fields
  for select using (auth.uid() = owner_id);
create policy "Users can insert own fields" on fields
  for insert with check (auth.uid() = owner_id);
create policy "Users can update own fields" on fields
  for update using (auth.uid() = owner_id);
create policy "Users can delete own fields" on fields
  for delete using (auth.uid() = owner_id);

create table link_codes (
  code text primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  expires_at timestamptz not null,
  used boolean not null default false,
  created_at timestamptz not null default now()
);

alter table link_codes enable row level security;
create policy "Users can view own link codes" on link_codes
  for select using (auth.uid() = user_id);
create policy "Users can create own link codes" on link_codes
  for insert with check (auth.uid() = user_id);

create table alerts_log (
  id uuid primary key default gen_random_uuid(),
  field_id uuid not null references fields(id) on delete cascade,
  status text not null,        -- 'healthy' | 'below_expected' | 'stressed'
  ndvi_value numeric,
  message text,
  chat_id text,
  sent_at timestamptz not null default now()
);

alter table alerts_log enable row level security;
create policy "Users can view own field alerts" on alerts_log
  for select using (
    exists (
      select 1 from fields
      where fields.id = alerts_log.field_id
      and fields.owner_id = auth.uid()
    )
  );
```

### AOIs

**File:** `ndvi-monitor/migrations/001_aois.sql`

```sql
create table aois (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references profiles(id) on delete cascade,
  name text not null,
  bounds jsonb not null,   -- { west, south, east, north } — same shape as current aoiCoords
  created_at timestamptz not null default now()
);

alter table aois enable row level security;

create policy "Users can view own aois" on aois
  for select using (auth.uid() = owner_id);
create policy "Users can insert own aois" on aois
  for insert with check (auth.uid() = owner_id);
create policy "Users can update own aois" on aois
  for update using (auth.uid() = owner_id);
create policy "Users can delete own aois" on aois
  for delete using (auth.uid() = owner_id);

create function public.enforce_aoi_limit() returns trigger as $$
begin
  if (select count(*) from aois where owner_id = new.owner_id) >= 5 then
    raise exception 'AOI limit reached (max 5 per user)';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger aois_enforce_limit
  before insert on aois
  for each row execute procedure public.enforce_aoi_limit();

alter table fields add column aoi_id uuid references aois(id) on delete set null;
```

Later tier-aware replacement:

```sql
create or replace function public.enforce_aoi_limit() returns trigger as $$
declare
  v_limit integer;
begin
  select max_aois into v_limit from profiles where id = new.owner_id;
  if (select count(*) from aois where owner_id = new.owner_id) >= coalesce(v_limit, 1) then
    raise exception 'AOI limit reached for your current plan (max %)', v_limit;
  end if;
  return new;
end;
$$ language plpgsql;
```

### Fields table final columns

The final shape is assembled from `000`, `001`, `008`, `011`, `012_ee_cost_control_cache`, and `016_field_crop_and_location`.

```sql
-- 000_baseline_schema.sql
create table fields (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references profiles(id) on delete cascade,
  name text not null,
  geojson jsonb not null,
  area_ha numeric,
  planting_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 001_aois.sql
alter table fields add column aoi_id uuid references aois(id) on delete set null;

-- 008_planting_date_source.sql
alter table fields add column planting_date_source text not null default 'manual';
alter table fields add constraint fields_planting_date_source_check
  check (planting_date_source in ('manual', 'estimated'));

-- 011_field_centroid.sql
ALTER TABLE fields
  ADD COLUMN IF NOT EXISTS centroid_lat double precision,
  ADD COLUMN IF NOT EXISTS centroid_lng double precision;

-- 012_ee_cost_control_cache.sql
alter table fields
  add column if not exists next_expected_pass date,
  add column if not exists imagery_source text not null default 'sentinel-2';

-- 016_field_crop_and_location.sql
ALTER TABLE fields
  ADD COLUMN IF NOT EXISTS crop_name text,
  ADD COLUMN IF NOT EXISTS crop_english text;
```

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK, `gen_random_uuid()` |
| `owner_id` | `uuid` | NOT NULL, defaults `auth.uid()`, FK `profiles(id)` ON DELETE CASCADE |
| `name` | `text` | NOT NULL |
| `geojson` | `jsonb` | NOT NULL |
| `area_ha` | `numeric` | nullable |
| `planting_date` | `date` | nullable |
| `notes` | `text` | nullable |
| `created_at` | `timestamptz` | NOT NULL default `now()` |
| `updated_at` | `timestamptz` | NOT NULL default `now()` |
| `aoi_id` | `uuid` | FK `aois(id)` ON DELETE SET NULL |
| `planting_date_source` | `text` | NOT NULL default `'manual'`, check `manual/estimated` |
| `centroid_lat` | `double precision` | nullable |
| `centroid_lng` | `double precision` | nullable |
| `next_expected_pass` | `date` | nullable |
| `imagery_source` | `text` | NOT NULL default `'sentinel-2'` |
| `crop_name` | `text` | nullable, user-entered crop |
| `crop_english` | `text` | nullable, normalized crop key |

**Address columns: NOT FOUND.** There is no `province`, `district`, `commune`, `village`, or administrative code column. Only `name` + `geojson` + crop fields + centroid.

---

### How centroid/location is derived

Client-side on insert:

**File:** `ndvi-monitor/src/services/supabase.js`

```js
export function fieldCentroid(geojson) {
  try {
    const geom = geojson && (geojson.geometry || geojson)
    if (!geom || !geom.coordinates) return {}
    const c = turfCentroid(geom)
    const coord = c && c.geometry && c.geometry.coordinates
    if (!coord || !isFinite(coord[0]) || !isFinite(coord[1])) return {}
    return { centroid_lng: coord[0], centroid_lat: coord[1] }
  } catch {
    return {}
  }
}

export async function insertField({ name, geojson, area_ha, planting_date, planting_date_source, crop_name, crop_english }) {
  const session = await requireSession()
  const centroid = fieldCentroid(geojson)
  const { data, error } = await sb
    .from('fields')
    .insert({
      name, geojson, area_ha, planting_date,
      planting_date_source: planting_date_source || 'manual',
      crop_name: crop_name || null,
      crop_english: crop_english || null,
      owner_id: session.user.id,
      ...centroid,
    })
    .select()
    .single()
  if (error) throw error
  return mapRowToField(data)
}
```

On field edit:

**File:** `ndvi-monitor/src/store.js`

```js
export function onFieldEdited() {
  const layers = []
  mapReg.drawnItems.eachLayer((l) => layers.push(l.toGeoJSON()))
  if (layers.length > 0 && state.currentFieldId) {
    const field = state.fields.find((f) => f.id === state.currentFieldId)
    if (field) {
      invalidateChartCacheForField(field.id)
      updateField(field.id, {
        geojson: layers[0],
        area_ha: getFieldAreaHectares(layers[0]),
        ...supabase.fieldCentroid(layers[0]),
      })
    }
  }
  finishFieldEdit()
}
```

SQL backfill centroid:

**File:** `ndvi-monitor/migrations/011_field_centroid.sql`

```sql
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
```

Human-readable location is reverse-geocoded on demand, not stored:

**File:** `ndvi-monitor/src/services/geocode.js`

```js
export function reverseGeocode(lat, lng, timeoutMs = 6000) {
  if (lat == null || lng == null || !isFinite(lat) || !isFinite(lng)) return Promise.resolve(null)
  const key = lat.toFixed(3) + ',' + lng.toFixed(3)
  if (CACHE.has(key)) return Promise.resolve(CACHE.get(key))
  const run = queue.then(() =>
    fetch(
      'https://nominatim.openstreetmap.org/reverse' +
        '?format=jsonv2&zoom=10&lat=' + encodeURIComponent(lat) + '&lon=' + encodeURIComponent(lng)
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const a = j && j.address
        const region = a && (a.province || a.state || a.region || a.county)
        const country = a && a.country
        const name = [region, country].filter(Boolean).join(', ')
        return name || null
      })
      .catch(() => null)
  )
```

---

### Profiles + subscription columns

**File:** `ndvi-monitor/migrations/012_subscription_tiers.sql`

```sql
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table organizations enable row level security;

create policy "Owners can view own organization" on organizations
  for select using (auth.uid() = owner_id);
create policy "Owners can update own organization" on organizations
  for update using (auth.uid() = owner_id);
create policy "Owners can insert own organization" on organizations
  for insert with check (auth.uid() = owner_id);

alter table profiles add column organization_id uuid references organizations(id) on delete set null;

alter table profiles add column subscription_tier text not null default 'free'
  check (subscription_tier in ('free', 'individual', 'coop'));

alter table profiles add column subscription_status text not null default 'active'
  check (subscription_status in ('active', 'trialing', 'past_due', 'canceled'));

alter table profiles add column subscription_source text not null default 'none'
  check (subscription_source in ('none', 'manual_grant', 'aba_payway'));

alter table profiles add column subscription_renews_at timestamptz;

alter table profiles add column max_aois integer not null default 1;
alter table profiles add column max_hectares numeric not null default 10;
alter table profiles add column consult_ai_enabled boolean not null default false;

create table billing_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  event_type text not null
    check (event_type in ('grant', 'renewal', 'downgrade', 'cancel', 'payment_received', 'payment_failed')),
  tier text not null check (tier in ('free', 'individual', 'coop')),
  source text not null default 'manual_grant'
    check (source in ('manual_grant', 'aba_payway')),
  aba_transaction_id text,
  amount numeric,
  currency text default 'USD',
  notes text,
  created_at timestamptz not null default now()
);

alter table billing_events enable row level security;

create policy "Users can view own billing events" on billing_events
  for select using (auth.uid() = profile_id);
```

**File:** `ndvi-monitor/migrations/009_preferred_language.sql`

```sql
alter table profiles add column preferred_language text not null default 'en';

alter table profiles add constraint profiles_preferred_language_check
  check (preferred_language in ('en', 'km'));
```

### Payment / subscription tables

**File:** `ndvi-monitor/migrations/014_aba_payway_integration.sql`

```sql
create table if not exists public.subscription_prices (
  tier        text primary key,
  amount      numeric(10,2) not null check (amount >= 0),
  currency    text not null default 'USD' check (currency = 'USD'), -- ABA sandbox: USD only for now
  updated_at  timestamptz not null default now()
);

insert into public.subscription_prices (tier, amount, currency) values
  ('individual', 5.00, 'USD'),
  ('coop',       39.00, 'USD')
on conflict (tier) do nothing;

alter table public.subscription_prices enable row level security;

create policy "anyone can read prices"
  on public.subscription_prices for select
  to authenticated
  using (true);

create table if not exists public.payment_transactions (
  id               uuid primary key default gen_random_uuid(),
  profile_id       uuid not null references public.profiles(id) on delete cascade,
  tier             text not null references public.subscription_prices(tier),
  tran_id          text not null unique,           -- our tran_id, sent to ABA
  amount           numeric(10,2) not null,
  currency         text not null default 'USD',
  status           text not null default 'pending'
                   check (status in ('pending', 'approved', 'failed', 'refunded')),
  apv              text,                            -- ABA approval code, once known
  payway_status_code text,                          -- raw ABA status field from callback
  raw_callback     jsonb,                            -- full verified pushback payload, for audits
  req_time         text not null,                    -- yyyyMMddHHmmss sent to ABA (needed to rebuild hash if re-checking status)
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.payment_transactions enable row level security;

create policy "users can read their own payment transactions"
  on public.payment_transactions for select
  to authenticated
  using (profile_id = auth.uid());
```

### EE cache tables

**File:** `ndvi-monitor/migrations/012_ee_cost_control_cache.sql`

```sql
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

alter table ee_trend_cache enable row level security;

create table if not exists ee_observation_cache (
  field_id uuid not null references fields(id) on delete cascade,
  scene_date date not null,
  source text not null default 'Sentinel-2',
  cloud_cover numeric,
  ndvi numeric,
  computed_at timestamptz not null default now(),
  primary key (field_id, scene_date)
);

alter table ee_observation_cache enable row level security;
```

**File:** `ndvi-monitor/migrations/015_ee_tile_cache.sql`

```sql
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

alter table ee_tile_cache enable row level security;
```

**File:** `ndvi-monitor/migrations/016_ee_tile_cache_cloud_resilience.sql`

```sql
alter table ee_tile_cache drop constraint if exists ee_tile_cache_pkey;
alter table ee_tile_cache drop constraint if exists ee_tile_cache_index_year_month_geometry_hash_key;

alter table ee_tile_cache add column if not exists clear_scene_count int;
alter table ee_tile_cache add column if not exists valid_fraction numeric;
alter table ee_tile_cache add column if not exists composite_start text;
alter table ee_tile_cache add column if not exists composite_end text;
alter table ee_tile_cache add column if not exists days_since_observation int;

alter table ee_tile_cache add primary key (index, year, month, geometry_hash, mode);
```

All three cache tables have RLS enabled with **zero policies** by design:

```sql
-- No end-user policies: this table is only ever read/written by the ee-data
-- Edge Function using the service_role key.
```

### Alert state

`alerts_log` is the only alert-state table. There is no separate `alert_state` table.

**File:** `ndvi-monitor/migrations/010_field_photos_storage_and_alert_columns.sql`

```sql
alter table alerts_log add column if not exists telegram_sent boolean default null;
```

The worker's dedup check reads the latest row for the field:

```ts
const { data: lastAlert } = await supabase
  .from("alerts_log")
  .select("status")
  .eq("field_id", field.id)
  .order("sent_at", { ascending: false })
  .limit(1)
  .maybeSingle();
```

---

## 3. Alerts worker

**File:** `ndvi-monitor/supabase/functions/ee-alerts-worker/index.ts`

Worker initialization and service-role client:

```ts
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
const EE_KEY = JSON.parse(Deno.env.get("EE_SERVICE_ACCOUNT_KEY") || "{}");

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
```

### How it selects fields

```ts
const { data: fields, error } = await supabase
  .from("fields")
  .select(
    "id, name, geojson, planting_date, crop_english, centroid_lat, centroid_lng, owner_id, profiles!inner(telegram_chat_id, preferred_language)",
  )
  .not("profiles.telegram_chat_id", "is", null);

if (error) throw error;
```

This is a **cross-user query**: it reads every field whose owner has a linked Telegram chat.

### How it decides to send

The worker always sends for every field with a linked chat once it has a reading. There is no “only on worsening” dedup except the `no_data` transition guard.

```ts
        // Always send — every run, regardless of whether status changed or
        // improved. (This intentionally removes the Part 5 dedup/"only on
        // worsening" guard — every field with a linked chat gets a message
        // on every worker run.)
```

```ts
        const reading = await getFieldReading(field.geojson);

        if (reading.source === "none") {
          // No optical scene in 90 days AND no S1 coverage either. Look up
          // the last logged status so we still only send the "can't
          // monitor" notice once on transition into no_data, not every run
          // — this stays deliberately quiet on repeat, unlike the
          // always-send policy below, because a daily "still can't see
          // your field" message adds no information after the first one.
          const { data: lastAlert } = await supabase
            .from("alerts_log")
            .select("status")
            .eq("field_id", field.id)
            .order("sent_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          const lastStatus = lastAlert?.status ?? null;
          const sendNoDataMsg = lastStatus !== "no_data";
```

Radar-only readings always send:

```ts
        if (reading.source === "radar") {
          const message = buildRadarAlertMessage(field.name, reading.rvi, lang);
          const telegramSent = await sendTelegram(chatId, message);

          await supabase.from("alerts_log").insert({
            field_id: field.id,
            status: "radar_flag",
            ndvi_value: null,
            message,
            chat_id: chatId,
            telegram_sent: telegramSent,
          });
```

Optical status is computed by `statusFromNdvi`:

```ts
        const { ndvi, confidence, windowDays } = reading;
        const useGeneric =
          !!(field as any).crop_english &&
          (field as any).crop_english !== "rice";
        const { status, stage } = statusFromNdvi(
          ndvi,
          field.planting_date,
          useGeneric,
        );
```

### Where advisory text is built

`buildAdvisoryPrompt` builds the LLM prompt:

```ts
async function buildAdvisoryPrompt(
  field: any,
  ndvi: number,
  status: string,
  stage: string | null,
  rainfall: number | null,
  weather: WeatherContext | null,
  lang: string,
): Promise<string> {
  const lswi = await getLswiForGeometry(field.geojson).catch(() => null);
  const pct = await getNdviTrendPct(field.geojson).catch(() => null);
  const pctLine =
    pct == null || !isFinite(pct)
      ? "n/a"
      : pct >= 0
        ? `fell about ${pct.toFixed(0)}%`
        : `rose about ${Math.abs(pct).toFixed(0)}%`;
  const stageText = stage ?? "unknown";
  const rainText = rainfall === null ? "n/a" : `${rainfall.toFixed(0)}mm`;
  const statusLabel = status.replace("_", " ");
  const langLine = languageLine(lang);

  return `You are writing a short Telegram alert for a rice farmer in Battambang, Cambodia, about their field named "${field.name}".
Satellite data: NDVI ${ndvi.toFixed(2)} (${pctLine}), LSWI (moisture) ${lswi == null ? "n/a" : lswi.toFixed(2)}, rainfall (21 days) ${rainText}, growth stage: ${stageText}, current status: ${statusLabel}.
${forecastContextLine(weather)}

${langLine}
Write 2-3 short sentences. Describe what the numbers suggest about the likely cause of a stress signal (drought vs. flood vs. normal for this growth stage) and give ONE practical, cautious next step. Use the weather forecast to inform this: mention upcoming rain (or its absence) when it is relevant to the field's situation — e.g. warn that rain is expected soon if the field is dry, or note a dry spell ahead if the forecast shows little rain. IMPORTANT: this is guidance to inform the farmer, NOT a diagnosis — never state a cause with certainty. Always hedge with words like "likely" / "could be". Do not repeat the technical index names (NDVI, LSWI) in the reply itself.`;
}
```

Forecast prompt line:

```ts
function forecastContextLine(weather: WeatherContext | null): string {
  if (!weather || !weather.forecast_days?.length)
    return "weather forecast: n/a";
  const days = weather.forecast_days
    .map(
      (d) =>
        `${d.date.split("T")[0]}: rain ${d.rainPct == null ? "n/a" : `${d.rainPct}%`}, max ${d.tMax == null ? "n/a" : `${Math.round(d.tMax)}°C`}, min ${d.tMin == null ? "n/a" : `${Math.round(d.tMin)}°C`}`,
    )
    .join("; ");
  return `weather forecast (next ~5 days): ${days}`;
}
```

Fallback flat template:

```ts
function buildAlertMessage(
  fieldName: string,
  status: string,
  stage: string | null,
  ndvi: number,
  rainfall: number | null,
  weather: WeatherContext | null,
  lang: string,
): string {
  const stageText = stage ? ` (${stage})` : "";
  const rainText = rainfall === null ? "n/a" : `${rainfall.toFixed(0)}mm`;
  const statusLabel =
    lang === "km"
      ? status === "stressed"
        ? "កំពុងមានស្ត្រេស"
        : status === "below_expected"
          ? "ទាបជាងការរំពឹងទុក"
          : status === "healthy"
            ? "ល្អ"
            : status.replace("_", " ")
      : status.replace("_", " ");
  const wxText =
    weather?.precipitation_probability == null
      ? ""
      : lang === "km"
        ? ` — ឱកាសភ្លៀងបន្ទាប់ 5 ថ្ងៃ ~${Math.round(weather.precipitation_probability)}%`
        : ` — next-5-day rain ~${Math.round(weather.precipitation_probability)}%`;
```

### Where an extra data input is added

The natural insertion point is immediately after rainfall is fetched and before `buildAdvisoryPrompt`:

```ts
        const rainfall = await getRainfallMm(field.geojson);
        // Weather forecast for the field centroid (never blocks the alert — null
        // on failure means the advisory simply runs without a forecast line).
        let weather: WeatherContext | null = null;
        try {
          const lat = (field as any).centroid_lat;
          const lng = (field as any).centroid_lng;
          if (lat != null && lng != null) {
            weather = await getWeatherContext(lat, lng);
          } else {
            console.warn(
              `No centroid for field ${field.name} (${field.id}) — skipping weather forecast`,
            );
          }
        } catch (e) {
          console.warn(
            `Weather fetch failed for field ${field.name}: ${
              e instanceof Error ? e.message : String(e)
            } — continuing with stress data only`,
          );
        }
        const prompt = await buildAdvisoryPrompt(
          field,
          ndvi,
          status,
          stage,
          rainfall,
          weather,
          lang,
        );
```

A new input would be added here, passed into `buildAdvisoryPrompt`, and optionally into `buildAlertMessage` for the non-LLM fallback.

### How the worker is triggered

**File:** `ndvi-monitor/migrations/003_cron_scheduled_worker.sql`

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Store the service role key somewhere the cron job can reach it, without
-- putting it in the SQL text itself. Supabase Vault is the safer option:
select vault.create_secret('YOUR_SERVICE_ROLE_KEY', 'service_role_key');

-- Schedule: once daily. Cron times are UTC — 23:00 UTC = 06:00 Cambodia (UTC+7),
-- a sensible early-morning check before anyone's out in the field.
select cron.schedule(
  'ndvi-alerts-daily',
  '0 23 * * *',
  $$
  select net.http_post(
    url := 'https://wopwwtnvqyomiwbsxiks.functions.supabase.co/ee-alerts-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
```

Manual trigger: `ndvi-monitor/supabase/functions/trigger-alerts-worker/index.ts`

```ts
const WORKER_URL =
  Deno.env.get("EE_WORKER_URL") ||
  "https://wopwwtnvqyomiwbsxiks.functions.supabase.co/ee-alerts-worker";
```

```ts
  const resp = await fetch(WORKER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceRole}`,
    },
    body: body || "{}",
  });
```

`trigger-alerts-worker` has default JWT verification enabled (not listed in `config.toml`), so any authenticated user can invoke it and cause a cross-user alert run.

---

## 4. Auth and roles

### Users

Users are Supabase Auth users; `profiles` extends `auth.users`.

**File:** `ndvi-monitor/migrations/000_baseline_schema.sql`

```sql
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  co_op_name text,
  telegram_chat_id text unique,
  created_at timestamptz not null default now()
);
```

Auto-profile trigger:

```sql
create function public.handle_new_user() returns trigger as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

Current sign-in method is **email/password**, not magic link:

**File:** `ndvi-monitor/src/services/supabase.js`

```js
// Google OAuth sign-in is disabled until the provider is configured (see the
// commented-out button in AuthOverlay.vue). Re-enable by restoring this.
// export async function signInWithGoogle() {
//   return sb.auth.signInWithOAuth({ provider: 'google' })
// }

export async function signInWithEmailPassword(email, password) {
  return sb.auth.signInWithPassword({ email, password })
}

export async function signUpWithEmail(email, password) {
  return sb.auth.signUp({ email, password })
}
```

**File:** `ndvi-monitor/src/components/AuthOverlay.vue`

```html
<!-- Google sign-in is disabled until OAuth is configured (see
store.signInWithSupabaseGoogle / services/supabase.js
signInWithGoogle). Re-enable by uncommenting this block.
```

### Roles

**No role model exists.** There is no `role` column on `profiles`, no `memberships`, no `org_members`, and no `viewer` concept. Grep for `viewer`, `read-only`, `role`, `organization`, `membership` found only the bare `organizations` table and the `organization_id` column.

### Organizations

**File:** `ndvi-monitor/migrations/012_subscription_tiers.sql`

```sql
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table organizations enable row level security;

create policy "Owners can view own organization" on organizations
  for select using (auth.uid() = owner_id);
create policy "Owners can update own organization" on organizations
  for update using (auth.uid() = owner_id);
create policy "Owners can insert own organization" on organizations
  for insert with check (auth.uid() = owner_id);

alter table profiles add column organization_id uuid references organizations(id) on delete set null;
```

The migration explicitly defers membership/roles:

```sql
--   - Co-op multi-member/staff roles (organizations table is intentionally
--     bare — no member list, no roles yet)
```

### RLS policies on `fields`

**File:** `ndvi-monitor/migrations/000_baseline_schema.sql`

```sql
alter table fields enable row level security;
create policy "Users can view own fields" on fields
  for select using (auth.uid() = owner_id);
create policy "Users can insert own fields" on fields
  for insert with check (auth.uid() = owner_id);
create policy "Users can update own fields" on fields
  for update using (auth.uid() = owner_id);
create policy "Users can delete own fields" on fields
  for delete using (auth.uid() = owner_id);
```

Re-created idempotently in `ndvi-monitor/migrations/005_fields_aois_rls_hardening.sql`:

```sql
alter table fields enable row level security;

drop policy if exists "Users can insert own fields" on fields;
create policy "Users can insert own fields" on fields
  for insert with check (auth.uid() = owner_id);

drop policy if exists "Users can view own fields" on fields;
create policy "Users can view own fields" on fields
  for select using (auth.uid() = owner_id);

drop policy if exists "Users can update own fields" on fields;
create policy "Users can update own fields" on fields
  for update using (auth.uid() = owner_id);

drop policy if exists "Users can delete own fields" on fields;
create policy "Users can delete own fields" on fields
  for delete using (auth.uid() = owner_id);
```

### Public / shared access

- **Fields, AOIs, alerts, profiles, billing:** owner-only. No anon or non-owner policy.
- **Exception:** subscription prices are readable by any authenticated user.

**File:** `ndvi-monitor/migrations/014_aba_payway_integration.sql`

```sql
create policy "anyone can read prices"
  on public.subscription_prices for select
  to authenticated
  using (true);
```

- Storage policies are owner-folder only:

**File:** `ndvi-monitor/migrations/010_field_photos_storage_and_alert_columns.sql`

```sql
create policy "field_photos_storage_select" on storage.objects
  for select using (
    bucket_id = 'field-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
```

- `telegram-webhook` and `aba-payway-webhook` are public endpoints (`verify_jwt = false`), but they are webhook receivers, not data-read APIs.

**File:** `ndvi-monitor/supabase/config.toml`

```toml
project_id = "wopwwtnvqyomiwbsxiks"

[functions.telegram-webhook]
verify_jwt = false

[functions.aba-payway-webhook]
verify_jwt = false
```

**Answer: no public/shared non-owner read access to field data exists today.**

---

## 5. API surface

### `ndvi-monitor/supabase/functions/ee-data/index.ts`

Router:

```ts
const HANDLERS: Record<string, Handler> = {
  ping: actionPing,
  getIndexTile: actionGetIndexTile,
  getTrueColorScene: actionGetTrueColorScene,
  getLatestTrueColor: actionGetLatestTrueColor,
  getZoneBreakdown: actionGetZoneBreakdown,
  getIndexTimeSeries: actionGetIndexTimeSeries,
  getRviTimeSeries: actionGetRviTimeSeries,
  detectPlantingDate: actionDetectPlantingDate,
  getDryMonths: actionGetDryMonths,
  getFieldStatus: actionGetFieldStatus,
  getFieldHealthScore: actionGetFieldHealthScore,
  getRecentIndexValue: actionGetRecentIndexValue,
  getAllFieldStatuses: actionGetAllFieldStatuses,
  getAllFieldTrends: actionGetAllFieldTrends,
  getRainfall: actionGetRainfall,
  getObservations: actionGetObservations,
  getFieldBundle: actionGetFieldBundle,
};
```

Payload keys per handler:

| Action | Params |
|---|---|
| `ping` | none |
| `getIndexTile` | `index`, `year`, `month`, `geometry`, `sceneDate` |
| `getTrueColorScene` | `geometry`, `year`, `month`, `sceneDate` |
| `getLatestTrueColor` | `geometry`, `lookbackDays` |
| `getZoneBreakdown` | `index`, `geometry`, `year`, `month` |
| `getIndexTimeSeries` | `index`, `months`, `geometry`, `lat`, `lng` |
| `getRviTimeSeries` | `months`, `geometry`, `lat`, `lng` |
| `detectPlantingDate` | `geometry` |
| `getDryMonths` | `geometry`, `months` |
| `getFieldStatus` | `geometry`, `sceneDate`, `index`, `plantingDate`, `forceRadar` |
| `getFieldHealthScore` | `geometry`, `plantingDate`, `year`, `month` |
| `getRecentIndexValue` | `index`, `geometry` |
| `getAllFieldStatuses` | `index`, `fields` |
| `getAllFieldTrends` | `index`, `months`, `fields` |
| `getRainfall` | `geometry`, `daysBack` |
| `getObservations` | `fieldId`, `geometry`, `startISO`, `endISO` |
| `getFieldBundle` | `currentIndex`, `months`, `year`, `month`, `geometry` |

`fields` shape is client-supplied, e.g. `[{ id, geometry }]`; `months` is `[{ year, month }]`.

Auth:

```ts
// Auth: relies on the platform gateway's JWT verification (verify_jwt = true,
// the default — see config.toml; only telegram-webhook opts out), so any
// signed-in app user may call it and anonymous callers are rejected before
// this code runs.
```

### Cross-user aggregation

**No `ee-data` action aggregates across multiple users’ fields.**

`getAllFieldStatuses` / `getAllFieldTrends` are batched, but only over the caller-supplied `payload.fields`:

```ts
  const incoming = Array.isArray(payload.fields) ? payload.fields : [];
  if (!incoming.length) return { statuses: [] };

  const fc = ee.FeatureCollection(
    incoming.map((f: any) =>
      ee.Feature(toEeGeometry(f.geometry), { fid: String(f.id) }),
    ),
  );
```

The frontend sends its own fields:

**File:** `ndvi-monitor/src/store.js`

```js
  const payload = validGeometryFields()
  ...
  ee.getAllFieldStatuses(payload, state.currentIndex, (statuses) => {
```

The only cross-user field read is in `ee-alerts-worker` using the service-role key:

```ts
const { data: fields, error } = await supabase
  .from("fields")
  .select(
    "id, name, geojson, planting_date, crop_english, centroid_lat, centroid_lng, owner_id, profiles!inner(telegram_chat_id, preferred_language)",
  )
  .not("profiles.telegram_chat_id", "is", null);
```

---

## 6. Frontend structure

### `src/` tree, 2 levels

```text
src/
├── App.vue
├── config.js
├── main.js
├── store.js
├── style.css
├── assets/
│   ├── animations/
│   ├── landing-assets/
│   ├── logos-icons/
│   ├── hero.png
│   └── vite.svg
├── components/
│   ├── landing-page/
│   │   ├── CompareSlider.vue
│   │   └── IndexSection.vue
│   ├── AoiEditor.vue
│   ├── AuthOverlay.vue
│   ├── BandPanel.vue
│   ├── ChartModal.vue
│   ├── CheckoutModal.vue
│   ├── CollapsibleBottomSheet.vue
│   ├── CollapsibleDrawer.vue
│   ├── ConfidenceBadge.vue
│   ├── CropPickerModal.vue
│   ├── DatePickerCalendar.vue
│   ├── DatePickerModal.vue
│   ├── FieldDetailPanel.vue
│   ├── FieldFormModal.vue
│   ├── HealthZonePanel.vue
│   ├── HealthZoneScaleBar.vue
│   ├── HealthZoneZoneList.vue
│   ├── HelpModal.vue
│   ├── IndexLegend.vue
│   ├── LeafletMap.vue
│   ├── MapLegend.vue
│   ├── ObservationsPanel.vue
│   ├── PaywallModal.vue
│   ├── PresetEditor.vue
│   ├── PricingCards.vue
│   ├── SettingsModal.vue
│   ├── Sidebar.vue
│   ├── SpotlightTutorial.vue
│   ├── TelegramModal.vue
│   ├── TimeControl.vue
│   ├── Tooltip.vue
│   └── TopBar.vue
├── data/
│   └── landing-indices.js
├── i18n/
│   ├── en.js
│   ├── index.js
│   └── km.js
├── router/
│   └── index.js
├── services/
│   ├── aimScoreCache.js
│   ├── chart.js
│   ├── crops.js
│   ├── earthEngine.js
│   ├── format.js
│   ├── geocode.js
│   ├── healthZone.js
│   ├── pwa.js
│   ├── supabase.js
│   └── weatherService.js
├── styles/
│   └── [64 CSS files]
└── views/
    ├── BillingRedirect.vue
    ├── LandingPage.vue
    ├── LandingPage_old.vue
    ├── MapView.vue
    └── PricingPage.vue
```

### Router

**File:** `ndvi-monitor/src/router/index.js`

```js
import { createRouter, createWebHistory } from 'vue-router'
import { state } from '../store'
import LandingPage from '../views/LandingPage.vue'
import MapView from '../views/MapView.vue'
import PricingPage from '../views/PricingPage.vue'
import BillingRedirect from '../views/BillingRedirect.vue'

const routes = [
  { path: '/', name: 'landing', component: LandingPage },
  { path: '/map', name: 'map', component: MapView },
  { path: '/pricing', name: 'pricing', component: PricingPage },
  { path: '/billing', name: 'billing', component: BillingRedirect },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to) => {
  if (to.name === 'landing' && state.supabaseUser) {
    return { name: 'map' }
  }
  // unauthenticated visitor on the public landing must always see the
  // landing page, even if a past onboarding run persisted `ndvi_landing_done`
  // (which would otherwise leave `landingVisible === false` -> blank page)
  if (to.name === 'landing' && !state.supabaseUser) {
    state.landingVisible = true
  }
  // unauthenticated visitor landing on the map must get the sign-in popup
  if (to.name === 'map' && !state.supabaseUser) {
    state.authOverlayVisible = true
  }
})

export default router
```

### Add/save field flow

Draw event → modal:

**File:** `ndvi-monitor/src/store.js`

```js
export function onFieldCreated(layer) {
  state.isDrawing = false
  mapReg.activeDraw = null
  mapReg.drawnItems.addLayer(layer)
  updateDrawEditVisibility()
  promptSaveField(layer.toGeoJSON())
}
```

```js
export function promptSaveField(geojson) {
  pendingFieldFormGeojson = geojson
  fieldModal.currentName = null
  fieldModal.currentDate = null
  fieldModal.currentCrop = null
  fieldModal.visible = true
}

export function submitFieldForm(name, plantingDate, cropRaw) {
  fieldModal.visible = false
  const geojson = pendingFieldFormGeojson
  pendingFieldFormGeojson = null
  if (!geojson) return
  saveField(name, plantingDate || null, cropRaw || null).then((saved) => {
    if (saved) loadField(saved)
  })
}
```

> **AUDIT FINDING — BUG**
>
> `saveField` signature is `saveField(name, geojson, plantingDate, cropRaw)` (below), but `submitFieldForm` passes only three arguments and omits `geojson`. `const geojson` is computed and then unused. This means the add-field flow passes the planting date where `geojson` is expected.

```js
export async function saveField(name, geojson, plantingDate, cropRaw) {
  if (!state.supabaseUser) { showToast('Sign in to save fields'); return null }
  const area = getFieldAreaHectares(geojson)
  // UI-only hectare cap (TODO(backend): enforce server-side too — see
  // migrations/012_subscription_tiers.sql "NOT covered"). Blocks right after the field is
  // drawn, but is NOT a real server-side limit yet.
  if (getTotalFieldHectares() + area > state.subscription.maxHectares) {
    showPaywall('hectare')
    return null
  }
  let planting_date = plantingDate || null
  let planting_date_source = 'manual'
  // Feature 3 — if the farmer didn't enter a planting date, try to estimate one
  // from the LSWI transplant spike. Never overwrites a manual entry.
  if (!planting_date && state.eeReady) {
    const geom = geojson && (geojson.geometry || geojson)
    if (geom && geom.coordinates) {
      const geometry = polygonGeometry(geom.coordinates)
      const detected = await new Promise((resolve) => ee.detectPlantingDate(geometry, resolve))
      if (detected && detected.estimatedDate) {
        planting_date = detected.estimatedDate
        planting_date_source = 'estimated'
      }
    }
  }
  const crop = normalizeCrop(cropRaw)
  try {
    const field = await supabase.insertField({
      name,
      geojson,
      area_ha: area,
      planting_date,
      planting_date_source,
      crop_name: crop.typed || null,
      crop_english: crop.english || null,
    })
    state.fields.push(field)
    if (planting_date_source === 'estimated' && planting_date) {
      showToast('Estimated planting date from satellite data \u2014 tap to adjust', 4000)
    }
    loadFieldTrend(field)
    return field
  } catch (err) {
    if (handleAuthError(err)) return null
    showToast('Failed to save field: ' + err.message)
    return null
  }
}
```

Modal submit:

**File:** `ndvi-monitor/src/components/FieldFormModal.vue`

```js
function submit() {
  touched.value = true
  // Save is allowed without a date — saveField() will then try to auto-detect
  // the planting window from satellite data. Crop is optional too.
  if (!name.value) return
  store.submitFieldForm(name.value, date.value, cropText.value)
}
```

Supabase insert:

**File:** `ndvi-monitor/src/services/supabase.js`

```js
export async function insertField({ name, geojson, area_ha, planting_date, planting_date_source, crop_name, crop_english }) {
  const session = await requireSession()
  const centroid = fieldCentroid(geojson)
  const { data, error } = await sb
    .from('fields')
    .insert({
      name, geojson, area_ha, planting_date,
      planting_date_source: planting_date_source || 'manual',
      crop_name: crop_name || null,
      crop_english: crop_english || null,
      owner_id: session.user.id,
      ...centroid,
    })
    .select()
    .single()
  if (error) throw error
  return mapRowToField(data)
}
```

### Where a government/extension dashboard page fits

1. New component: `ndvi-monitor/src/views/GovernmentDashboard.vue` (or `ExtensionDashboard.vue`).
2. Route in `ndvi-monitor/src/router/index.js`, e.g. `{ path: '/government', name: 'government', component: GovernmentDashboard }`.
3. Navigation entry in `ndvi-monitor/src/components/TopBar.vue` (settings menu or a new top-level nav control).
4. Reuse `LeafletMap.vue`, the `ee-data` wrapper, and existing chart/legend components.

Important constraint: a dashboard that reads other users’ fields cannot work with the current RLS. It needs an `organizations`/membership/role model plus a new RLS policy or a service-role backend endpoint with explicit authorization.

---

## 7. Environment and constraints

### Env var / secret names

Frontend build-time (`import.meta.env`):

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_TELEGRAM_BOT_USERNAME
```

Also present in `ndvi-monitor/.env` but **not read by `src/config.js`**:

```text
SUPABASE_URL
SUPABASE_ANON_KEY
VITE_EE_CLIENT_ID
```

Supabase Edge Function secrets:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
TELEGRAM_BOT_TOKEN
EE_SERVICE_ACCOUNT_KEY
GEMINI_API_KEY
DEEPSEEK_API_KEY
QWEN_API_KEY
ABA_API_KEY
ABA_MERCHANT_ID
ABA_API_BASE_URL
APP_URL
APP_URLS
EE_WORKER_URL
```

Supabase Vault secret used by `pg_cron`:

```text
service_role_key
```

Environment mismatch:

**File:** `ndvi-monitor/src/config.js`

```js
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://wopwwtnvqyomiwbsxiks.supabase.co'
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '<hardcoded anon key>'
```

But `.env` defines `SUPABASE_URL` / `SUPABASE_ANON_KEY` without the `VITE_` prefix, so Vite does not expose them and the hardcoded fallbacks are used. `VITE_EE_CLIENT_ID` is defined but has no code reference.

Security note: `ndvi-monitor/testcommand.txt` contains a live-looking Telegram bot token, chat ID, and Supabase anon JWT.

### Versions

**File:** `ndvi-monitor/package.json`

```json
{
  "dependencies": {
    "@supabase/supabase-js": "^2.111.0",
    "@turf/turf": "^7.3.5",
    "chart.js": "^4.5.1",
    "jspdf": "^4.2.1",
    "lottie-web": "^5.13.0",
    "vue": "^3.5.39",
    "vue-router": "^4.6.4"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^6.0.7",
    "vite": "^8.1.1"
  }
}
```

Installed from `package-lock.json`:

```text
vue                     3.5.40
vite                    8.1.5
@supabase/supabase-js   2.111.0
```

Supabase CLI:

**File:** `ndvi-monitor/supabase/.temp/cli-latest`

```text
v2.117.0
```

Deno runtime version:

```text
NOT FOUND
```

There is no `deno.json`, `deno.lock`, `import_map.json`, Dockerfile, or `.tool-versions` in the repo. Edge Functions import `npm:` modules but do not pin a Deno runtime version.

---

## 8. Quick findings summary

| # | Finding | Location |
|---|---|---|
| 1 | **Add-field flow passes wrong arguments** — `submitFieldForm` omits `geojson` when calling `saveField` | `ndvi-monitor/src/store.js` |
| 2 | **Hectare cap is UI-only**, no server-side enforcement | `ndvi-monitor/src/store.js`, `migrations/012_subscription_tiers.sql` |
| 3 | **All EE server caches disabled** (`USE_EE_CACHE = false`) — every request hits Earth Engine | `supabase/functions/ee-data/index.ts` |
| 4 | **Frontend Open-Meteo cache disabled** — every field open refetches | `src/services/weatherService.js` |
| 5 | **No organization membership / viewer role** — `organizations` is owner-only and bare | `migrations/012_subscription_tiers.sql` |
| 6 | **RVI stress threshold uncalibrated** (`0.4` placeholder) | `supabase/functions/ee-alerts-worker/index.ts` |
| 7 | **Alerts sent every run** — no status-change dedup except `no_data` | `supabase/functions/ee-alerts-worker/index.ts` |
| 8 | **Any authenticated user can trigger cross-user alert runs** via `trigger-alerts-worker` | `supabase/functions/trigger-alerts-worker/index.ts` |
| 9 | **Backend `precipitation_mm` never populated** (always `null`) | `supabase/functions/_shared/weather.ts` |
| 10 | **`.env` naming mismatch** — non-`VITE_` names, so hardcoded config fallbacks are used | `ndvi-monitor/.env`, `src/config.js` |
| 11 | **No address fields** — only `name`, `geojson`, crop fields, centroid | `migrations/*.sql` |
| 12 | **No weather persistence** — forecast cache is in-memory only | frontend + worker weather services |
