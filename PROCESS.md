# NDVI Rice Crop Health Monitor — Build Process

## Project goal
A single-page web app that shows a satellite map of rice-growing areas in Battambang, Cambodia, colored by NDVI (vegetation health). Visitors can drag a time slider to see health change over a season and click any spot for a mini trend chart + stress alert. No visitor login — developer authenticates once.

---

## Phase 1 — Foundations ✅ Complete
- Tested NDVI computation in the **Earth Engine Code Editor** (`code.earthengine.google.com`)
- Defined AOI: `ee.Geometry.Rectangle([103.10, 12.95, 103.25, 13.05])`
- Loaded Sentinel-2 imagery, computed NDVI, verified the green/red overlay over Battambang rice paddies
- Cloud Project ID: **`ee-mengtong2025`**

## Phase 2 — App scaffold ✅ Complete
- Created Vue 3 + Vite project with `npm create vite@latest ndvi-monitor -- --template vue`
- Added Leaflet (`npm install leaflet`) for the map (free, no API key needed)
- Set up full-screen Leaflet map centered on Battambang (13.05, 103.175, zoom 11)
- OpenStreetMap base tiles as the background layer
- App structure:
  - `src/App.vue` — root, renders MapView
  - `src/components/MapView.vue` — map + auth + NDVI logic

## Phase 3 — NDVI on the map 🟡 In progress (blocked)
- NDVI computation code is written and ready in `computeAndShowNdvi()`:
  - Filter Sentinel-2 images by AOI, date range, cloud cover
  - Compute NDVI via `normalizedDifference(['B8', 'B4'])`
  - Style with red → yellow → green palette
  - Call `getMap()` to get a tile URL for Leaflet
- **Blocker: OAuth authentication** — Earth Engine requires the user (developer) to authenticate via Google OAuth before it serves tiles

## OAuth setup (Google Cloud Console)
- **OAuth 2.0 Client ID created**: Web application type
- **Authorized JavaScript origins**: `http://localhost:5173`
- Client ID is used in `MapView.vue` for the OAuth popup flow

## Earth Engine client library
Two approaches tried:

1. **CDN script tag** (first attempt) — `earthengine-api.min.js` from Google's CDN
   - Problem: Old script uses deprecated `gapi.auth` flow that no longer works
   - Required `gapi.load('client:auth2', ...)` which is being phased out

2. **npm package** `@google/earthengine` (current approach) — imported as ES module
   - Combined with `https://accounts.google.com/gsi/client` for Google Identity Services
   - Auth flow: `ee.data.authenticateViaOauth(CLIENT_ID, success, error, null, null, true)`
   - Currently hitting a **permissions/consent screen issue** on the OAuth flow

## Current auth flow in MapView.vue

```
onMounted → initMap() + set status to 'auth' (show sign-in button)
user clicks sign-in → authenticate()
  → ee.data.authenticateViaOauth(CLIENT_ID, onSuccess, onError)
    → onSuccess: ee.initialize(null, null, computeNdvi, onError, null, PROJECT_ID)
      → computeNdvi(): get NDVI tile URL → L.tileLayer → add to map
```

## Tech stack (current)

| Layer | Tool |
|---|---|
| Frontend | Vue 3 + Vite |
| Map | Leaflet + OpenStreetMap tiles |
| Satellite compute | Google Earth Engine (JS client via npm + CDN) |
| Auth | Google Identity Services (GIS) |
| Charts | Not yet added |

## What's next

1. **Fix OAuth** — resolve the Google consent screen/permissions issue so auth succeeds
2. **Render NDVI layer** — once auth works, the `computeAndShowNdvi()` function will display the green/red overlay
3. **Phase 4** — Month time slider to switch between months
4. **Phase 5** — Click-to-inspect with NDVI trend chart (Chart.js)
5. **Phase 6** — Polish: preset locations, loading states, explanation panel
