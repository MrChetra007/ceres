# NDVI Rice Crop Health Monitor — Build Process

## Project goal
A single-page web app that shows a satellite map of rice-growing areas in Battambang, Cambodia, colored by NDVI (vegetation health). Visitors can drag a time slider to see health change over a season and click any spot for a mini trend chart + stress alert. No visitor login — developer authenticates once.

---

## Phase 1 — Foundations ✅ Complete
- Tested NDVI computation in the **Earth Engine Code Editor** (`code.earthengine.google.com`)
- Defined AOI: `ee.Geometry.Rectangle([103.10, 12.95, 103.25, 13.05])`
- Loaded Sentinel-2 imagery, computed NDVI, verified the green/red overlay over Battambang rice paddies
- Cloud Project ID: **`gen-lang-client-0978198347`** (migrated from `ee-mengtong2025`)

## Phase 2 — App scaffold ✅ Complete (migrated)
- **Original:** Vue 3 + Vite project
- **Current:** Plain HTML/CSS/JS static site (`ndvi-monitor/`)
  - `index.html` — HTML shell with Leaflet, Earth Engine, Chart.js, leaflet-draw script tags
  - `style.css` — Full-screen map, auth overlay, slider panel, dashboard sidebar, info panel, split-screen
  - `app.js` — All application logic
- **Why migrated:** `@google/earthengine` npm package does dynamic function-binding that breaks under Vite's ESM interop (`Failed to locate function parameters`). Loading EE via plain `<script>` tag resolved this.
- Full-screen Leaflet map centered on Battambang (13.05, 103.175, zoom 11)
- OpenStreetMap base tiles (free, no API key)

## Phase 3 — NDVI on the map ✅ Complete
- Auth flow: `ee.data.authenticateViaOauth(CLIENT_ID, success, error)` → `ee.initialize(null, null, callback, error, null, PROJECT_ID)`
- **Auth persistence:** OAuth token saved to `localStorage` via `ee.data.getAuthToken()` / `ee.data.setAuthToken()`. On page reload, saved token is restored automatically — no re-auth popup unless token expires.
- NDVI computation:
  - Filter Sentinel-2 (`COPERNICUS/S2_SR_HARMONIZED`) by AOI, date range, cloud cover (<40%)
  - `.median()` composite → `.normalizedDifference(['B8', 'B4'])` → `.rename('NDVI')`
  - Style: `{ min: -0.2, max: 0.8, palette: ['red', 'yellow', 'green'] }`
  - `getMap()` returns tile URL → `L.tileLayer` added to map
- OAuth Client ID: `355514869488-q3v52vvkb7c3gikr0og89o26m51ev403.apps.googleusercontent.com`

## Phase 4 — Time slider ✅ Complete
- `<input type="range">` mapped to 14 months (Jun 2025 → Jul 2026)
- Debounced 300ms — fires EE request only after user stops dragging
- Loading spinner on slider panel during computation
- Swaps NDVI tile layer on month change

## Phase 5 — Click-to-inspect + trend chart ✅ Complete
- `map.on('click')` captures lat/lng
- `getNdviTimeSeriesAtPoint()` queries EE for all Sentinel-2 NDVI observations at the clicked point
- Chart.js line chart (green fill, NDVI -0.5 to 1.0, date labels) in right-side info panel
- **Stress detection:** compares most recent NDVI to value 14+ days earlier; >15% drop triggers yellow alert badge

## Phase 6 — Polish 🟡 In progress
- Dashboard sidebar ✅ (see Product Pivot below)
- Remaining:
  - Preset location buttons (fly to pre-marked spots)
  - "How this works" explanation panel
  - Loading states hardening

## Phase 7 — Stretch goals 🟡 In progress
### 7.1 Event overlay ✅ Complete
- Flood markers (Aug-Sep 2025) and Dry spell markers (Jan-Mar 2026) displayed as colored bands below the slider track + inline badge next to month label

### 7.2 Compare two dates ✅ Complete
- "Compare OFF/ON" toggle button in slider panel
- Split-screen: two Leaflet maps side-by-side (50% each)
- Dual sliders — each map shows independent NDVI month
- View-synced (pan/zoom one, the other follows via `syncing` flag)
- Right map is display-only (no draw controls)

### 7.3 Export report (C.2) ❌ Not started
- Proper one-page PDF with field name, NDVI chart, status, explanation

### 7.4 NDWI water index ❌ Not started
- Toggle between NDVI (vegetation) and NDWI (water index) layers

---

## Product Pivot Features (added during development)

### Feature A — Draw & save fields ✅ Complete
- leaflet-draw integration (polygon + rectangle tools in map toolbar)
- Fields saved to `localStorage` as GeoJSON via `crypto.randomUUID()` keys
- `saveField()`, `deleteField()`, `getSavedFields()`, `loadField()` CRUD
- Clicking a saved field: loads polygon, fits map bounds, recomputes NDVI for that geometry
- NDVI functions refactored to accept optional `ee.Geometry` parameter

### Feature B — Dashboard ✅ Complete
- ☰ toggle button opens 280px left sidebar listing saved fields
- Each field card: name + live NDVI health badge (🟢 Healthy >0.6 / 🟡 Moderate >0.3 / 🔴 Stressed)
- Status computed via `reduceRegion` over the field polygon for the most recent month
- Click card to load field; hover ✕ to delete

### Feature C — PNG export ✅ Complete
- "Export PNG" button in info panel header
- Downloads `canvas.toDataURL('image/png')` from Chart.js chart

---

## OAuth setup (Google Cloud Console)
- **OAuth 2.0 Client ID**: Web application type
- **Client ID**: `355514869488-q3v52vvkb7c3gikr0og89o26m51ev403.apps.googleusercontent.com`
- **Authorized JavaScript origins**: `http://localhost:5173` (Vite), `http://localhost:3000` (serve), `http://localhost:60822` (serve dynamic)
- Token persisted via `localStorage` — single sign-in survives page reloads

## Tech stack (current)

| Layer | Tool |
|---|---|
| Frontend | Plain HTML/CSS/JS |
| Map | Leaflet + OpenStreetMap tiles |
| Satellite compute | Google Earth Engine (JS client via CDN `<script>` tag, v1.7.36) |
| Auth | Earth Engine OAuth popup (`ee.data.authenticateViaOauth`) |
| Drawing | leaflet-draw (v1.0.4) |
| Charts | Chart.js (v4.4.7) |
| Storage | localStorage (fields, auth token) |

## What's next

1. **Phase 6 polish** — preset locations, "How this works" panel
2. **Phase 7.3** — PDF report export (C.2)
3. **Phase 7.4** — NDWI water index toggle
