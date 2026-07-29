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

## Phase 6 — Polish ✅ Complete
- Preset location buttons (fly to pre-marked spots) ✅
- "How this works" explanation panel (modal with NDVI explanation and feature guide) ✅
- Loading states hardening (counter-based spinner prevents premature removal during rapid slider changes) ✅
- Control layout cleanup: draw toolbar moved to top-right, dashboard toggle and preset panel repositioned with 8-10px spacing below zoom control ✅
- Toast notification when export clicked without selecting a point ✅
- EDITED handler bugfix: update only the actively loaded field instead of all saved fields ✅

## Phase 7 — Stretch goals ✅ Complete
### 7.1 Event overlay ✅ Complete
- Flood markers (Aug-Sep 2025) and Dry spell markers (Jan-Mar 2026) displayed as colored bands below the slider track + inline badge next to month label

### 7.2 Compare two dates ✅ Complete
- "Compare OFF/ON" toggle button in slider panel
- Split-screen: two Leaflet maps side-by-side (50% each)
- Dual sliders — each map shows independent NDVI month
- View-synced (pan/zoom one, the other follows via `syncing` flag)
- Right map is display-only (no draw controls)

### 7.3 Export report ✅ Complete
- One-page PDF with field name (or coordinates), NDVI trend chart, health status, stress alerts, and NDVI explanation
- Uses jsPDF — chart captured from canvas, composed as A4 document

### 7.4 NDWI water index ✅ Complete
- Toggle button in slider panel switches between NDVI (vegetation) and NDWI (water index)
- NDWI uses Sentinel-2 bands B3/B8 with blue/brown palette
- Dashboard field statuses update per active index (Healthy/Moderate/Stressed for NDVI; Water/Moist/Dry for NDWI)
- Works with all features: compare, export, preset locations, click-to-inspect

---

## Product Pivot Features (added during development)

### Feature A — Draw & save fields ✅ Complete
- leaflet-draw integration (polygon + rectangle tools in map toolbar)
- Live area tooltip while drawing (`showArea: true`, metric in hectares)
- Fields saved to `localStorage` as GeoJSON via `crypto.randomUUID()` keys
- Field area (hectares) computed via turf.js and cached at save time
- Optional planting date captured at save time for growth-stage-aware health assessment
- `saveField()`, `deleteField()`, `getSavedFields()`, `loadField()` CRUD
- Clicking a saved field: loads polygon, fits map bounds, recomputes NDVI for that geometry
- NDVI functions refactored to accept optional `ee.Geometry` parameter
- Edit/delete toolbar buttons only visible when `drawnItems` has layers (field loaded or just drawn)

### Feature B — Dashboard ✅ Complete
- ☰ toggle button opens 280px left sidebar listing saved fields
- Each field card: name + area in hectares + live health badge (🟢 Healthy / 🟡 Below expected / 🔴 Stressed)
- 📅 button on each card to set/change planting date after save
- Area computed via turf.js geodesic calculation from saved GeoJSON, cached at save time
- Backward-compatible fallback for pre-patch fields
- Status computed via `reduceRegion` over the field polygon for the most recent month
- Click card to load field; hover ✕ to delete

### Feature C — PNG export ✅ Complete
- "Export PNG" button in info panel header
- Downloads `canvas.toDataURL('image/png')` from Chart.js chart

### Feature D — Growth-Stage-Aware Thresholds ✅ Complete
- `RICE_GROWTH_STAGES` table: 6-stage rice phenology curve (Transplanting → Harvest/Senescence) with expected NDVI ranges per stage
- `buildStatusText()` compares actual NDVI against stage-expected range when planting date is known
- Flat threshold fallback when planting date is unknown (backward-compatible)
- Dashboard shows e.g. `🟡 Below expected — Tillering, Day 24 (NDVI 0.31)` instead of flat `🔴 Stressed`
- Stage boundaries easily tunable — only one table to update with real agronomy data later

### Feature E — UI Redesign ✅ Complete
- `.panel` base class with consistent styling across slider panel, info panel, and dashboard
- Segmented 3-way toggle (NDVI / NDWI / LSWI) replacing old two-state button
- Compare checkbox switch replacing ON/OFF button
- Export dropdown (PNG / PDF) with outside-click-to-close
- `.status-toast` fading notification replacing old status bar
- Restyled field cards with individual badge, stage label, NDVI value, and edit/delete buttons
- Tabler Icons (`@tabler/icons-webfont`) for iconography
- `buildStatusObject()` returns structured `{ badgeClass, badgeText, stageLabel }` instead of HTML string
- `updateFieldStatus()` sets badge, stage, and NDVI value on individual card elements by ID

### Feature F — LSWI Third Index ✅ Complete
- Added `LSWI_VIS` config and `lswi` entry in `INDICES` (bands B8/B11, palette tan→lightblue→darkblue)
- 3-way segmented control selects between NDVI, NDWI, LSWI
- Dashboard status displays LSWI value without health vocabulary (no badge classes beyond neutral `.status-lswi`)
- `.status-lswi` CSS style (light blue badge background)
- Shares the same toggle/tile-swap mechanism as existing indices

### Feature G — CHIRPS Rainfall Context ✅ Complete
- `getRainfallMm()` queries `UCSB-CHG/CHIRPS/DAILY` over a trailing 21-day window, sums precipitation at 5km resolution
- Wired into `checkStress()` — when a >15% NDVI drop is detected, rainfall for the same window is fetched via `evaluate()`
- Stress alert text appends contextual note: "only Xmm rain — drought stress is plausible" or "Xmm rain — low rainfall likely isn't the cause"
- Phrased as context, not diagnosis (per spec: correlation, not causation)

### Area recalculation on edit ✅ Complete
- `map.on(L.Draw.Event.EDITED)` now recalculates `field.areaHectares` via `getFieldAreaHectares()` before saving to localStorage
- Field card area updates immediately after shape edit

### Feature H — UI-managed preset locations ✅ Complete
- Preset locations defined in `PRESETS` array, rendered dynamically by `renderPresets()`
- Pencil icon next to "Jump to:" opens an editor overlay
- Editor shows all presets with editable name, lat, lng, zoom fields and delete button
- "Add current view" captures live map center + zoom as a new preset
- "Reset defaults" restores the original four locations
- All changes persisted to `localStorage` under `ndvi_presets`

### Feature J — AOI editor (UI-managed bounding box) ✅ Complete
- `const AOI_COORDS` replaced with `var aoiCoords` loaded from `localStorage` key `ndvi_aoi`
- Map icon button in slider panel opens AOI editor modal with West/South/East/North inputs
- Red dashed rectangle overlay on map shows current AOI boundary
- Applied/reset triggers `fetchDryMonths()` and `loadNdviForMonth()` to recompute with new geometry
- Reset defaults restores the cement-factory box `[102.985, 12.845, 103.048, 12.898]`

### Feature K — Satellite basemap toggle ✅ Complete
- Street / Satellite segmented toggle in slider panel `nav-row`
- Esri World Imagery (free, no API key) as satellite option
- Swaps base layer on both main and compare (right) map simultaneously
- NDVI/NDWI/LSWI overlay remains independent on top

### Feature M — Field deselection ✅ Complete
- Clicking an already-selected field card in the dashboard deselects it
- `clearFieldSelection()` clears polygon overlay, resets `currentGeometry` to `null`, and recomputes NDVI over the full AOI
- Map view (center/zoom) stays unchanged on deselection — no unwanted zoom-out
- Active field card is highlighted with blue border via `.field-card.active` CSS class
- Basemap (Street/Satellite) is re-asserted on deselection to prevent Leaflet tile rendering glitches

### Feature L — Place search / geocoder ✅ Complete
- Search bar (text input + Go button) in slider panel `nav-row`
- Uses Nominatim (OpenStreetMap free geocoding API)
- Enter key or button click triggers `searchPlace()` which calls `map.setView([lat, lon], 16)`
- Toast on no results or network failure — does not crash the app

### AOI refined to cement factory area ✅ Complete
- AOI changed from wide Battambang box `[103.10, 12.95, 103.25, 13.05]` to cement factory `[102.985, 12.845, 103.048, 12.898]`
- Leaflet map center/zoom updated to `[12.8715, 103.0165], zoom 14`
- Right map center/zoom updated to match
- Presets updated to cement factory area
- `.clip(geom)` added after `.median()` in `getIndexImage()` to restrict computation to AOI
- Legacy Vue component (`src/components/MapView.vue`) updated to match

### Feature I — CHIRPS auto dry-month markers ✅ Complete
- `fetchDryMonths()` queries `UCSB-CHG/CHIRPS/DAILY` for each month individually, flags months below 50mm total precipitation
- Dry months rendered as a second row of striped amber markers below the hand-placed event markers
- Runs once after EE initialization, re-renders both left and right slider markers when all results arrive
- Complements existing hand-placed flood/drought markers without replacing them

---

## OAuth setup (Google Cloud Console)
- **OAuth 2.0 Client ID**: Web application type
- **Client ID**: `355514869488-q3v52vvkb7c3gikr0og89o26m51ev403.apps.googleusercontent.com`
- **Authorized JavaScript origins**: `http://localhost:5173` (Vite), `http://localhost:3000` (serve), `http://localhost:60822` (serve dynamic)
- Token persisted via `localStorage` — single sign-in survives page reloads

## Tech stack (current)

| Layer | Tool |
|---|---|---|
| Frontend | Plain HTML/CSS/JS |
| Map | Leaflet + OpenStreetMap tiles / Esri World Imagery |
| Satellite compute | Google Earth Engine (JS client via CDN `<script>` tag, v1.7.36) |
| Auth | Earth Engine OAuth popup (`ee.data.authenticateViaOauth`) |
| Geocoding | Nominatim (OpenStreetMap free API) |
| Drawing | leaflet-draw (v1.0.4) |
| Area calc | turf.js (v6) |
| Charts | Chart.js (v4.4.7) |
| Storage | localStorage (fields, auth token, AOI coords) |

## Status

All phases complete. The app is feature-stable with NDVI/NDWI/LSWI analysis, time slider, draw & save fields, dashboard with growth-stage-aware health badges, compare mode, PNG/PDF export, event overlays, CHIRPS rainfall context on stress alerts, preset locations, UI-managed preset/AOI editors, area recalculation on edit, satellite basemap toggle, place search, and a help panel.
