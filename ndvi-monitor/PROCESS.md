# NDVI Rice Crop Health Monitor — Build Process

## Project goal
A single-page web app that shows a satellite map of rice-growing areas in Battambang, Cambodia, colored by NDVI (vegetation health). Visitors can drag a time slider to see health change over a season and click any spot for a mini trend chart + stress alert. No visitor login — developer authenticates once. (Phase 8 adds Supabase-backed field sync with **Google sign-in** for saved fields, plus scheduled Telegram alerts; Phase 11 adds per-user multi-area support; Phase 13 adds cloud-blocked true-color fallback + a unified confidence badge.)

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
- `<input type="range">` dynamically built from 14 months (`buildMonths()` — computes 14 months back from today)
- Debounced 300ms — fires EE request only after user stops dragging
- Loading spinner on slider panel during computation
- Swaps NDVI tile layer on month change
- **Latest button** (↻ icon) jumps to the most recent complete month (skips current in-progress month)
- **Scene count indicator** — cloud-free Sentinel-2 scene count displayed next to month label; amber-colored with ● dot when only 1–2 scenes (lower confidence), gray text for 3+ scenes

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

## Phase 8 — Supabase Backend + Telegram Alerts ✅ Complete (see Part 5 of `NDVI_Master_Roadmap.md`; original doc folded in)

### 8.1 Supabase schema & auth ✅ Complete
- Supabase project: `https://wopwwtnvqyomiwbsxiks.supabase.co`
- Auth via **Google OAuth** — single provider. The email magic-link (and any password) forms were removed; Supabase now uses `sb.auth.signInWithOAuth({ provider: 'google' })` only, kept separate from Earth Engine's own Google OAuth popup
- `schema.sql` defines: `profiles` (extends auth.users), `fields`, `link_codes`, `alerts_log` with row-level security policies
- `fields.owner_id` defaults to `auth.uid()` so client inserts pass RLS; `set_updated_at()` trigger keeps `updated_at` current
- supabase-js (v2) loaded via CDN `<script>` tag; client created as `sbClient` (avoids the UMD global `supabase` collision)
- Auth overlay redesigned to the dark-glass design system: brand icon, Google-logo buttons with per-section captions, ✕ close, "Explore the map first" kept
- Top-right user menu shows signed-in email / sign-out (collapses to an icon + dropdown on mobile); "Sign in to sync fields" affordance when EE is ready but Supabase is not

### 8.2 Migrate app off localStorage ✅ Complete
- Field CRUD now backed by Supabase `fields` table with an in-memory `fieldsCache` mirror
- Same function names, new implementation — minimal blast radius: `saveField()`, `getSavedFields()`, `deleteField()`, `loadField()`, `loadFieldById()`
- New `updateField(id, patch)` handles area recalculation (on shape `EDITED`) and planting-date edits
- `sbClient.auth.onAuthStateChange` loads fields on sign-in and clears them on sign-out
- `updateFieldStatus()` guarded by `eeReady` so dashboard renders before Earth Engine initializes
- One-time import: `importLocalFieldsIfAny()` uploads legacy `ndvi_fields` localStorage to Supabase on first login, then clears it
- Root `.gitignore` added so `.env` (and the future `service_role` key) stays out of git

### 8.3 Telegram bot + account linking ✅ Complete (deployed & user-confirmed)
- Bot webhook = Supabase Edge Function `supabase/functions/telegram-webhook/index.ts` (Deno, `verify_jwt = false`)
- `migration2.sql`: `redeem_link_code()` security-definer RPC (atomic: set `telegram_chat_id` + consume code), guard trigger so users can only clear (not set) their chat id, `cleanup_expired_link_codes()`
- App: prominent **Telegram pill button in the TopBar** (green dot when linked; opens sign-in overlay if not signed in) → `TelegramModal.vue` generates a short-lived code, shows the `t.me/<bot>?start=<code>` deep link, polls `profiles.telegram_chat_id` every 3s until linked, then shows Connected/Disconnect. A "Telegram alerts" entry also lives in the TopBar user menu.
- No manual chat-id field — the bot sets `telegram_chat_id` via the Edge Function (guarded so users can't claim chats they don't own)
- Bot username + link TTL in `src/config.js` (`TELEGRAM_BOT_USERNAME`, `TELEGRAM_LINK_TTL_MS`)
- **Deploy:** run `migration2.sql` → `supabase functions deploy telegram-webhook` → `supabase secrets set TELEGRAM_BOT_TOKEN=...` → Telegram `setWebhook` to the function URL → set `VITE_TELEGRAM_BOT_USERNAME` in `.env` — **all done ✅ (8.6 alert delivered via the linked chat confirms it works end-to-end)**

### 8.4 Earth Engine service account ✅ Complete (verified in Deno)
- Service account created in GCP project `gen-lang-client-0978198347`, granted EE access; JSON key stored as the Supabase Edge Function secret `EE_SERVICE_ACCOUNT_KEY`
- **Verified in Deno** with the throwaway `ee-spike` function: `npm:@google/earthengine@0.1.395` imports and authenticates via `authenticateViaPrivateKey` inside a Supabase Edge Function — clears the key risk that originally motivated the Python plan. `ee-spike` can be deleted.

### 8.5 Scheduled worker ✅ Complete (Supabase pg_cron → Edge Function, user-confirmed working)
- **`supabase/functions/ee-alerts-worker/index.ts`** (Deno): authenticates EE with the service-account key, queries all `fields` whose owner has a `telegram_chat_id` (join through `profiles`), recomputes NDVI (90-day S2 median, B8/B4) + growth-stage-aware status (port of the app's 6-stage thresholds + flat fallback), dedups against the latest `alerts_log.status` (sends Telegram only on a change for the worse, or first non-healthy), writes an `alerts_log` row every run (with message + rainfall context), and sends via Telegram `sendMessage` when warranted. **Part 8 addition:** on `ndvi === null` (no_data / cloud-blocked) it now sends exactly one "We haven't had a clear satellite view …" message on transition INTO `no_data` (`lastStatus !== 'no_data'`).
- **`migration3.sql`**: enables `pg_cron` + `pg_net`, stores the `service_role` key in **Supabase Vault**, schedules `ndvi-alerts-daily` (daily 23:00 UTC = 06:00 Cambodia) to `net.http_post` the worker with a Vault-signed Bearer token
- **Checkpoint:** worker runs and delivers Telegram messages for stressed fields; `alerts_log` rows written every run ✅
- Rest of Phase 8: 8.6 sustained end-to-end dedup validation — **complete ✅** (see below). Full detail in `Backend_Telegram_Roadmap.md`.

### 8.6 End-to-end dedup validation ✅ Complete

- **Contract verified:** `no_data` logs without sending; `healthy→stressed` sends **exactly one** Telegram message; repeated `stressed` runs send nothing (dedup silence).
- **Bugs surfaced & fixed in the worker** (`supabase/functions/ee-alerts-worker/index.ts`):
  - Stored fields are GeoJSON **Features** — the worker now unwraps `geojson.geometry` via `toEeGeometry()` before `ee.Geometry` (was `Invalid GeoJSON geometry`).
  - A 30-day Sentinel-2 window frequently returns zero cloud-free scenes in rainy season → `no_data` every run. Window widened to **90 days**; the `<40` cloud filter is deliberately kept so residual cloud can't bias NDVI into false stress. Empty collections now log `status='no_data'` gracefully instead of crashing on `normalizedDifference` over zero bands.
  - `no_data` added to the worker's `SEVERITY` map (`no_data: -1`) so a no-data→real-status transition is treated as a worsening and alerts (was `2 > undefined === false` → silently skipped sends).
- **Test harness:** `trigger-alerts-worker` Edge Function (relays to the worker with the auto-injected `SUPABASE_SERVICE_ROLE_KEY`, same Bearer the cron uses) + `validation-86.sql` audit queries (cron presence, `msgs_sent == worsening_transitions`, `dup_msgs_on_flat == 0`).

---

## Phase 9 — Vue Migration ✅ Complete

**Goal:** Reorganize the monolithic static app into Vue 3 components for clearer, more maintainable code structure.

**How it's set up (the working app is NOT broken):**
- The stable static app is preserved as **`index_old.html` + `style_old.css` + `app_old.js`** — a fully working fallback. Nothing was deleted.
- The active Vue app lives at root `index.html` + `src/` (Vite + Vue 3, `<script setup>` SFCs).
- **Earth Engine, Leaflet, and leaflet-draw stay on CDN `<script>` tags** — these are UMD/global libs whose bundling breaks or risks breakage under Vite:
  - `@google/earthengine` npm package breaks under Vite's bundler (`Failed to locate function parameters`).
  - `leaflet-draw`'s UMD must extend the global `L`; bundling it with Vite risks it receiving a namespace object instead of the real Leaflet. So Leaflet + leaflet-draw load from `unpkg` like the `_old` app (see comment in `index.html`), and components use the global `L = window.L`.
- Everything else (Vue, Chart.js, turf, jsPDF, supabase-js) is `npm`-imported and bundled normally by Vite.

**Porting approach:**
- Shared state + all app actions centralized in `src/store.js` (Vue `reactive`/`shallowRef`).
- Earth Engine queries in `src/services/earthEngine.js`; Supabase client + field CRUD in `src/services/supabase.js`.
- UI split into SFCs: `App.vue` (root: user menu, ☰ dashboard toggle, toast/status bar, help button), `LeafletMap.vue`, `SliderPanel.vue`, `InfoPanel.vue`, `Dashboard.vue`, `AuthOverlay.vue`, `PresetPanel.vue`, `HelpModal.vue`, `PresetEditor.vue`, `AoiEditor.vue`, `ChartModal.vue`, `DatePickerModal.vue`.
- Styles ported from `style_old.css` → `src/style.css`.

**Status:** ✅ `npm run build` passes, `npm run dev` serves every module with no Vite errors, and the map renders in-browser. **Full end-to-end smoke test complete (user-confirmed):** draw/save field + Supabase sync, compare mode, PNG/PDF export, plus NDVI Trend panel on map click — all behaving identically to `index_old.html`.

**Recent fixes during migration (this session):**
- **Blank map on load** — the Vue app mounts into `#app`, which had no height, so `.map-container`/`#map` (100%) collapsed to 0. Added `#app { height: 100%; width: 100% }` to `src/style.css`.
- **401 Unauthorized on `…/algorithms`** — expired Earth Engine OAuth token. Tokens from the client-side flow last ~1h. `authenticate()` now stamps `issued_at`; `restoreSavedSession()` skips tokens older than `expires_in − 120s`; on init failure the stale token is cleared, the auth overlay is re-shown, and the status bar says "Satellite sign-in expired — please sign in again".
- **Map clicks did nothing / panel never opened** — the full-screen auth overlay (`position: fixed; inset: 0`) was intercepting every click until EE auth completed. Added an **"Explore the map first"** dismiss button on the auth card, made the top-right user menu reopen the sign-in overlay whenever EE isn't ready, and hardened `onMapClick()` so the panel always opens (it shows "Sign in with Google to load … trends" if EE isn't ready).
- **Info panel showed two header buttons** — removed the collapse `>>` button and its `collapsed` state/watcher, keeping only the `×` close button.
- **Leaflet/leaflet-draw moved to CDN** — same UMD/global rationale as EE (see "How it's set up" above). Removed `leaflet` + `leaflet-draw` from npm deps, deleted the unused legacy `src/components/MapView.vue`, and components use the global `L = window.L`.

**Acceptance:** `npm run build` succeeds AND all existing features (NDVI/NDWI/LSWI, time slider + scene count + latest button, click-to-inspect trend chart with gradient fill + date marker + expand modal, draw & save fields synced to Supabase, dashboard with growth-stage badges, compare mode, PNG/PDF export, event overlays, CHIRPS rainfall context, presets/AOI editors, place search, satellite basemap, Google sign-in, help panel) behave identically to `index_old.html`.

---

## Phase 10 — Design System Redesign ✅ Complete (see `design.md`)

**Goal:** Re-skin the Vue app into the dark glass "satellite dashboard" specified in `design.md`
(tokens, layout, components, motion, responsive). Reference prototype: `ndvi-rice-monitor-prototype.html`.
Leaflet/Earth Engine/logic stays untouched — this is presentation + interaction only.

**Approach:** incremental. Stage 1 (foundation + chrome relocation) done; Stage 2 (sidebar + detail
panel rework) complete; polish (motion/toasts/onboarding modal) is Stage 3.

### Stage 1 — Foundation ✅ Complete
- **Design tokens** added in `:root` per spec §2: `--bg-map`, `--panel(-2)`, `--panel-border`, `--text(-dim/-faint)`,
  `--accent` (emerald `#22c98e`), `--amber`, `--red`, `--blue`, radii, `--shadow`, `--ease`.
- **Dark theme** applied across the app: body `#0b0f14`, glass `.panel` (blur 12px), dark modals, dark field cards,
  dark Leaflet controls (zoom, attribution, leaflet-draw toolbar — sprite flipped light for visibility).
- **Fonts:** Inter (UI) + JetBrains Mono (`.mono` data readouts) via Google Fonts in `index.html`.
- **New components:**
  - `TopBar.vue` — brand chip (icon + name + `BATTAMBANG · N monitored fields` mono badge), place search (Nominatim),
    Street/Satellite toggle, Compare toggle, Export dropdown (PNG/PDF), Help, user chip (sign-in/email/sign-out), menu (☰).
  - `TimeControl.vue` — floating top-center panel: play/pause (auto-advance ~900ms, loops), month label + season tag
    (Wet Season (Rainfed) May–Oct / Dry Season (Irrigated) Nov–Apr), scene-count pill (amber-low variant), latest-complete-month
    button, styled scrubber with filled track + event/dry markers + end ticks; second scrubber in Compare mode.
  - `BandPanel.vue` — floating bottom-center: NDVI/NDWI/LSWI segmented · divider · Street/Satellite segmented · AOI edit button,
    plus the index explainer caption line.
  - `MapLegend.vue` — bottom-right gradient bar (red→amber→yellow→green) with mono min/mid/max labels.
- **App.vue rewired:** TopBar/TimeControl/BandPanel/MapLegend added; `SliderPanel.vue` retired (its pieces redistributed);
  floating ☰ toggle and "?" help button removed (now in TopBar); user-menu folded into TopBar; `.map-loading` blur overlay on
  band/date switch (spec §4.7); status toast + transient toast repositioned below the top bar.
- **Z-index per spec §3:** map 0 · legend 25 · top/time/band 30 · info panel 35 · sidebar 40 · toasts 80 · modals 90+.
- **Responsive per spec §5:** ≤1024px legend hidden / panels 280px / brand-loc hidden; ≤780px icon-only pills, brand text hidden,
  info panel becomes bottom sheet; ≤480px tighter; `prefers-reduced-motion` collapses transitions.
- **Verified:** `npm run build` ✅; `npm run dev` serves all modules 200 ✅.

### Stage 2 — Sidebar & Detail Panel ✅ Complete
- Left "Monitored Fields" sidebar: search + All/Healthy/Alerts filter tabs, sparkline field cards, "Draw / Add New Field Boundary"
  footer (replaces current ☰ Dashboard).
- Right detail panel: NDVI hero + benchmark, stress alert, phenology progress, trend vs benchmark (dashed blue), rainfall, metadata
  cards (replaces current InfoPanel).
- **Components & logic:**
  - `Sidebar.vue` (replaces `Dashboard.vue`): search input, All/Healthy/Alerts tabs, per-field SVG sparklines from
    `fieldTrends`, status badges, area/NDVI meta, plant-date + delete buttons, area warning, "Draw / Add New Field Boundary"
    footer → `store.startDraw()` (Leaflet `L.Draw.Polygon` — click points, double-click to finish; toggles to "Cancel drawing (Esc)").
  - `FieldDetailPanel.vue` (replaces `InfoPanel.vue`): field view (NDVI hero vs AOI benchmark, growth-stage bar + day count,
    stress card, trend chart with dashed-blue benchmark line, 21-day rainfall, metadata) and map-click view
    (trend + benchmark + rainfall + existing stress alert). Index switching stays in the BandPanel only (no pills in the chart card).
  - Store additions: `fieldTrends` reactive cache, `rainfallMm` + `benchmarkValue` state, `loadFieldTrend(field)`,
    `loadRainfall`, `loadBenchmark()`, `loadChartForGeometry(geometry, index, label)`, `startDraw()`/`cancelDraw()`,
    `state.isDrawing`, health-coded polygon styling (`STATUS_COLORS` + `applyFieldStyle`), polygon click → reopen detail,
    `setIndex`/`loadField` now load per-field series when a field is active; field trend cache primed on init/login/save.
  - `chart.js`: `buildChartConfig` accepts optional `benchmarkValue` (dashed `#4fa8ff` line + legend toggle); x-axis ticks now
    show month-only labels with the year range rendered as a top-of-chart title (`buildYearLabel`).
  - `style.css`: full Stage 2 block for sidebar + detail panel (glass dark cards, tokens), bottom-sheet mobile behavior.
- **Verified:** `npm run build` ✅; `npm run dev` serves all modules 200 ✅.

### Stage 2 refinements (post-build, this session) ✅
- **Map stacking over header fixed** — `.map-container` had no stacking context, so Leaflet's internal controls/panes
  (z-index 400–1000) painted above the fixed UI. Added `position: relative; z-index: 0` to `.map-container`.
- **Zoom/draw controls blocked by header** — `#map .leaflet-top, #map-right .leaflet-top { top: 64px }` pushes Leaflet's
  top-right controls below the 56px fixed TopBar.
- **Removed the "Jump to:" preset panel** — `PresetPanel.vue` deleted and unregistered from `App.vue`; the preset editor
  (`PresetEditor.vue`), `state.presets`, and `flyToPreset()` stay intact.
- **Toast looks/behaves like a proper toast** — restyled `.toast` to a rounded pill with slide-in animation; fixed it
  stretching to ~full height (base rule's `bottom: 100px` conflicted with `top: 64px` → added `bottom: auto`).
- **Draw UX** — polygon drawing replaces the drag-rectangle; Esc (or clicking the button again) cancels drawing; starting a
  draw while signed out opens the auth overlay + toast instead of drawing.
- **Compare (split-screen) hardened:**
  - Right map was initialized while its `v-show` container was still hidden (watcher ran pre-render) → zero-size dark panel.
    Now created inside `nextTick()` so the container has real dimensions.
  - Maps are decoupled (removed the pan/zoom `syncing` handlers) — each map moves independently; aligned once on open.
  - The center divider is now **draggable** to resize the split (20–80%, live `invalidateSize`); double-click resets to 50/50.
  - **Closing Compare destroys the right map** — `destroyRightMap()` calls `mapRight.remove()`, clears `mapRight`/
    `baseLayerRight`/`ndviLayerRight`, resets `sceneCount.right`; right panel + divider are `v-if` (fully removed from layout),
    and the left map `invalidateSize()`s inside `requestAnimationFrame` after the layout settles. The async EE callback in
    `loadIndexForMonthRight` is null-guarded so a stale response after close can't throw.

### Stage 3 — Polish ✅ Complete
- **Onboarding 4-slide walkthrough** (`HelpModal.vue`): What is NDVI → Reading the color scale →
  How stress alerts work → Time slider & compare; dot progress, Skip/Next/Got it buttons, slide
  fade/slide transition, icon visual per slide, and a "Detailed guide" toggle preserving the full
  reference text. Resets to slide 1 on open; reachable from the Help pill anytime.
- **Toast stack** (`App.vue` + `store.js`): single `state.toast` replaced by `state.toasts` array —
  `showToast(msg, duration?)` pushes and auto-dismisses each (up to 3 visible, oldest dropped),
  rendered top-right as a vertical stack with slide-down/fade enter + exit (`<transition-group>`).
  Legacy `.toast`/`.toast.show` rules removed.
- **Motion timing (spec §4.7):** `.map-loading` overlay now brightens in (~480ms) on band/date switch;
  toast enter/leave animate translateY + fade; hover states across pills/buttons use the shared
  `--ease` curve with `translateY(-1px)`.
- **Event-overlay annotation:** `.event-legend` row under each scrubber labels the Flood (blue),
  Dry spell (amber), and Low rainfall (striped) marker bands with token colors, so the slider
  annotations are self-explanatory.
- **Verified:** `npm run build` ✅; `npm run dev` serves all modules 200 ✅.

---

## Phase 11 — Multi-area support + auth & mobile UX hardening ✅ Complete

**Goal:** Replace the single hardcoded/localStorage AOI with per-user, multi-AOI support backed by Supabase, simplify Supabase auth to Google-only, and fix mobile stacking/overflow regressions.

### Feature P — Multi-area support (per-user AOIs)
- `aois` table (`owner_id`, `name`, `bounds` jsonb, `created_at`), capped at **5 per user** via a DB trigger; nullable `aoi_id` added to `fields` (schema-ready, not wired to the UI yet)
- CRUD mirrors the fields pattern: `getAois()` / `createAoi()` / `updateAoi()` / `deleteAoi()` in `store.js`, backed by `loadAois` / `insertAoi` / `updateAoi` / `deleteAoi` in `src/services/supabase.js`; in-memory `state.aois` mirror
- **"Areas" dropdown** in `BandPanel.vue`: lists saved areas by name (select → recenter + re-clip NDVI/NDWI/LSWI on both maps), trash to delete, "+ New area"
- **New Area modal** (`AoiEditor.vue`): name field + West/South/East/North inputs (prefilled from current area) **or** a Nominatim place search that auto-fills the box from the matched place's bounding box; "Create" → insert + select
- **5-area cap handled in UI**: "+ New area" hidden and the map-icon button gated once 5 areas exist; insert errors matching the limit → toast "Limit of 5 areas reached"
- **Default seed**: on first login with no areas, auto-creates "Battambang (default)" from `[102.985, 12.845, 103.048, 12.898]` so the map is never empty
- `ndvi_aoi` localStorage key removed; `state.aoiCoords` now derives from the selected AOI row via `applyAoiBounds()` (redraws the red dashed rectangle, recenters, recomputes dry months + both maps)
- Help modal updated with an "Areas of interest" section

### UX hardening (this session)
- **Supabase auth → Google-only** — removed the email magic-link input/form/handlers and `signInWithOtp`/`sendMagicLink`; Supabase now uses `sb.auth.signInWithOAuth({ provider: 'google' })` only. Earth Engine's separate Google flow untouched. Removed dead email CSS.
- **Auth overlay redesign** (`AuthOverlay.vue`) — dark-glass card matching the design system: backdrop blur, brand icon, Google-logo buttons with per-section captions, ✕ close, "Explore the map first" kept.
- **Mobile responsive fixes:**
  - TopBar user chip collapses to an icon button + dropdown menu (email truncated with ellipsis, "Sign out" inside the menu) ≤780px — no more horizontal overflow of email/sign-out.
  - `.time-panel` z-index lowered to 25 (below TopBar's 30) so the Export dropdown paints above the time panel instead of being hidden underneath.
  - BandPanel compacted on mobile; ≤480px hides the redundant Street/Satellite segmented (TopBar already has it) so the panel fits 360–414px widths.
- **Verified:** `npm run build` ✅ after every change.

---

## Phase 12 — Consult AI (AI agronomist) + multi-provider LLM fallback ✅ Complete (deployed & verified)

**Goal:** Let a farmer get a plain-language interpretation of a field's satellite health data
(NDVI, LSWI, 21-day rainfall, growth stage) from a server-side LLM — with a resilient
multi-provider fallback chain so a single provider's outage/quota/404 never blocks the feature.

### Consult AI button + Edge Function
- **Frontend** (`src/components/FieldDetailPanel.vue`): "Consult AI" button + response card on
  saved fields. Disabled while the map is loading and when the selected month has no scenes;
  guards on `ndviValue == null` ("No recent satellite data for this field yet…"), not-signed-in,
  EE not ready, and surfaces `429 daily_limit_reached` / `400 missing_data` as toasts.
- **Auth token:** the fetch uses `requireSession()` from `src/services/supabase.js` (which
  auto-refreshes a stale/near-expired access token before returning, the same helper
  `insertField`/`insertAoi` use), wrapped in a try/catch so genuine sign-in failures show a
  friendly toast instead of a rejected request.
- **Edge Function** `supabase/functions/consult-ai/index.ts` (JWT-required, deployed at
  `https://wopwwtnvqyomiwbsxiks.functions.supabase.co/consult-ai`):
  - verifies the user JWT; rejects missing NDVI with `400 missing_data`
  - serves cached explanations from `ai_explanations` when NDVI + status haven't moved (<0.02)
  - enforces a per-user daily cap via `ai_usage.calls_today` (default 20) → `429 daily_limit_reached`
  - CORS from the `APP_URL` secret (fallback `*`) + OPTIONS preflight; `jsonResponse()` merges
    the CORS headers into every response

### Multi-provider fallback (Gemini → DeepSeek → Qwen)
- `generateExplanation(prompt)` orchestrator tries providers in order and returns the first
  usable answer as `{ text, model }`. Each provider caller returns `string | null` and never
  throws (failures are caught internally → `null`) so the chain moves on cleanly. Every call is
  wrapped in a 20s `AbortController` timeout so a hung provider fails over fast:
  - `callGemini` — `gemini-3.5-flash` (`generateContent`); 2.0-flash returned zero quota and
    2.5-flash returned 404 "no longer available" for this API key, so 3.5-flash is the primary.
    Uses `thinkingConfig: { thinkingLevel: "low" }` + `maxOutputTokens: 800` (raised from 500 so
    thinking overhead doesn't truncate the visible answer).
  - `callDeepSeek` — OpenAI-compatible `https://api.deepseek.com/chat/completions`,
    model `deepseek-chat`, `max_tokens: 500`.
  - `callQwen` — DashScope compatible-mode
    `https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions`,
    model `qwen3-max`, `max_tokens: 500`.
- The responding model is stored per row as `ai_explanations.model_used` (`migration6.sql`) and
  logged as "AI explanation served by: …" — for our own auditing only, **never** shown to the
  farmer or included in the API response. Response shape stays `{ ok, explanation, cached }`, and
  the UI keeps the "AI-generated interpretation to guide you — not a diagnosis" framing regardless
  of which provider answered.
- Khmer (`lang: 'km'`) and English prompts are identical across providers.

### Related fixes (this session)
- **Tab-refresh regression:** supabase-js fires `SIGNED_IN` on every tab focus (visibility-change
  session recovery). A `lastLoadedUserId` guard in `src/store.js` now prevents re-running
  `loadFieldsFromSupabase`/`loadAoisFromSupabase` (and the "Reloading NDVI for …" recompute) on
  tab return. Also stops the local-fields `window.confirm` import prompt from reappearing.
- **Rainfall (21-day) card:** shows "Loading…" / "Data unavailable" (dimmer, smaller) instead of
  a bare dash when CHIRPS data can't be fetched.
- RLS/session hardening (`migration5.sql`, `requireSession()`) so field/AOI inserts never hit
  "new row violates row-level security" or expired-token 401s.

### Deploy steps — done ✅
1. `supabase secrets set DEEPSEEK_API_KEY="..."` and `supabase secrets set QWEN_API_KEY="..."` — set
2. Apply `migration6.sql` in the Supabase SQL editor (adds `ai_explanations.model_used`) — applied
3. `supabase functions deploy consult-ai` — deployed
4. Verify: with a bad Gemini key the request falls through to DeepSeek and still returns text;
   `supabase functions logs consult-ai` shows "AI explanation served by: deepseek-chat" — verified

---

## Phase 13 — Cloud-blocked scene fallback (Part A) + unified confidence badge (Part B) 🚧 Built, pending backend deploy

**Goal:** make the map honest during Cambodia's rainy season and make data trust visible. Per spec
`Cloud_Blocked_Scene_Fallback.md`. A month that's too cloudy (≥40% cloud) now shows **true-color
imagery** instead of a misleading NDVI composite, and every place NDVI appears carries a **🟢🟡🔴
confidence badge** computed by a single scoring function so all badges always agree.

### Part A — Cloud-blocked scene fallback
- **Cloud policy unchanged:** `<40` `CLOUDY_PIXEL_PERCENTAGE` = clean → normal NDVI composite;
  `>=40` = cloud-blocked. Threshold deliberately **not** loosened; no per-pixel masking added.
- **`src/services/earthEngine.js`** — `loadIndexTile()` now returns one of three modes:
  `{ mode: 'index', count, url }` / `{ mode: 'cloud_blocked', count: 0, url, cloudPct, lastValidDate, err }`
  (least-cloudy scene rendered true-color via `B4/B3/B2`, `{ min: 0, max: 3000 }`, opacity 1; last
  cloud-free date from a 90-day lookback before the month start) / `{ mode: 'no_data', count: 0, url: null, err: 'none' }`.
  `getRecentIndexValue()` also returns `cloudBlocked` (from the freshest scene's cloud %).
- **`src/store.js`** — `state.cloudBlock = { main, right }`; `loadIndexForMonth()` /
  `loadIndexForMonthRight()` branch on the mode: cloud-blocked swaps in the true-color layer and toasts
  "☁️ Cloud-covered on {month} ({pct}% cloud) — showing true-color image… Last valid reading: {date}".
  Toasts are **silent during Play/autoplay** (new `silent` flag) so the auto-advance loop can't spam.
  `LeafletMap.vue` resets `cloudBlock.right` when Compare closes (`destroyRightMap`).
- **`src/components/TimeControl.vue`** — main month pill becomes a **"☁️ cloud-blocked"** pill (with
  tooltip) when cloud-blocked; the compare scrubber shows its own cloud-blocked pill.

### Part B — Unified confidence badge (Data Trust Layer)
- **`getConfidenceTier(signals)`** in `src/store.js` + `CONFIDENCE_STALE_DAYS = 21`. Tiers (worst
  applicable wins, each with a short reason):
  - 🟢 **High** — clean scene, ≥3 cloud-free scenes, manual planting date.
  - 🟡 **Medium** — 1–2 scenes, or auto-estimated planting date (`planting_date_source = 'estimated'`).
  - 🔴 **Low** — cloud-blocked, 0 scenes, or last valid reading older than 21 days.
- **New `src/components/ConfidenceBadge.vue`** (dot + tier label + optional reason), styled by
  `.conf-badge`/`.conf-high|medium|low` in `src/style.css`.
- **Placement:** map legend (`viewConfidence('main')`), field cards (`fieldConfidence(f)`), field detail
  hero card (with reason), compare scrubber (`viewConfidence('right')`). All use the same scoring
  function. `viewConfidence('main')` prefers the active field's signals (legend/dashboard/detail agree)
  but a cloud-blocked view always dominates → 🔴.
- **Consult AI** (`supabase/functions/consult-ai/index.ts`) now receives `confidenceTier` +
  `confidenceReason`; the prompt hedges explicitly on low/medium tiers.
- **Telegram worker** — one-shot no-data transition message (see 8.5).
- **`migration8.sql`** — `alter table fields add column planting_date_source text not null default
  'manual'` + check constraint `('manual','estimated')`; `src/services/supabase.js` maps/inserts it
  (default `'manual'`), `saveField` passes `'manual'`.

### Deploy — pending
1. Run `migration8.sql` in the Supabase SQL editor
2. `supabase functions deploy consult-ai` (confidence hedging)
3. `supabase functions deploy ee-alerts-worker` (no-data transition alert)
4. `npm run build` — passes ✅ (verified)

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

### Feature J — AOI editor (UI-managed bounding box) ✅ Complete → superseded by Feature P (multi-area, Phase 11)
- `const AOI_COORDS` replaced with `var aoiCoords` loaded from `localStorage` key `ndvi_aoi`
- Map icon button in slider panel opens AOI editor modal with West/South/East/North inputs
- Red dashed rectangle overlay on map shows current AOI boundary
- Applied/reset triggers `fetchDryMonths()` and `loadNdviForMonth()` to recompute with new geometry
- Reset defaults restores the cement-factory box `[102.985, 12.845, 103.048, 12.898]`
- **Note:** as of Phase 11 the single localStorage AOI is replaced by per-user multi-AOI via Supabase (Feature P); the `ndvi_aoi` key is gone and the editor is now the "New area" modal.

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

### Feature N — Scene count indicator ✅ Complete
- Reuses `collection.size()` that was already being fetched for the 0-scene check — no extra EE calls
- `updateSceneCount(count, isRight)` displays count next to month label in both main and compare sliders
- Confidence tiers: 0 scenes (error), 1–2 scenes (amber color + ● dot = low confidence), 3+ scenes (normal gray)
- CSS: `.scene-count` (gray) and `.scene-count-low` (amber `#c97a00`)
- Scene count cleared on slider load to prevent stale values

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
- Access tokens expire after ~1 hour; the app stamps `issued_at`, skips stale tokens on reload, and re-prompts for sign-in when init fails (see Phase 9 notes)

## Tech stack (current)

| Layer | Tool |
|---|---|
| Frontend | Vue 3 (SFC) + Vite (`index.html` + `src/`); legacy fallback in `index_old.html` (plain JS) |
| Map | Leaflet + OpenStreetMap tiles / Esri World Imagery |
| Satellite compute | Google Earth Engine (JS client via CDN `<script>` tag, v1.7.36) |
| Auth | Earth Engine OAuth popup (`ee.data.authenticateViaOauth`) + Supabase Google OAuth |
| Geocoding | Nominatim (OpenStreetMap free API) |
| Drawing | leaflet-draw (v1.0.4) |
| Area calc | turf.js (v6) |
| Charts | Chart.js (v4.4.7) |
| Backend / DB | Supabase (Postgres + Auth, Google OAuth) + pg_cron/pg_net + Vault for the scheduled worker |
| Edge Functions | `consult-ai` (LLM agronomist, multi-provider fallback, confidence-aware hedging), `telegram-webhook` (bot linking), `ee-alerts-worker` (daily stress check + Telegram send + no-data transition alert), `ee-spike` (throwaway Deno EE-import test) |
| Storage | Supabase `fields` + `aois` + `alerts_log` + `ai_explanations` + `ai_usage` tables (primary), localStorage (EE token, presets) |

## Status

All phases are complete. **Phase 8 (backend):** 8.1 (schema + auth), 8.2 (fields migrated off localStorage), 8.3 (Telegram bot + account linking — deployed & user-confirmed), 8.4 (EE service account — verified in Deno), 8.5 (scheduled worker — `ee-alerts-worker` Edge Function + `migration3.sql` pg_cron/Vault daily job), and **8.6 (end-to-end dedup validation — Telegram alert delivered, dedup contract verified, worker bugs fixed)** are done, with 8.3/8.5/8.6 user-confirmed working. **Phase 9 (Vue migration)** is complete — build ✅, dev server ✅, and the full end-to-end smoke test (draw/save field → Supabase, compare mode, PNG/PDF export) is user-confirmed. **Phase 10 (design-system redesign)** is complete — Stage 1 (tokens + dark theme + TopBar/TimeControl/BandPanel/MapLegend), Stage 2 (Monitored-Fields sidebar + field-inspector detail panel, hardened compare mode), and Stage 3 (onboarding 4-slide walkthrough, toast stack, motion timing, event-legend) — build ✅, dev serves ✅. **Phase 11 (multi-area support + auth/mobile hardening)** is complete. **Phase 12 (Consult AI)** is complete and deployed — `consult-ai` Edge Function with Gemini → DeepSeek → Qwen fallback, `ai_explanations` cache + `model_used`, per-user daily cap, `requireSession()` token refresh; DeepSeek/Qwen secrets set, `migration6.sql` applied, fallback verified in logs. **Phase 13 (cloud-blocked fallback + confidence badge)** is built — true-color fallback on ≥40%-cloud months, 🟢🟡🔴 confidence badge everywhere NDVI appears, `planting_date_source` (`migration8.sql`), Consult AI confidence hedging, and a one-shot no-data Telegram alert; `npm run build` passes ✅. **Pending backend deploy:** run `migration8.sql`, then `supabase functions deploy consult-ai` and `supabase functions deploy ee-alerts-worker`. The static app from Phase 2–7 is preserved intact as `index_old.html` (fully working). The app is feature-stable with NDVI/NDWI/LSWI analysis, time slider with Latest button + scene count, draw & save fields (synced to Supabase), Monitored-Fields sidebar + field-inspector panel with growth-stage-aware health badges, resizable split-screen compare mode, PNG/PDF export, event overlays with legend, CHIRPS rainfall context on stress alerts, per-user multi-area support (Areas dropdown + New Area modal), area recalculation on edit, satellite basemap toggle, place search, field deselection, Google sign-in, Telegram alerts, Consult AI, and a 4-slide onboarding help panel.
