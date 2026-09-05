# NDVI Rice Monitor — Code Base

Technical reference for the **Ceres** NDVI rice-crop health monitor: the Vue 3 +
Vite frontend under `src/` **and** the Supabase Edge Functions under `supabase/`.
This document explains what every file does, how data flows through the app and
the backend, and the coding patterns used. It complements
`NDVI_Master_Roadmap.md` (the project plan) and `NDVI_Project_Brief.md` (the
product overview) by describing the *actual code*.

> **Frontend (`src/`):** sections 1–13 below. **Backend (`supabase/`):** the
> "14. Supabase backend" section at the end.

---

## 1. Architecture at a glance

```
src/
├── main.js               Entry point (createApp + router)
├── App.vue               Root component (RouterView + CheckoutModal)
├── router/index.js       Vue Router routes + auth guards
├── config.js             Central constants / index definitions / palettes
├── style.css             Single CSS entry that @imports every stylesheet
│
├── store.js              ★ The heart: reactive global state + ALL app logic
│
├── services/             Pure logic modules (no Vue components)
│   ├── earthEngine.js       Client for the ee-data Supabase Edge Function
│   ├── supabase.js          Supabase client + CRUD + auth + billing
│   ├── format.js            EN/KM formatting helpers (dates, digits ...)
│   ├── chart.js             Chart.js trend-chart config builder
│   ├── healthZone.js        Health-zone color ramp + threshold helpers
│   ├── weatherService.js    Open-Meteo 5-day forecast (cached)
│   ├── aimScoreCache.js     Client cache for the AIM composite health score
│   ├── crops.js             Khmer/English crop-name normalization + known crops
│   └── geocode.js           Nominatim reverse-geocode (centroid → place name), cached
│
├── views/                Route-level pages
│   ├── MapView.vue          ★ The main map application page (/map)
│   ├── LandingPage.vue      Marketing landing page (/)
│   ├── PricingPage.vue      Public pricing page (/pricing)
│   ├── BillingRedirect.vue  ABA Pay return handler (/billing)
│   └── LandingPage_old.vue  Legacy landing page (kept for reference)
│
├── components/           UI components (mostly tied to MapView)
├── components/landing-page/  Landing-page-specific components
│
├── i18n/                 Bilingual dictionary (EN/KM)
│   ├── index.js             translate()/useI18n() helpers
│   ├── en.js                English strings (keyed like 'field.rainfall')
│   └── km.js                Khmer strings (same keys)
│
├── data/landing-indices.js  Static index data for the landing page
└── styles/               One CSS file per feature area (imported by style.css)
```

**Key architectural facts:**
- **No client-side Earth Engine.** All satellite computation goes through the
  `ee-data` Supabase Edge Function (service-account auth). The browser sends EE
  "actions" with the user's Supabase JWT and receives ready-to-render tile URLs /
  time-series. `services/earthEngine.js` is a thin HTTP client for that function.
- **One big reactive store.** `store.js` holds *all* shared state and *all*
  business logic as exported functions. Components import `state` (the reactive
  object) and the named functions, and read/write `state.*` directly. There is
  no Pinia/Vuex — the store is a plain `reactive()` object.
- **EE-vs-Everything-else coupling.** Because all functions live in one module,
  `store.js` is the single import point for most components (`import * as store
  from '../store'`).

---

## 2. Entry point & routing

### `src/main.js`
The minimal Vue bootstrap:
```js
createApp(App).use(router).mount('#app')
```
Imports `./style.css` (which itself `@import`s every stylesheet in `styles/`).

### `src/router/index.js`
Four routes:
| Path | Name | Component |
|------|------|-----------|
| `/` | `landing` | `LandingPage.vue` |
| `/map` | `map` | `MapView.vue` |
| `/pricing` | `pricing` | `PricingPage.vue` |
| `/billing` | `billing` | `BillingRedirect.vue` |

`router.beforeEach` guard logic (also mutates store state):
- Signed-in user on `/` → redirect to `/map`.
- Signed-out visitor on `/` → force `state.landingVisible = true` (so a past
  onboarding run can't leave a blank page).
- Signed-out visitor on `/map` → open `state.authOverlayVisible = true`.

### `src/App.vue`
Just `<RouterView />` plus the `CheckoutModal` (rendered at the root so it can
appear on any route).

---

## 3. `config.js` — central constants & definitions

Pure data module (no logic that runs at import except `buildMonths()`). Each
indices/mode definition drives legend, tooltips, palettes, and the `ee-data`
bands:

- **Endpoint constants** — `EE_DATA_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
  `CONSULT_AI_URL`, `TELEGRAM_BOT_USERNAME`.
- **Default geometry** — `DEFAULT_AOI` (cement-factory box), `MAP_CENTER`,
  `MAP_ZOOM`.
- **`VIS` palettes** — `NDVI_VIS`, `NDWI_VIS`, `LSWI_VIS`, `SAVI_VIS`,
  `EVI_VIS`, `GNDVI_VIS`, `RVI_VIS`, `TRUE_COLOR_VIS`.
- **`TRUE_COLOR`** — the photo mode definition (deliberately NOT in `INDICES`
  because trend math does `.normalizedDifference()` over `bands`).
- **`INDICES`** — the 8 modes: `ndvi/ndwi/lswi/savi/evi/gndvi/rvi` (+ separate
  truecolor). Each has `name, bands, vis, label, color, full/fullKhm, explain/explainKhm`.
- **Zone buckets** — `NDVI_ZONE_BUCKETS` and `RVI_ZONE_BUCKETS` (10 pixel ranges),
  `ZONE_SCALE`, `FLAT_THRESHOLDS`, `STAGE_DEFICIT_BAD`. **RVI buckets span 0–2**
  (not 0–1): `RVI = 4·VH/(VV+VH)` is bounded [0, 4] and reads ~2 at dense canopy,
  so `RVI_VIS = {min:0, max:2}` and `RVI_ZONE_BUCKETS` divide 0–2 into ten 0.2-wide
  buckets. `RVI_VIS` must stay in sync with `ee-data`'s `VIS.rvi` (legend/marker,
  chart y-axis, and the server tile all derive from these).
- **`MONTHS` / `buildMonths()`** — rolling 14-month window (current month back 13).
- **`RICE_GROWTH_STAGES`** — the 6-stage rice phenology table (maxDay → stage + min/max NDVI).
- **`GENERIC_GROWTH_STAGES`** — the fallback vegetative cycle (`Vegetative` /
  `Flowering / Fruiting` / `Mature`) used for any field whose crop isn't rice.
- **`EVENTS` / `EVENT_COLORS`** — hand-placed flood/drought markers.
- **`SEASON_PRESETS`** — date-range presets for the slider demo.
- **`DEFAULT_PRESETS`** — saved map-location presets.

---

## 4. `store.js` — the heart of the app

`store.js` exports two big things used everywhere:

1. **`state`** — a `reactive({...})` object holding all runtime UI/data state.
2. **`mapReg`** — a plain (non-reactive) object holding Leaflet map instances
   and layers. Leaflet objects must NOT be proxied by Vue, so they live here.
3. **`currentGeometry`** — a `shallowRef` holding the active `ee.Geometry`
   (the selected field's polygon or null).
4. **`fieldStatus`** / **`fieldTrends`** — reactive maps keyed by field id
   (dashboard statuses + sparkline trend series).
5. **~40 exported functions** implementing all the application logic.

### 4.1 Key `state` fields (grouped)

**Session / identity**
- `eeReady` (signed in to Supabase — the single gate for map loads)
- `supabaseUser`, `authOverlayVisible`
- `preferredLanguage` ('en' | 'km')
- `subscription` `{tier, status, source, renewsAt, maxAois, maxHectares, consultAiEnabled}`
- `telegramChatId`, `telegramLinking`

**Map / index**
- `currentIndex` (active band), `currentBase` ('street'|'satellite')
- `mainMonth`, `rightMonth` (indices into `MONTHS`)
- `compareMode`, `currentGeometry` (via shallowRef)
- `sceneCount {main,right}`, `cloudBlock {main,right}`, `radarFallback {main,right}`
- `latestView` + `latestViewLoading`
- `trueColorDate` / `trueColorDateRight`, `trueColorScenes` / `...Right`
- `selectedObservationDate`, `displayedObservationDate`
- `selectedSceneStatus` — server answer for the **exact** pinned observation date
  (`{mode: 'optical'|'radar'|'no_data', ndviValue?, rviValue?, stage?, confidence?}`),
  populated by `fetchSelectedSceneStatus()`; `null` when no scene is pinned or the
  fetch hasn't resolved.

**AOI / fields / presets**
- `aoiCoords`, `aoiPolygon`, `aois[]`, `selectedAoiId`
- `fields[]`, `currentFieldId`, `currentFieldName`
- `presets[]`, `dryMonthSet`

**Chart / detail panel**
- `chartData`, `ndviChartData`, `chartIndex`, `chartSubtitle`
- `chartModalVisible`, `infoPanelVisible`
- `stressAlert`, `rainfallMm`, `benchmarkValue`
- `photosLightboxIndex`
- `healthZone {visible, loading, view, buckets, totalAreaSqm, monthKey, err}`

**UI / controls**
- `loading`, `statusState`, `statusText`, `toasts[]`
- `isDrawing`, `editingFieldId`
- `helpVisible`, `presetEditorVisible`, `aoiEditorVisible`, `settingsVisible`
- `telegramModalVisible`
- `paywall {visible, reason}`, `checkoutTier`
- `landingVisible`
- `rangeStart`, `rangeEnd`, `rangePresetId`, `rangeMonths`
- `aoiPolygonDraft`, `aoiDraftCoords`, `aoiEditMode`, `isAoiDraw`
- `observationsVisible`, `observationsLoading`, `observations[]`

### 4.2 Main exported functions (grouped by concern)

**Helpers**
- `setStatus(s, text)`, `showToast(msg)`, `isAuthError(err)`, `handleAuthError(err)`
- `getGeometry()`, `getFieldAreaHectares()`, `formatHectares()`, `getOrComputeArea()`, `getAreaWarning()`
- `getGrowthStage(days, field)` — stage lookup, crop-aware: uses `GENERIC_GROWTH_STAGES`
  when the field has a non-rice `cropEnglish`, otherwise `RICE_GROWTH_STAGES`.

**Auth / session**
- `beginSessionWork()` / `endSessionWork()` — toggle `eeReady` and kick off map load + background work
- `showAuthOverlay()` / `hideAuthOverlay()`, `dismissLanding()`, `signOut()`
- `signInWithSupabaseGoogle()`, `signInWithEmailPassword()`, `signUpWithEmail()`
- `onAuthStateChange` listener (module top-level) — loads fields/AOIs/telegram/subscription, handles sign-out cleanup, token refresh.

**AOI (areas)**
- `getAois()`, `selectAoi(id)`, `loadAoisFromSupabase()`, `createAoi()`, `updateAoi()`, `deleteAoi()`
- `applyAoiBounds()`, `applyAoiPolygon()`, `updateAoiRectangle()`, `updateAoiViewport()`, `clearAoiPolygon()`
- AOI draw helpers: `startAoiDraw()`, `cancelAoiDraw()`, `onAoiRectangleCreated()`, `getAoiWorkingPolygon()`, `setAoiPolygonDraft()`, `clearAoiPolygonDraft()`, `saveAoiPolygon()`

**Telegram**
- `loadTelegramChatId()`, `connectTelegram()` (generates short-lived code + deep link), `disconnectTelegram()`, `openTelegramModal()`/`closeTelegramModal()`

**Subscription / billing**
- `loadSubscription()`, `refreshPlanState()` (re-read plan + refetch fields/AOIs after plan switch), `getTotalFieldHectares()`
- `showPaywall(reason)`/`hidePaywall()`, `openPlanBillingModal()`/`closePlanBillingModal()`, `openCheckout()`/`closeCheckout()`, `cancelMySubscription()`, `formatDateLong()`

**Presets / basemap**
- `loadPresets()`, `savePresets()`, `flyToPreset()`, `savePresetList()`, `resetPresets()`
- `setBaseLayer(type)`

**Index / map layers**
- `loadIndexForMonth(idx, geometry)` — main map. Branches on the `ee-data`
  response `mode`: `error` / `radar_fallback` / `radar_index` / `cloud_blocked` /
  `no_data` / normal. Also handles True Color mode separately.
- `loadIndexForMonthRight(idx)` — compare-view twin.
- `jumpToToday()`, `jumpToLastValidReading(side)`, `showLatestView()`, `setTrueColorDate()`,
  `setIndex(index)` — switch band and refresh all surfaces.

**Date-range scoping**
- `applyDateRange(startISO, endISO, presetId)`, `clearDateRange()`, `setRangePreset(id)`,
  `applyRangeFromUrl()`, `sliderBounds()`, `activeMonths()` — filter every date-driven surface.

**Observations**
- `fetchObservations()`, `resetObservations()`, `jumpToObservationDate(dateStr)`,
  `pickLowestCloud()`, `resolveActiveObservation()`
- `fetchSelectedSceneStatus()` — Scene-anchored sidebar fix. `jumpToObservationDate`
  calls it so the sidebar grades **that exact date** (clean optical → Sentinel-1
  RVI → honest `no_data`) instead of `resolveActiveObservation`, which reads only
  the optical `chartData` and silently re-anchors a cloud-blocked scene to a
  different clear date. Guarded by a `selectedSceneStatusReq` counter so a newer
  click clobbers a slow earlier response; cleared in `loadField`/`clearFieldSelection`.


**Dry months / health zone**
- `fetchDryMonths()`, `fetchHealthZone(force)`

**Chart data / stress**
- `loadChartForPoint(lat,lng,index)`, `loadChartForGeometry(geometry,index,label)`,
  `reloadChartForIndex()`, `checkStress(data,lat,lng,index)`, `getStageAtDate(date)`

**Fields CRUD**
- `saveField(name, geojson, plantingDate, cropRaw)` (with LSWI auto-planting detection),
  `updateField()`, `deleteField()`, `loadField(field)`, `loadFieldById(id)`
- `importLocalFieldsIfAny()`, `loadFieldsFromSupabase()`
- Field edit: `startFieldEdit()`, `endFieldEdit()`, `cancelFieldEdit()`
- `clearFieldSelection()`, `loadFieldTrend()`, `loadRainfall()`, `loadBenchmark()`
- Crop name: `promptCrop()`/`submitCrop()`/`cancelCrop()` (drives `CropPickerModal`,
  free text in Khmer/English), `cropPicker` state
- `fieldLocationName(field)` — derives the location label **on demand** from the
  field's geojson (centroid → Nominatim reverse-geocode, cached+queued); never persisted

**Dashboard statuses**
- `buildStatusObject(field, value, index, asOfDate)` — growth-stage-aware badge
- `refreshAllFieldStatuses()` / `refreshAllFieldTrends()` — batched EE calls (1 request for all fields)
- `updateFieldStatus(field)`, `applyFieldStyle()`, `fieldConfidence()`, `viewConfidence()`, `getConfidenceTier()`

**Drawing / map events**
- `startDraw()`, `cancelDraw()`, `promptSaveField()`, `promptDate()`/`submitDate()`/`cancelDate()`
- `onFieldCreated(layer)`, `onFieldEdited()`, `updateDrawEditVisibility()`

**Locate / search / export**
- `locate()`, `searchPlace(query)`, `exportChart()`, `exportPdf()`, `eventForMonth(idx)`

### 4.3 Caching patterns
- `chartCache` (a `Map` with a 15-min TTL) — trend-chart results, keyed by
  `subject|index|range`. `invalidateChartCacheForField()` clears a field's cached
  series when its geometry is edited.
- `allStatusSig` / `allTrendsSig` — dedup keys so the heavy all-fields EE batches
  don't re-run on every range change.
- `observationsFieldId` / `observationsRangeKey` — avoid refetching observations
  for the same field+range.
- `cloudToastShown` — surface the cloud-blocked toast only once per session.
- `lastLoadedUserId` — prevents re-running field/AOI loads on `SIGNED_IN` events
  fired on every tab focus.
- `deferIdle(fn)` — push non-critical work (dry months, field statuses/trends) to
  idle time so the map load wins.

### 4.4 Async + auth flow
Every `ee-data` / Supabase call ultimately goes through `requireSession()`
(see §5), which auto-refreshes a stale access token. Store functions generally
use callbacks (`ee.getX(..., cb)`) rather than promises for EE, but they return
Promises for Supabase CRUD.

---

## 5. Services (`services/`)

### `services/supabase.js`
Creates the Supabase client `sb` (`@supabase/supabase-js`) and exposes:
- **Auth** — `signInWithGoogle`, `signInWithEmailPassword`, `signUpWithEmail`, `signOut`
- **Session** — `requireSession()` (returns a valid session, refreshing the token
  if near expiry; throws with a friendly message if signed out).
- **Fields** — `loadFields`, `insertField`, `updateField`, `deleteField`,
  plus `fieldCentroid(geojson)` (turf centroid for weather) and `mapRowToField`.
- **AOIs** — `loadAois`, `insertAoi`, `updateAoi`, `deleteAoi`.
- **Profile** — `getMyProfile()` (telegram_chat_id, preferred_language, subscription_*),
  `clearTelegramChatId()`, `setPreferredLanguage()`.
- **Telegram linking** — `insertLinkCode(code, userId, expiresAt)`.
- **Billing** — `startAbaCheckout(tier)` (initiate-payment Edge Function →
  QR/deeplink), `waitForPayment(tranId)` (polls `payment_transactions`),
  `cancelSubscription()` (RPC), `loadBillingEvents()`.
- **Photos** — `loadFieldPhotos(fieldId)`, `createSignedPhotoUrl(storagePath)`.

### `services/earthEngine.js`
Thin client for the `ee-data` Edge Function. The central `callEE(action, payload)`
does a POST to `EE_DATA_URL` with the caller's Supabase JWT, returning the JSON
body (throwing on non-`ok` or `ok === false`).

Geometry constructors (plain GeoJSON — no `window.ee`):
- `rectGeometry([w,s,e,n])`, `polygonGeometry(coords)`, `pointGeometry(lng,lat)`

`dedupeLowestCloud(points)` — collapses same-day duplicate Sentinel-2 orbits to
the least-cloudy scene (used by most return paths).

EE actions (each maps to an `ee-data` server handler):
| Function | action | Purpose |
|----------|--------|---------|
| `loadIndexTile` | `getIndexTile` | Monthly index tile URL (NDVI/NDWI/LSWI/SAVI/EVI/GNDVI/RVI), with `sceneDate` pinning. Modes: normal / `cloud_blocked` / `radar_index` / `radar_fallback` / `no_data` / `error`. |
| `loadTrueColor` | `getTrueColorScene` | Single S2 RGB scene + scene list for the date picker. |
| `loadLatestTrueColor` | `getLatestTrueColor` | Most recent S2 pass as photo (independent of slider). |
| `getZoneBreakdown` | `getZoneBreakdown` | Area per 10 value buckets for `ndvi`/`rvi`. |
| `getIndexTimeSeries(+ForGeometry)` | `getIndexTimeSeries` | Per-scene optical time series (deduped). |
| `getRviTimeSeries(+ForGeometry)` | `getRviTimeSeries` | Sentinel-1 radar series (NOT deduped — ascending+descending passes). |
| `detectPlantingDate` | `detectPlantingDate` | LSWI spike → estimated planting date (or null). |
| `getDryMonths` | `getDryMonths` | Months with <50mm CHIRPS rain. |
| `getRecentIndexValue` | `getRecentIndexValue` | One-shot recent reading + cloudBlocked flag. |
| `getFieldBundle` | `getFieldBundle` | ONE request combining tile + NDVI trend + chart trend + rainfall + benchmark. |
| `getFieldHealthScore` | `getFieldHealthScore` | AIM composite 0-100 score. |
| `getFieldStatus` | `getFieldStatus` | Scene-anchored status for the **exact** pinned date: `mode 'optical'` (clean scene + `ndviValue`) / `'radar'` (Sentinel-1 RVI within ±15d + `rviValue`) / `'no_data'`. Signature `getFieldStatus(geometry, plantingDate, sceneDate, cb, forceRadar, index)` — `forceRadar` (sent on the RVI tab) makes radar the explicit ask, skipping the optical check; `index` makes the radar fallback **NDVI-only** (non-NDVI tabs return honest `no_data` instead of a radar proxy). |
| `getAllFieldStatuses` | `getAllFieldStatuses` | Recent status for ALL fields (1 batch). |
| `getAllFieldTrends` | `getAllFieldTrends` | NDVI trend for ALL fields (1 batch). |
| `getRainfallMm` | `getRainfall` | 21-day CHIRPS rainfall mm. |
| `getObservations` | `getObservations` | Browse full S2 collection (cloud/status per scene). |

### `services/format.js`
EN/KM formatting helpers used across components: `toKhmerDigits`,
`khmerMonthName`, `formatMonthYear`, `monthAxisLabel`, `formatTooltipDate`,
`stageName`, `statusLabel`, `futurePlantingText`, `noReadingText`,
`daySinceLabel`, `observationCount`, `benchmarkLabel`, `confReason`,
`formatDate`, `isSameMonth`.

### `services/chart.js`
Builds and renders Chart.js trend charts: `buildChartConfig(ctx, data, index,
large, getStageLabel, benchmarkValue)`, month-tick thinning (`buildMonthTicks`),
year label (`buildYearLabel`), a `currentDateMarkerPlugin` (dashed vertical line),
and `hexToRgba`.

### `services/healthZone.js`
Health-zone math: `clamp01`, `makeTicks`, `tickLeft`, `rampColor` (NDVI vs RVI
color ramps), `bucketSwatchColor`, `zoneThresholds(state, view)` (good/bad
boundaries — growth-stage-aware for NDVI, flat 0.3/0.6 otherwise).

### `services/weatherService.js`
`getWeatherContext(lat, lng)` — 5-day Open-Meteo forecast (max/min temp + rain
probability), cached 15-min per location. Display-only today.

### `services/aimScoreCache.js`
`getAimCache(field, month)` / `setAimCache(...)` — client cache for the AIM
score (5-day TTL), keyed by `field.id | plantingDate | year-month` so editing the
planting date or scrubbing months forces a fresh score.

### `services/crops.js`
Crop-name handling: `normalizeCrop(raw)` trims case/whitespace, and the `CROP_MAP`
maps common Khmer names (ស្រូវ, ស្វាយ, ចេក, ដំឡូងមី ...) to their English
equivalents so "rice" / "ស្រូវ" both store as `crop_english: "rice"` and
downstream growing logic picks rice vs the generic cycle.

### `services/geocode.js`
`reverseGeocode(lat, lng)` — Nominatim reverse-geocoder behind
`store.fieldLocationName()` so Consult AI can name *where* the field is (district /
commune) without storing a column. Cached per rounded coordinate and queued so
bursts of field switches don't hammer the endpoint.

---

## 6. Views (`views/`)

### `MapView.vue` (the main app page)
Template composes the entire app: `TopBar`, `LeafletMap`, loading overlay,
`TimeControl`, `MapLegend`, `HealthZonePanel`, a left `CollapsibleDrawer`+`Sidebar`,
a right `CollapsibleDrawer`+`FieldDetailPanel`, a `CollapsibleBottomSheet`
with `ObservationsPanel` + `BandPanel`, the status toast, and all modals
(`PresetEditor`, `AoiEditor`, `HelpModal`, `ChartModal`, `AuthOverlay`,
`DatePickerModal`, `TelegramModal`, `SettingsModal`, `PaywallModal`) plus the
`SpotlightTutorial` and the toast stack.

Script responsibilities:
- Lottie "satellite" spinner tied to `state.loading`.
- `state.statusText` auto-clear after 2.5s when status is `ready`.
- Escape-key cancels active field/AOI drawing.
- `applyRangeFromUrl()` on mount (restores `?start=&end=`).
- Watches `observationsVisible`/`currentFieldId` to fetch/reset observations.

### `LandingPage.vue` (marketing page)
Full-screen landing with hero, sections, `IndexSection` components, `PricingCards`.
Reads `state.landingVisible` / `preferredLanguage`; toggles language; calls
`dismissLanding()`; auto-redirects if a session exists.

### `PricingPage.vue`
Standalone `/pricing` route: header + `PricingCards` grid + language toggle.

### `BillingRedirect.vue`
Handles ABA Pay return query params (`?status=success|cancelled`), refreshes
plan state, shows a toast, redirects to `/map` or `/pricing`.

### `LandingPage_old.vue`
Legacy landing page (Three.js globe, simulated dashboard) kept for reference.

---

## 7. Components (`components/`)

Most components read/write `store.state` directly and call exported store
functions (the app has no per-component state management layer beyond local
`ref`s).

**Core map / panels**
- `LeafletMap.vue` — Creates the main Leaflet map (OSM/Esri basemap, leaflet-draw
  toolbar). Handles map click (`onMapClick`), draw-created/edited events
  (`onFieldCreated`/`onFieldEdited` → VOID to AOI when `isAoiDraw`). Builds the
  compare split map (`map-right`) + draggable divider. Stores everything in `mapReg`.
- `BandPanel.vue` — 8-mode segmented index switcher (`setIndex`), Latest Satellite
  View button, True Color scene picker, base-layer toggle, areas dropdown
  (select/edit/delete AOI, "+ New area" → `startAoiDraw`), and the `IndexLegend`.
- `TimeControl.vue` — 14-month time slider(s) with debounced `loadIndexForMonth`,
  play/autoplay, Latest and Today buttons, event/dry-month markers, scene-count
  pills, cloud-blocked / radar fallback pills, confidence badge (compare view),
  date-range presets.
- `MapLegend.vue` — Legend for the current index + confidence badge.
- `HealthZonePanel.vue` — Floating Health Zone panel (desktop card / mobile
  bottom sheet) with toggle; uses `HealthZoneScaleBar` + `HealthZoneZoneList`.

**Drawers / containers**
- `CollapsibleDrawer.vue` — Reusable left/right sliding drawer (`v-model`,
  `position`, `width`, `noHeader`, slots). Exposes `open/close/toggle`.
- `CollapsibleBottomSheet.vue` — Reusable bottom sheet (`v-model`, `maxHeight`).
- `Sidebar.vue` — "Monitored Fields" list: search, filter tabs, field cards
  (name, crop, area, status badge, sparkline, confidence), planting-date edit,
  field edit, delete, and a `ti ti-leaf` "Set crop" button that opens
  `CropPickerModal`. Triggers `loadFieldById` / `clearFieldSelection`.
- `FieldDetailPanel.vue` — The rich right-drawer panel for the selected field:
  AIM score card, hero card (value + status + confidence), growth-stage card,
  stress alert, Consult AI, trend chart, rainfall, weather forecast, metadata,
  photos. Drives most of the chart rendering and Consult AI calls.
  - `activeObservation` checks `state.selectedSceneStatus` **first** for a pinned
    date (optical → radar → honest no-data) before falling back to
    `resolveActiveObservation(state.chartData, ...)`. Radar readings are never
    graded as NDVI (`monthStatus` returns null on an optical tab) and always
    labeled "RVI". A `radarSceneNote` ("showing Sentinel-1 radar (RVI) for this
    exact date") replaces the cross-date fallback note when the server resolves a
    radar mode, so `isObsFallback` stops firing for a real same-date radar read.
- `ObservationsPanel.vue` — Day-strip of per-scene satellite passes (cloud icons,
  NDVI, status) that jumps the map to a date (`jumpToObservationDate`).

**Buttons / badges / tools**
- `ConfidenceBadge.vue` — 🟢🟡🔴 badge (`tier`, `reason`, `showReason`).
- `IndexLegend.vue` — Index scale legend with optional current-value marker.
- `Tooltip.vue` — Generic hover/tap tooltip wrapper (`text`, `position`).

**Modals**
- `AuthOverlay.vue` — Sign in card (Google / email-password tabs), language toggle.
- `AoiEditor.vue` — Create/edit AOI: name + polygon editing on map, area readout,
  place search via Nominatim.
- `PresetEditor.vue` — Manage map-location presets (add current view, edit, delete, reset).
- `DatePickerModal.vue` — Planting-date picker (stores to `datePicker`).
- `CropPickerModal.vue` — Free-text crop entry (Khmer or English placeholder
  "rice, mango, ស្រូវ...") writing `crop_name`/`crop_english` via `store.cropPicker`.
  Sets the stage table used for the field (rice vs generic vegetative cycle).
- `TelegramModal.vue` — 3-state Telegram linking flow.
- `HelpModal.vue` — Onboarding tour + reference guide (bilingual).
- `ChartModal.vue` — Large trend-chart modal (enlarge chart).
- `SettingsModal.vue` — "Plan & billing": tier, usage bars, payment history, upgrade/cancel.
- `PaywallModal.vue` — Upgrade upsell when hitting AOI/hectare/AI limits.
- `CheckoutModal.vue` — ABA Pay checkout (KHQR QR + deeplinks + polling).
- `SpotlightTutorial.vue` — First-time 7-step spotlight walkthrough (localStorage).

**Landing page (`components/landing-page/`)**
- `CompareSlider.vue` — Before/after image compare slider (clipPath + pointer events).
- `IndexSection.vue` — Per-index landing card (description, formula, CompareSlider, scale bar).

---

## 8. i18n & localization

- `i18n/index.js` — `translate(key, vars)` resolves a key against EN/KM dicts
  based on `state.preferredLanguage`, with `{var}` substitution; `useI18n()`
  returns `{ t, lang }` (a `t` function + computed `lang`).
- `i18n/en.js` / `i18n/km.js` — dictionaries keyed by dotted strings
  (e.g. `'field.rainfall'`, `'band.tip_ndvi'`). Both are 632 lines and must stay
  key-aligned.
- Language changes flow through `store.setLanguage()` → writes
  `profiles.preferred_language` in Supabase and updates `state.preferredLanguage`.
- Many format helpers also take a `lang` param and render Khmer digits/months
  (`format.js`, `healthZone.js`).

---

## 9. Data (`data/`)

- `data/landing-indices.js` — Static array describing the 6 landing-page indices
  (key, name, full name, formula, description, gradient colors, scale labels,
  before/after image assets imported from `assets/landing-assets/`).

---

## 10. Styles (`style.css` + `styles/`)

`style.css` is a pure import manifest that `@import`s every stylesheet in
`styles/`. Organization:
- **Framework/base** — `reset.css`, `design-tokens.css`, `dark-base.css`, `map-layout.css`, `leaflet-theme.css`.
- **Components** — `topbar.css`, `sidebar.css`, `field-detail.css`, `band-panel.css`,
  `time-control.css`, `legend.css`, `confidence-badge.css`, `drawer.css`, `toast.css`.
- **Modals/flows** — `auth.css`/`subtractions` `dark-auth.css`, `dark-modals.css`,
  `aoi-editor.css`, `telegram.css`, `help.css`, `date-picker.css`, `onboarding.css`, `aim.css`.
- **Legacy** — `legacy-slider-panel.css`, `legacy-dashboard.css`,
  `legacy-info-panel.css`, `legacy-user-menu.css`, `legacy-responsive.css`.
- **Responsive** — `responsive.css`, `stage2-responsive.css`.
- Plus `panel-base.css`, `health-zones.css`, `photos.css`, `settings-dropdown.css`,
  `map-loading.css`, `dark-*.css` variants, `preset.css`, `dark-preset.css`, `dark-user-menu.css`, `dark-misc.css`, `dark-dashboard.css`, `dark-info-panel.css`, `dark-modal-forms.css`, `auth-forms.css`.

> Note: There are `legacy-*` and `dark-*` variants alongside newer files. This is
> a sign the app has been re-themed (dark "satellite dashboard" design system) but
> older stylesheets were kept. When editing styles, prefer the current
> `dark-*`/named files and check for duplicate selectors before touching a
> `legacy-*` file.

---

## 11. Coding conventions & patterns

1. **Global reactive store, not Pinia.** Import `state` and call exported
   functions. Mutate `state.x` directly.
2. **`import * as store from '../store'`** is the standard import idiom in
   components (plus destructured names where convenient).
3. **EE via callbacks, Supabase via promises.** `earthEngine.js` functions take a
   callback as their last argument; `supabase.js` CRUD returns Promises and throws
   on error.
4. **Auth is always required.** Both `requireSession()` (Supabase) and every
   `callEE` post assume a valid JWT; `isAuthError`/`handleAuthError` catch sign-in
   expiry and reopen the auth overlay.
5. **Bilingual strings.** Almost all user-facing text goes through `t('key')`
   (from `useI18n()`) or a `lang`-aware format helper. Never hardcode UI text in
   English when a key exists.
6. **Dedup heavy queries.** Trend charts, observations, all-field statuses/trends,
   AIM scores all guard against redundant Earth Engine calls via Map caches or
   signature comparisons, because EE compute is metered.
7. **One tile layer, reuse via `setUrl`.** `applyTileLayer`/`applyTrueColorLayer`
   reuse the existing Leaflet layer and swap the URL to avoid flicker/re-download.
8. **Modes are decided server-side.** `loadIndexTile` returns a `mode`
   (`index`/`cloud_blocked`/`radar_fallback`/`radar_index`/`no_data`/`error`) and
   `store.js` branches on it — the browser never re-derives cloud/radar state itself.
9. **No code comments requirement:** existing code is heavily commented; new code
   should match the explanatory-comment style where it clarifies intent, but avoid
   noise.

---

## 12. Data-flow walkthrough (common paths)

**Sign-in → map render:**
`AuthOverlay` → `store.signInWithSupabaseGoogle()` → supabase-js emits
`SIGNED_IN` → `onAuthStateChange` handler sets `state.supabaseUser`, calls
`beginSessionWork()` (sets `eeReady`, loads the current month tile via
`loadIndexForMonth`) and deferred background (`fetchDryMonths`,
`refreshAllFieldStatuses`, `refreshAllFieldTrends`), plus
`loadFieldsFromSupabase()`, `loadAoisFromSupabase()`, `loadTelegramChatId()`,
`loadSubscription()`.

**Scrub the time slider:**
`TimeControl.onMainSlider` → sets `mainMonth` (debounced 300ms) →
`store.loadIndexForMonth(idx)` → `earthEngine.loadIndexTile` (posts
`getIndexTile` to `ee-data`) → callback branches on `mode`, applies a tile layer
to `mapReg.ndviLayer`, updates `sceneCount`/`cloudBlock`/`radarFallback`, sets
status text. The FieldDetailPanel's `activeObservation` computed re-reads
`state.chartData` so the hero value/growth stage follow the new month.

**Click a specific observation (fix-fallback):**
`ObservationsPanel` → `store.jumpToObservationDate(dateStr)` → sets
`mainMonth`/`selectedObservationDate` → calls `fetchSelectedSceneStatus()` (posts
`getFieldStatus` with a `sceneDate` to `ee-data`) **and** `loadIndexForMonth`. The
server answers `{mode}` for that exact date; `FieldDetailPanel.activeObservation`
takes that over the optical `chartData`, so a 97%-cloud date now shows its real
Sentinel-1 RVI reading (with a `radarSceneNote`) instead of silently falling back
to a different clear date's optical value. On the **RVI tab** `fetchSelectedSceneStatus`
sends `forceRadar`, so the hero shows an actual radar RVI number for that date even
when a clean optical scene exists; the map tile likewise gets a per-scene
`radar_index` (see §14.3). Switching tabs with a date already pinned re-runs this
via `setIndex`.

**Select a field:**
`Sidebar.onCardClick` → `store.loadFieldById` → `loadField(field)` → draws the
GeoJSON on the map, sets `currentGeometry`, calls `ee.getFieldBundle` (one
request → tile + trends + rainfall + benchmark), populates `fieldTrends`,
`chartData`, `rainfallMm`, `benchmarkValue`.

**Draw + save a field:**
`LeafletMap` `draw:created` → `onFieldCreated(layer)` → `promptSaveField` →
`saveField(name, geojson, date, cropRaw)` (optional LSWI auto-planting detection,
then a crop prompt — free text, rice/generic stage table chosen by
`normalizeCrop`) → `supabase.insertField` → push to `state.fields` →
`loadFieldTrend`. Map taps during drawing are ignored by `onMapClick`
(`state.isDrawing`), so the detail drawer never pops open mid-draw.

**Consult AI:**
`FieldDetailPanel.consultAi` → gather reading values + rainfall pattern
(`rainfallBuckets`), `lastClearReading`, observation history, growth stage,
confidence tier, `source/mode/reason/age`, crop + live-reverse-geocoded location
→ POST to `CONSULT_AI_URL` with JWT → show explanation.

**Download chart/PDF:**
`store.exportChart()` (canvas→PNG) / `store.exportPdf()` (jsPDF + chart canvas).

---

## 13. Notes / gotchas for future work

- **`state.eeReady` means "Supabase-signed-in"**, not "EE is ready" — there is no
  client-side EE anymore. Don't reintroduce the EE OAuth flow.
- **`mapReg` is intentionally non-reactive.** Don't put Leaflet objects into
  `state`; use `mapReg`.
- **`state.chartData` is band-specific** while `state.ndviChartData` is the
  NDVI-anchored optical series used for band-independent growth-stage dates. Keep
  them distinct.
- **RVI (radar) data is never deduped by date** and never feeds the band-independent
  growth-stage anchor.
- **RVI is 0–2, not 0–1.** `RVI = 4·VH/(VV+VH)` is bounded [0, 4] and dense canopy
  reads ~1–2, so every RVI display surface must use `RVI_VIS.max` (2), not a
  hardcoded 1: `chart.js` y-axis, `IndexLegend` marker, and the health-zone
  swatches (`healthZone.viewMax`). Never grade an RVI value through NDVI's 0–1
  healthy/stressed thresholds.
- **The date-range (`?start=&end=`) scoping reuses the same month-index machinery.**
  `activeMonths()`/`sliderBounds()` are the canonical filters.
- **Pending backend deploys** (from the roadmap) don't affect the frontend build:
  the app already targets migrations `008`–`014`. UI-only caps exist for hectares
  (server enforcement is a `TODO(backend)`).

---

# Part B — Supabase Backend (`supabase/`)

Everything under `supabase/` is **Deno**-based Supabase Edge Functions plus the
local config. There is **no queue/worker infra** here beyond an HTTP-driven
scheduled function, and **no SQL migration files** in this folder (migrations
live in the Supabase dashboard / a separate `migrations/` location).

```
supabase/
├── config.toml                      Project id + per-function JWT flags
├── .temp/                           Local CLI state (ignored; not real config)
├── functions/
│   ├── _shared/                     Reusable helpers imported by functions
│   │   ├── cloudMask.ts             Pixel-level S2 cloud/shadow masking + validity
│   │   ├── cors.ts
│   │   ├── discrepancy.ts
│   │   ├── growthStage.ts
│   │   ├── indexTranslations.ts
│   │   ├── llm.ts
│   │   ├── primaryIndex.ts
│   │   └── weather.ts
│   ├── ee-data/                     ★ The interactive-map Earth Engine proxy
│   ├── ee-alerts-worker/            Scheduled Telegram stress-alert worker
│   ├── consult-ai/                  "Consult AI" explainer (Gemini/DeepSeek/Qwen)
│   ├── telegram-webhook/            Telegram bot: /start linking + photo uploads
│   ├── trigger-alerts-worker/       Test-only relay that invokes ee-alerts-worker
│   ├── initiate-payment/            ABA PayWay KHQR purchase (server-side)
│   ├── aba-payway-webhook/          ABA server callback (HMAC-verified)
│   ├── simulate-payment/            DEV-ONLY fake approval (sandbox guard)
│   └── ee-spike/                    Throwaway Deno/EE proof-of-concept (obsolete)
```

**Key backend facts:**
- **Run on Deno**, using `npm:`-prefixed imports (e.g. `npm:@google/earthengine`,
  `npm:@supabase/supabase-js`). No build step / bundler.
- **`.ts` is the deployed source of truth.** `supabase functions deploy` uploads
  `index.ts` and bundles `_shared/*.ts` (confirmed in deploy output). Hand-kept
  transpiled `.js` mirrors exist next to several functions (`ee-data`,
  `consult-ai`, `ee-alerts-worker`, `_shared/*.js`) — they should stay in sync
  with the `.ts` for anyone reading them, but are **not** what the deploy runs.
- **Secrets** come from `Deno.env.get(...)`, set once via
  `supabase secrets set` (never committed). Key secrets across functions:
  `EE_SERVICE_ACCOUNT_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (auto-injected),
  `GEMINI_API_KEY`, `DEEPSEEK_API_KEY`, `QWEN_API_KEY`, `TELEGRAM_BOT_TOKEN`,
  `ABA_MERCHANT_ID`, `ABA_API_KEY`, `APP_URL`, `APP_URLS`.
- **Two auth models:** most functions rely on the platform gateway's JWT
  verification (`verify_jwt = true`, the default) so the user's identity is
  available via `supabase.auth.getUser(authHeader)`. The two webhooks
  (`telegram-webhook`, `aba-payway-webhook`) set `verify_jwt = false` and
  authenticate **themselves** (bot-initiated vs. HMAC-signed callbacks).
- **All DB access uses `service_role`** (bypasses RLS). Functions are trusted
  server contexts; per-field access is enforced with explicit `owner_id` /
  user-id filters in code rather than RLS policies.
- **Single source of truth is repeatedly enforced** — shared modules exist so
  growth-stage thresholds, index translations, weather access, and the LLM
  fallback chain never drift between `ee-data` and `ee-alerts-worker`.

---

## 14.1 `config.toml` + auth model

```toml
project_id = "wopwwtnvqyomiwbsxiks"

[functions.telegram-webhook]
verify_jwt = false

[functions.aba-payway-webhook]
verify_jwt = false
```

- `project_id` is the Supabase project ref.
- Only the two **server-to-server** functions opt out of JWT verification.
  Everything else (including `ee-data`, `ee-alerts-worker` when invoked by
  `trigger-alerts-worker`) is behind the platform's JWT gateway.

---

## 14.2 Shared helpers (`_shared/`)

These are ES-module files imported by multiple functions (relative imports like
`../_shared/growthStage.ts`). None of them run as standalone functions.

### `_shared/cors.ts`
- Reads allowed origins from the `APP_URLS` env var (comma-separated).
- `getCorsHeaders(req)` echoes the request origin if it's allow-listed,
  otherwise falls back to the first allowed origin (or `*`). `allowedOrigins` is
  also exported for callers that want the raw list.
- Standard headers for `authorization`, `x-client-info`, `apikey`,
  `content-type` and GET/POST/OPTIONS methods.

### `_shared/cloudMask.ts`
- **Cloud-resilience core** (pixel-level Sentinel-2 cloud/shadow masking) — imported
  by `ee-data`. `CLOUD_RESILIENCE` holds the configurable defaults
  (s2cloudless probability threshold 55 %, 300 m cloud-edge buffer, invalid SCL
  classes, `MIN_VALID_PIXEL_FRACTION`, clear-scene counts for confidence, optical
  composite windows).
- `addCloudProbability(collection, ee)` — joins each S2_SR granule to its
  s2cloudless `probability` band by `system:index`. **Reduces the lookup with
  `sum()` (a linear reducer), not `.first()`** — a missing probability granule
  yields an image of zeros instead of a server-side null, which would make
  `Image.select` throw "input required" inside the map.
- `validPixelMask(scene, ee)` — 0/1 mask per scene: probability > threshold, SCL
  invalid classes, a focal-cloud-edge buffer, and no-SR-data pixels.
- `validPixelFraction(image, band, geometry, scale, ee, evaluate)` — field-level
  fraction of valid (non-NaN) pixels over the geometry, 0..1 or null.

### `_shared/growthStage.ts`
- Home of `RICE_GROWTH_STAGES` (rice name + maxDay + ndvi min/max per stage),
  `GENERIC_GROWTH_STAGES` (Vegetative / Flowering-Fruiting / Mature) and
  `stageForDay(day, useGeneric = false)`.
- `statusFromNdvi(ndvi, plantingDate, useGeneric = false)` → `{ status, stage }`.
  With no planting date it uses flat thresholds; with a date it computes
  days-since-planting, finds the stage (rice table or generic cycle per
  `useGeneric`), and compares NDVI against that stage's minimum to yield
  `healthy` / `below_expected` / `stressed`.
- **Shared by `ee-data`, `ee-alerts-worker`, and consult-ai's water-need table**
  so their health classification is identical. Non-rice fields pass
  `useGeneric = true` (client derives it from `crop_english`).

### `_shared/indexTranslations.ts`
- The server-side **plain-language translation layer** for raw index values
  ("AIM" feature): every index gets the same 4-band verdict
  (`dead` / `unhealthy` / `moderate` / `healthy`) with thresholds as quartiles
  of that index's own VIS range.
- `INDEX_BANDS` holds per-index band arrays (ndvi, ndwi, lswi, savi, evi, gndvi,
  plus a `composite` 0–100 version). Each band carries a `phraseKey` (resolved
  to i18n text by the frontend) and an English `phrase` fallback.
- `translateIndexValue(index, value)` returns `{ label, phraseKey, phrase }`.

### `_shared/primaryIndex.ts`
- **Growth-stage-aware index selection** (AIM feature 2/3). NDVI is unreliable
  on bare soil / newly flooded paddy, so:
  - `primaryIndexForStage(stage)` → `"savi"` for `Germination`/`Seedling`,
    `"ndvi"` otherwise (the "headline" index shown as the badge).
  - `primaryIndexReasonKey(stage)` → an i18n key explaining *why* the index
    switched (or null when it's just ndvi).
  - `healthScoreWeights(stage)` → the index blend for the composite score:
    early `{ savi: 0.6, lswi: 0.4 }`, later `{ ndvi: 0.6, lswi: 0.3, evi: 0.1 }`.
  - `stageNameForDayCount(dayCount)` → stage name via `growthStage.ts`.
- Weights are a **sensible default, not a scientifically tuned model** (flagged
  in a comment to revisit with real field outcomes).

### `_shared/discrepancy.ts`
- **Guided comparison, AIM feature 4.** Surfaces a genuine disagreement when the
  headline index reads healthy/moderate but the blended composite score is
  meaningfully lower (usually a weak secondary index).
- `detectDiscrepancy(raw, ctx)` returns a `Discrepancy` (`{ messageKey,
  message }`) or null. Rules are explicit: e.g. canopy healthy (NDVI ≥ 0.5) but
  soil moisture low (LSWI < 0.15) → "consider irrigation"; or composite poor
  while a secondary index drags it down. Keyed by i18n keys, `message` is the
  English fallback.

### `_shared/llm.ts`
- **Shared LLM provider-fallback orchestrator** (Phase 13 Feature 1), used by
  both `consult-ai` and `ee-alerts-worker`.
- Each provider caller (`callGemini`, `callDeepSeek`, `callQwen`) returns a
  `ProviderResult` (`{ text, truncated, finishReason }`) or null, **never
  throws** — so one provider's outage/quote never blocks the caller.
- `generateExplanation(prompt, concisePrompt?)` tries the providers in order
  (Gemini → DeepSeek → Qwen), retrying the same provider with a hard-trimmed
  "be concise" prompt if the first pass hit the output-token ceiling
  (`truncated`). Returns `{ text, model, truncated }` or null.
- `languageLine(lang)` returns an instruction to reply in simple Khmer or
  English. All have 20 s timeouts via `AbortController`.

### `_shared/weather.ts`
- Shared **Open-Meteo** weather-forecast access for the backend worker. Returns
  a `WeatherContext` (5-day forecast with rain %, max/min temp + convenience
  rollups) or null, **never throws**. Caches per rounded centroid for a 15 min
  TTL. Mirrors the frontend's forecast window so the panel display and Telegram
  advisories never drift.

---

## 14.3 `functions/ee-data/` — Earth Engine proxy (the biggest function)

This is the **backend twin of `services/earthEngine.js`**. The browser never
talks to Earth Engine directly; every interactive map EE call posts here with an
`action` field, and the function authenticates with the `EE_SERVICE_ACCOUNT_KEY`
service account, computes, and returns tile URLs / time-series / readings.

- **Auth:** `verify_jwt` default (true) → any signed-in app user may call it;
  anonymous callers are rejected by the gateway.
- **Index/band config** mirrors the frontend `INDICES` in `config.js`: `BANDS`
  (which S2 bands per index), `VIS` (min/max/palette per index), `TRUE_COLOR_*`
  for RGB, and `DRY_MONTH_THRESHOLD`. **`VIS.rvi = {min:0, max:2}`** (RVI is
  4·VH/(VV+VH), bounded [0,4], ~2 at dense canopy) — used by the radar tile
  (`getRadarVegetationIndex`) and `zoneBuckets('rvi')`, which divides 0→2 into ten
  0.2 buckets so dense-canopy pixels no longer fall outside every bucket while
  still counting toward `totalAreaSqm`. Must stay in sync with the frontend
  `RVI_VIS`. RVI is **not** in `healthScoreWeights()`, so this range affects
  visualization only (see §14.10).
- **`applyIndex(img, index, name)`** is the single place index math lives
  (NDVI/NDWI/LSWI/GNDVI via `normalizedDifference`, SAVI/EVI via custom
  expressions). All actions that compute an index route through it.
- **`buildMaskedComposite(geom, start, end, index)`** is the cloud-resilience
  optical composite builder: pixel-cloud/shadow-masks each scene
  (via `_shared/cloudMask.ts`), takes a robust median over *valid* pixels only,
  and returns `{ img, clearSceneCount, validFraction, compositeStart, compositeEnd }`
  — replacing the old `CLOUDY_PIXEL_PERCENTAGE < 40` scene-level filter on all
  optical reads (map tiles, per-scene status). Missing s2cloudless granules can't
  crash it (the `sum()` lookup in `addCloudProbability` degrades to a zero band).
- **`initEE()` / `ensureEE()`:** the EE session is cached per warm isolate and
  re-authenticated before the ~1 h service-account token expires
  (`EE_INIT_TTL_MS = 45 min`). Failures aren't cached so the next request
  retries auth.
- **Cost-control caching** (the "ee-cost-control" directive) uses service_role
  writes to three tables:
  - **`ee_tile_cache`** (per `index, year, month, geometry_hash` **\+ `mode`**):
    drives `getIndexTile`, TTL'd (12 h closed month / 20 min open month) because the
    signed tile URL lapses. The `mode` column (`optical` / `radar_fallback` /
    `cloud_blocked` / `no_data`) keeps cloud-dependent modes from serving each
    other's tiles; per-scene (`sceneDate`) requests bypass the cache entirely.
  - **`ee_observation_cache`** (per `field_id, scene_date`, permanent): drives
    `getObservations` — only scenes newer than the newest cached one are fetched
    from EE.
  - **`ee_trend_cache`** (per `field_id, index, year, month`): drives
    `getAllFieldTrends`; closed months are `is_closed_period = true` and served
    permanently (~93% EE reduction). The open month is overwritten each call.

### Supported actions (the `HANDLERS` router)
| Action | Purpose |
|---|---|
| `getIndexTile` | Monthly index composite tile, with the full cloud policy: clean optical → Sentinel-1 RVI radar fallback → 90-day widened true-color fallback. Supports a per-scene date. On the **RVI tab**, `sceneDate` returns a per-scene `radar_index` (Sentinel-1 window centered on that exact date, month cache bypassed) instead of the month's RVI composite. |
| `getTrueColorScene` | Single-scene RGB photo + full scene list for the date picker (clouds un-masked by design). |
| `getLatestTrueColor` | Most recent S2 pass within a lookback window as true color. |
| `getZoneBreakdown` | Buckets every pixel of the month's NDVI (or RVI) image into 10 ranges → area per bucket in one batched `reduceRegion`. |
| `getIndexTimeSeries` | Optical index time-series over given months (one batched FeatureCollection). |
| `getRviTimeSeries` | Radar Vegetation Index over time from Sentinel-1 (includes orbit direction). |
| `detectPlantingDate` | Steepest dry→flooded LSWI jump over ~90 days to estimate planting date (never a guess). |
| `getDryMonths` | CHIRPS monthly rainfall → which requested months are "dry" (< threshold). |
| `getFieldStatus` | NDVI status using the shared growth-stage logic (14-day window first, widened to 90-day low-confidence). With a `sceneDate` param it becomes **scene-anchored**: answers the exact date with `mode 'optical'` (clean `buildMaskedComposite` scene, `ndviValue`) / `'radar'` (Sentinel-1 RVI within ±15d, `rviValue`) / `'no_data'` (honest — no silent substitution). A `forceRadar` param (the RVI tab) skips the optical clean-scene check and always grades the date by RVI. `payload.index` gates the radar substitution to **NDVI-only** — RVI is a defensible proxy for canopy vigor, not for NDWI/LSWI/SAVI/EVI, so other tabs get an honest `no_data`. |
| `getFieldHealthScore` | **AIM composite (0–100)** — growth-stage-appropriate index blend, each normalized to its own range, weighted average, plus the 4-band verdict and discrepancy (F4). Month-scoped to the scrubbed slider position. |
| `getRecentIndexValue` | Latest ≤90-day clean reading with cloud-blocked flag + plain-language band. |
| `getAllFieldStatuses` | Batched per-field statuses for the field list on login. Uses a **far-past sentinel image** trick to keep `first()` defined even for scene-less fields. |
| `getAllFieldTrends` | Batched per-field 14-month series (fields × months in one graph) with closed-month caching. The heaviest action. |
| `getRainfall` | CHIRPS cumulative precipitation over a window (default 21 days). |
| `getObservations` | Every S2 pass with cloud cover, NDVI, and read-time-derived status (per-scene permanent cache). |
| `getFieldBundle` | **Consolidates** the tile + ndvi trend + current-tab trend + rainfall + benchmark into ONE request (runs them concurrently inside one authenticated isolate). Skips the duplicate ndvi call. |

### Router + timing
`Deno.serve` reads the `action` from the JSON body, dispatches to the handler,
`ensureEE()`s first, and logs per-action duration (`supabase functions logs
ee-data`) so a slow request without a preceding "EE session initialized" line is
computing, not authenticating.

---

## 14.4 `functions/ee-alerts-worker/` — scheduled Telegram stress alerts

The cron worker (invoked on a schedule / daily, posting to its URL) that sends
**Telegram alerts** to farmers whose profiles have a `telegram_chat_id`.

- **Query:** all fields joined to their owner's `telegram_chat_id` and
  `preferred_language`; also selects `crop_english` so the health classification
  matches the crop (non-rice fields pass `useGeneric` to the shared
  `growthStage.ts`).
- **Reading:** `getFieldReading()` → optical NDVI (tight 14-day window, then
  widened 90-day low-confidence), and **only** if optical has nothing in 90 days,
  a Sentinel-1 RVI radar fallback. Emits a `FieldReading` discriminated union
  (`ndvi` / `radar` / `none`).
- **Per-source behavior:**
  - `none` → sends a one-time "can't monitor your field" notice (deduped: only
    on transition into `no_data`, not every run).
  - `radar` → sends a deliberately **hedged** radar message (possible stress vs.
    none), no growth-stage claim, no LLM call; logged as `radar_flag` status so
    it's easy to filter out of accuracy analysis. `RVI_STRESS_THRESHOLD = 0.4` is
    an explicit placeholder pending calibration.
  - `ndvi` → computes status/stage via the shared `growthStage.ts`, pulls
    rainfall (CHIRPS, 21-day), a 5-day weather forecast (shared `weather.ts`),
    LSWI and NDVI-trend %, then **always sends** a message on every run (the
    "only on worsening" dedup was deliberately removed).
- **Advisory text:** the message is generated by the shared LLM fallback
  (`generateExplanation`) using a prompt from `buildAdvisoryPrompt()`; if every
  provider fails (or the answer is truncated), it falls back to a flat template
  (`buildAlertMessage`). Low-confidence (90-day) readings get a "based on older
  data" suffix.
- **Logging:** every attempt inserts a row into `alerts_log` with status,
  ndvi_value, message, chat_id, and whether Telegram accepted it (`telegram_sent`).

---

## 14.5 `functions/consult-ai/` — "Consult AI" explainer

The endpoint behind the frontend's "Consult AI" button.

- Authenticates with the user's JWT (`supabase.auth.getUser`).
- Reads the field's reading values and rich context: `ndviValue` (or `rviValue` —
  whichever the client actually read), `lswiValue`, `rainfallMm` +
  `rainfallBuckets` (3 weekly CHIRPS buckets for the **pattern**),
  `lastClearReading` (the field's last clearly-viewed optical NDVI as an anchor),
  `observationHistory` (capped per-scene series for trend/cloud-gap reasoning),
  `status`, `growthStage`, `dayCount`, a confidence tier/reason, cloud-resilience
  `source`/`mode`/`observationAgeDays`/`reason` metadata, `cropEnglish` +
  `locationName` (field crop + reverse-geocoded place), and `lang`.
- **`WATER_NEED_BY_STAGE`** maps every client growth-stage string (rice stages +
  generic `Vegetative`/`Flowering / Fruiting`/`Mature`) to stage-appropriate water
  advice, so the model connects the rainfall pattern to what the crop needs now.
  Non-rice fields add a `cropNote` telling the model the stage string is from the
  generic vegetative cycle, never paddy management.
- The farmer's stored `preferred_language` wins over the client-sent `lang`.
- **Cache:** reuses the prior `ai_explanations` row only if the reading and status
  haven't meaningfully moved (`ndvi_value` stores whichever reading was used,
  partitioning radar reads via the `"Radar (RVI) reading"` status).
- **Daily cap:** enforces a per-user `DAILY_CAP = 20` via the `ai_usage` table.
- **LLM:** builds a prompt + a concise retry prompt, runs `generateExplanation`,
  caches the result (with `model_used` and `truncated` for auditing), and returns
  `{ explanation, truncated, cached }`. A `USE_EXPLANATION_CACHE` flag (currently
  `false`) bypasses both cache read and write for testing.

---

## 14.6 `functions/telegram-webhook/` — Telegram bot

The bot webhook (`verify_jwt = false`; registered once with
`/setWebhook`). Handles two features:

1. **Account linking (Phase 8.3):** a `/start <code>` message looks up the code
   in `link_codes`, validates expiry/usage, and calls the `redeem_link_code` RPC
   to atomically save the chat id onto the profile (and consume the code).
2. **Ground-truth photo attachments (Phase 13 F2):** when a farmer replies to an
   alert with a photo, it downloads the Telegram file bytes, uploads them to the
   private `field-photos` storage bucket, and links a `field_photos` row to the
   right field + alert.
   - The target field is inferred: the single recently-alerted field, or the
     owner's only field. If ambiguous, it parks the photo in `pending_photo` and
     replies with an inline keyboard; a subsequent `callback_query`
     (`photo:<fieldId>`) resolves it.

---

## 14.7 `functions/trigger-alerts-worker/` + `ee-spike/` (dev helpers)

- **`trigger-alerts-worker`** — a tiny JWT-protected relay for **testing**: it
  forwards its body to `ee-alerts-worker` using the injected `service_role` key,
  so you can trigger the worker on demand without waiting for the cron and
  without exposing the key to the caller.
- **`ee-spike`** — a throwaway Deno spike proving `@google/earthengine` runs in
  Supabase Edge Functions (`ee.Number(1).add(1)`). **Not part of the real path;
  safe to delete.**

---

## 14.8 Payments (`initiate-payment`, `aba-payway-webhook`, `simulate-payment`)

- **`initiate-payment`** — server-side ABA PayWay **KHQR** purchase. The amount
  NEVER comes from the client; it's looked up from `subscription_prices` by tier.
  Builds the exact `Purchase` payload (order matters for the hash), signs it with
  HMAC-SHA512, inserts a `pending` row into `payment_transactions`, POSTs directly
  to ABA, and returns the QR image/string + ABA Mobile deeplink + store links for
  the frontend to display while it polls the transaction.
  - Uses a UTF-8-safe base64 (`utf8ToBase64`) so Khmer/em-dash item names don't
    crash `btoa` (a past bug). The `abapay_khqr` payment option is what makes ABA
    return a QR/deeplink instead of a hosted HTML checkout.
- **`aba-payway-webhook`** — server-to-server callback target (`verify_jwt =
  false`). Authenticates purely by the `X-PAYWAY-HMAC-SHA512` header: reads the
  raw body bytes **before** any parsing, sorts the keys, recomputes the expected
  HMAC signature, and constant-time compares. On mismatch → 401 (payment not
  processed). On success it calls the idempotent `finalize_aba_payment` RPC
  (safe for ABA retries) and returns 200 fast.
- **`simulate-payment`** — **DEV/TESTING ONLY** (flagged to delete before
  launch). Fakes an "approved" callback by calling the same
  `finalize_aba_payment` RPC. **Guardrail:** refuses to run unless
  `ABA_API_BASE_URL` points at a sandbox. It has little auth beyond "is this
  tran_id yours", so it must never ship to production.

---

## 14.9 The database side (referenced, not in this folder)

The functions interact with tables/RPCs managed via SQL migrations (not in
`supabase/`). Key objects referenced by the code:

- **Tables:** `profiles` (telegram_chat_id, preferred_language, billing/tier),
  `fields` (owner_id, geojson, planting_date, centroid_lat/lng), `alerts_log`,
  `ai_explanations`, `ai_usage`, `link_codes`, `pending_photo`, `field_photos`,
  `payment_transactions`, `subscription_prices`, `ee_tile_cache`,
  `ee_observation_cache`, `ee_trend_cache`.
- **Storage bucket:** `field-photos` (private; Telegram-uploaded ground-truth
  photos).
- **RPC functions:** `redeem_link_code` (atomic code redeem), `finalize_aba_payment`
  (idempotent payment finalization that flips tiers and logs `billing_events`).

---

## 14.10 Backend gotchas for future work

- **Don't reintroduce client-side EE (or EE OAuth).** Everything computes through
  `ee-data` with the service-account key.
- **Keep `_shared/` the source of truth.** Growth stages, index bands, weather,
  and LLM fallback are shared precisely so `ee-data` and `ee-alerts-worker` can't
  drift. Add new logic there, not as copies.
- **Caching tables are the cost-control mechanism.** New EE reads should go
  through the cache tables (tile / observation / trend) rather than hitting
  Earth Engine directly, especially from `ee-data`.
- **`verify_jwt` matters.** `ee-data` and `consult-ai` rely on the gateway for
  auth; the two webhooks authenticate themselves (Telegram chat × profile lookup,
  ABA HMAC). Don't turn on JWT for the webhooks (Telegram/ABA can't send JWTs)
  and don't widen `allowedOrigins` without care.
- **Delete `simulate-payment` (and `ee-spike`) before production.** They bypass
  real ABA authorization and are gated only by the sandbox check.
- **The RVI stress threshold (0.4) is a placeholder** until radar is calibrated
  against ground-truthed NDVI; new radar logic should keep this hedge explicit.
- **RVI never feeds the AIM composite score.** `healthScoreWeights()` returns
  only `{savi, lswi}` (early) or `{ndvi, lswi, evi}`, so `normalizeToUnitRange`
  is never called with `"rvi"` and `detectDiscrepancy` never reads `raw.rvi`.
  The RVI range (0–2) therefore only affects visualization (tile, zones, charts,
  legend) — don't add RVI to scoring without calibrating it first.
- **`getFieldStatus` with `sceneDate` is the sidebar's scene-anchored path** (see
  §14.3). Keep its mode logic identical to `getIndexTile`'s per-scene branch
  (clean optical → Sentinel-1 RVI ±15d → honest no_data) so the map tile and the
  sidebar hero never disagree about a clicked date.
