# NDVI Rice Monitor

A satellite-based **crop health monitoring app** for rice paddies, built around
real Sentinel-2 Earth Engine data. It turns cloud-free vegetation indices
(NDVI / NDWI / LSWI) into per-field health status, growth-stage alerts, rainfall
context and AI-generated agronomy summaries — in **English and Khmer**.

| | |
|---|---|
| Frontend | Vue 3 (`<script setup>`) + Vite |
| Maps | Leaflet + leaflet-draw (CDN globals) |
| Satellite data | Google Earth Engine (server-side image composites) |
| Backend / storage | Supabase (auth, fields, areas, photos, profiles) |
| Charts | Chart.js |
| Export | jsPDF + html2canvas (PNG / PDF reports) |
| AI advisor | Supabase Edge Function (`consult-ai`) |
| Alerts | Telegram bot linking |

---

## What it does

- **Renders live satellite layers** (NDVI, NDWI, LSWI, true-color photos) for any
  saved area of interest, month by month.
- **Tracks individual fields**: draw a polygon/rectangle around a paddy, give it
  a name, and the app computes its vegetation history.
- **Assesses health against the rice growth cycle** — if you set a planting date,
  current NDVI is compared with the expected range for that stage
  (germination → seedling → vegetative → reproductive → maturation → harvest).
- **Surfaces stress** as a color-coded alert (`Healthy` / `Moderate` / `High`).
- **Warns about unreliable data** — cloud-covered months show a true-color photo
  with an expert "why" note and a one-click jump to the last cloud-free reading;
  if optical is completely blocked it falls back to a radar-based signal (RVI),
  clearly labelled as a different measurement.
- **Adds agronomic context** — rainfall watch, AOI vs. field benchmark, and an
  AI agronomist that writes a plain-language interpretation.
- **Stays usable without needing to read numbers** — the interface is bilingual
  (Khmer / English) and includes an in-app onboarding tour.

---

## Getting started

### 1. Sign in

Click **Sign in with Google** (top-right).

- Google OAuth authenticates with **Earth Engine**, which loads the live
  satellite layers.
- The same account syncs your saved fields and areas via **Supabase**.

> You can explore the map and interact with the demo area before signing in,
> but live imagery and saved fields require authentication.

### 2. Choose or draw an area to monitor

Satellite analysis happens over a **bounding box** (an Area of Interest / AOI).
Up to 5 areas per account, synced across devices.

- Use the **Areas** dropdown (bottom panel) to switch between saved areas.
- Open the **Edit area bounds** button to create/edit an area, then use any tab:
  - **Search place** — type a location, e.g. *Battambang*, and coords auto-fill.
  - **Draw on map** — drag a red rectangle directly over the map.
  - **Manual coordinates** — type West/South/East/North.
  - **Use existing field** — fill bounds from one of your saved fields.

### 3. Watch the vegetation indices

The segmented control lets you switch between **NDVI**, **NDWI**, **LSWI** and
**True Color**:

- **NDVI** (Vegetation) — high green = healthy biomass; red = bare soil, water, stress.
- **NDWI** (Water) — blue = standing surface water (flooded paddies).
- **LSWI** (Land Surface Water) — moisture in soil and plant canopy.
- **True Color** — the actual Sentinel-2 RGB photo (Bands 4·3·2).

The legend + bottom explainer describe what the colors mean. Tooltips on each
index button explain the science behind it.

### 4. Move through time

The **time slider** at the bottom scrubs through the last ~14 months.

- The pill next to it shows how many cloud-free scenes form that month's
  composite (amber dot = 1–2 scenes, lower confidence).
- ▶ **Play** animates through months.
- ↻ **Jump to latest** complete month;** Today** jumps to the current date.
- Cloud-blocked months show the ☁️ badge with a **jump-to-last-valid** shortcut.
- **Compare** toggles a second, side-by-side map so two months and/or indices are
  compared; drag the divider to resize, double-click to reset.

### 5. Track a field

1. Use the **Draw / Add New Field Boundary** buttons in the sidebar (or the
   map toolbar) to draw a rectangle or polygon around your paddy.
2. Name it and optionally **set a planting date** — this activates growth-stage
   and stress assessment.
3. The field appears in **Monitored Fields** with live status, growth stage and
   area. Click to open its detail panel.
4. Click the field's **pencil** to squash/re-drag its boundary on the map and
   click **Save** (top-right) — the button stays visible even with the drawer open.

### 6. Read the field report

The detail panel shows:

- **Health score** vs. the AOI benchmark + a confidence badge.
- **Growth stage** progress bar (days since planting).
- **Stress alert** (NDVI vs expected range for the stage).
- **NDVI trend chart** (click ⛶ to enlarge).
- **Rainfall watch** — 21-day cumulative CHIRPS rainfall.
- **Field photos** — taken via the Telegram bot, and eco-friendly.
- **Ask AI** — get a plain-language interpretation of this field.

### 7. Browse satellite passes

The **Observations** panel lists every satellite pass over the selected field
with source, cloud %, status (clear / low confidence / cloud-blocked) and NDVI.
Click any row to load that date into the map.

### 8. Get alerts & export

- **Telegram alerts** — link your Telegram account to receive a message when a
  field hits a stress state.
- **Export** — download the trend chart as **PNG** or a full **PDF report**
  (chart + field info + health summary).

---

## Feature reference

| Feature | Where | Details |
|---|---|---|
| NDVI / NDWI / LSWI | Band panel | Sentinel-2 indices over AOI or field |
| True Color photo | Band panel | Single-scene RGB (Bands 4·3·2) |
| Latest Satellite View | Band panel | Most recent pass as photo, default (defaults true-color) — does not move the slider |
| Per-scene picker | Band panel (true color) | Pick exact capture date instead of monthly composite |
| Time slider | Bottom | Play, latest, today, cloud badges, jump-to-valid |
| Compare mode | TopBar | Two synced maps side by side |
| Date range | Bottom selector | Season presets (wet/dry/current) or custom range, scopes all data |
| Areas of Interest | Bottoms panel | Up to 5, sync (Supabase) |
| Draw fields | Map toolbar / sidebar | Rectangle + polygon, area warning, edit, delete |
| Planting date | Sidebar » field actions | Drives growth-stage + stress thresholds |
| Growth stage | Field panel | Rice cycle day-by-day |
| Stress / benchmark/rain | Field panel | NDVI stress, AOI benchmark, 21-day rainfall |
| AI agronomist | Field panel | Edge function, signed-in, daily quote |
| Observations | TopBar | Per-pass satellite browse + jump-to-date |
| Telegram alerts | Settings | Nightly field check to your chat |
| Export | TopBar | PNG chart or full PDF report |
| Language | Settings | English / Khmer |
| Help / onboarding | TopBar (?), | Guided tour + "How this works" |

---

## Architecture overview

There's a single **Vue 3 single-file app**. The heavy machinery is kept out of
the components and centralized:

```
src/
├── config.js               # Thresholds, indices, presets, EE project, defaults
├── store.js                # The store — all state + business logic
├── i18n/                   # en + km dictionaries
├── services/
│   ├── earthEngine.js      # EE image requests (tiles, trends, dry months, obs.)
│   └── supabase.js         # Supabase auth + CRUD for fields, areas, photos, profiles
└── components/             # Vue components (map, panels, sidebar, modals)
```

License/CDN globals (Leaflet, leaflet-draw, Chart.js, Earth Engine) are loaded
via `<script>` tags in `index.html`, not bundled, because several are UMD/global
libraries that break under Vite.

---

## Development

```bash
npm install
npm run dev       # local dev server
npm run build     # production build to dist/
npm run preview   # preview the build
```

Set the expected env vars (used only as fallbacks — defaults live in
`src/config.js`):

```
VITE_EE_CLIENT_ID=...
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

---

## Data sources

- **Sentinel-2** MSI optical imagery — composites per month, cloud-masked.
- **CHIRPS** — rainfall for the 21-day watcher.
- **Sentinel-1 (RVI)** — radar vegetation signal, only used as a cloud fallback.
- **Google Earth Engine** — server-side processing of every index.
- **Nominatim (OSM)** — place search for areas.

---

## Conceptual taps

The app is specifically designed around crop growth and reliability-of-signal:

- A **growth stage** changes the *expected* NDVI — a young paddy that reads low
  isn't necessarily stressed; the app compares against the *expected range* for
  its age, not against a fixed threshold, landscape at large.
- **Cloud-obscured months** are told apart from genuinely "bad" fields — the app
  shows what actually happened (photo) and explains why the index can't be
  trusted.
- **RVI (radar) ≠ NDVI** — the app actively and never conflates the two when it
  falls back to radar.

---

## Typical workflow

This is the "happy path" most users follow, in one glance:

```
Sign in with Google
  → pick or draw an area (Areas ▸ Edit area bounds)
  → switch between NDVI / NDWI / LSWI / True Color
  → scrub the time slider through the months
  → draw a field (polygon/rectangle) and set its planting date
  → open the field → read growth stage, stress, trend chart & AI summary
  → link Telegram for stress alerts     export a PDF report
```