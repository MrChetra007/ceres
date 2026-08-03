# NDVI Rice Crop Health Monitor — Master Roadmap

### Consolidated single-source roadmap: the full journey from tech-show demo to production-ready field tool

Covers everything from `NDVI_Crop_Monitor_Roadmap.md`, `NDVI_Stack_Migration_Roadmap.md`,
`NDVI_Product_Pivot_Roadmap.md`, `NDVI_Field_Area_Patch.md`, `NDVI_Growth_Stage_Thresholds_Patch.md`,
`NDVI_LSWI_CHIRPS_Patch.md`, `Ndvi_ui_redesign_patch.md`, and `Backend_Telegram_Roadmap.md`
(now folded into **Part 5**) — one place to see it all.

---

## 0. What we're building (recap)

A single-page web app, **no login/accounts**, that shows a live satellite map of rice-growing
areas in Battambang, Cambodia. The map is colored by **NDVI** (vegetation health computed from
satellite imagery). A visitor can:

1. See the map with a green→red health overlay
2. Drag a time slider to watch vegetation health change over a season
3. Click any spot to see a mini trend chart + a plain-language stress alert

**Backend = Google Earth Engine.** No Supabase, no database, no server you host. Earth Engine
does the satellite math on Google's machines; your app just asks for images and displays them.

> **Update (Part 5):** this "no login/accounts, browser-only" story has since evolved. Saved fields
> are synced through **Supabase** (**Google sign-in**), and a scheduled **Telegram alert** backend
> is being added. Everything in Parts 1–4 is the browser-only journey; Part 5 is the server-side step.

**Vision evolution:** started as a tech-show demo → became a simple, real single-user tool
(save fields, dashboard, export) → grew into a polished product (growth-stage-aware health,
water indices, rainfall context, UI redesign) → now adding multi-device sync (Supabase) and
scheduled stress alerts over Telegram.

---

## Part 1 — Core build (Phases 1–7)

## Phase 1 — Foundations (prove NDVI works) ✅

- Explore in the **Earth Engine Code Editor** (`code.earthengine.google.com`) before touching the app
- Original AOI test box: `ee.Geometry.Rectangle([103.10, 12.95, 103.25, 13.05])`
- Load Sentinel-2 (`COPERNICUS/S2_SR_HARMONIZED`), filter date/cloud, `.median()` → `.normalizedDifference(['B8', 'B4'])`
- Palette: `{ min: -0.2, max: 0.8, palette: ['red', 'yellow', 'green'] }`
- Register a **Cloud Project ID** for app use: `gen-lang-client-0978198347` (migrated from `ee-mengtong2025`)
- **Checkpoint:** real NDVI colors over real Battambang rice fields inside the Code Editor

## Phase 2 — Scaffold ✅ (migrated)

- **Original:** Vue 3 + Vite project
- **Current:** plain HTML/CSS/JS static site (`ndvi-monitor/`: `index.html`, `style.css`, `app.js`)
- **Why migrated:** `@google/earthengine` npm package breaks under Vite's ESM interop
  (`Failed to locate function parameters`). Loading EE via plain `<script>` tag resolved it.
- Full-screen Leaflet map, OpenStreetMap base tiles (free, no API key)
- **Checkpoint:** `typeof L` and `typeof ee` both `"object"`; blank Battambang map renders

## Phase 3 — NDVI on the map ✅

- Auth flow: `ee.data.authenticateViaOauth(CLIENT_ID, success, error)` → `ee.initialize(null, null, cb, err, null, PROJECT_ID)`
- **Auth persistence:** OAuth token saved to `localStorage` — page reload restores it automatically
- `getMap()` returns tile URL → `L.tileLayer(...)` added to map
- OAuth Client ID: `355514869488-q3v52vvkb7c3gikr0og89o26m51ev403.apps.googleusercontent.com`
- **Checkpoint:** OAuth popup completes and the green/red NDVI overlay appears (the point that was blocked under Vite)

## Phase 4 — Time slider ✅

- `<input type="range">` dynamically built from 14 months back (`buildMonths()`)
- Debounced 300ms — fires EE request only after user stops dragging
- Loading spinner on slider panel during computation; swaps NDVI tile layer on month change
- **Latest button** (↻) jumps to the most recent complete month
- **Scene count indicator** — cloud-free scene count next to month label; amber + ● dot when only 1–2 scenes (low confidence), gray for 3+
- **Checkpoint:** dragging the slider visibly changes map colors month to month

## Phase 5 — Click-to-inspect + trend chart ✅

- `map.on('click')` captures lat/lng → `getNdviTimeSeriesAtPoint()` queries EE
- Chart.js line chart (green fill, NDVI −0.5 to 1.0) in right-side info panel
- **Stress detection:** recent NDVI vs. value 14+ days earlier; >15% drop → yellow alert badge
- **Checkpoint:** clicking a field shows its own mini health history, not just a static color

## Phase 6 — Polish ✅

- Preset "interesting" location buttons (fly-to) for live demos
- "How this works" explanation modal (non-technical-friendly)
- Loading states hardening (counter-based spinner for rapid slider changes)
- Control layout cleanup; toast notification when export clicked without a selected point
- **Checkpoint:** demo-ready; loading states everywhere, presets, explanation panel

## Phase 7 — Stretch goals ✅

### 7.1 Event overlay

- Flood markers (Aug–Sep 2025) and Dry spell markers (Jan–Mar 2026) as colored bands below the slider + inline badge

### 7.2 Compare two dates

- Split-screen: two Leaflet maps side-by-side (50% each), dual sliders, view-synced via `syncing` flag
- Right map is display-only (no draw controls)

### 7.3 Export report

- One-page PDF: field name/coords, NDVI trend chart, health status, stress alerts, NDVI explanation (jsPDF + chart canvas)

### 7.4 NDWI water index

- Toggle adds NDWI (`B3`/`B8`, blue/brown palette); dashboard statuses adapt per active index
- Works with compare, export, presets, click-to-inspect

---

## Part 2 — Product pivot (single-user, no accounts)

Scope: draw & save fields → dashboard → export. **Explicitly not doing:** multi-user accounts,
Telegram/scheduled alerts, any server-side component. Everything runs in the browser —
saved fields live in `localStorage`, keyed to device/browser. A real backend only becomes
worthwhile when you need multi-device sync or multiple users.

### Feature A — Draw & save fields ✅

- leaflet-draw (v1.0.4) polygon + rectangle tools; live area tooltip while drawing (`showArea: true`, hectares)
- `promptSaveField()` → saved to `localStorage` as GeoJSON with `crypto.randomUUID()` keys
- Optional planting date captured at save time
- `saveField()` / `deleteField()` / `getSavedFields()` / `loadField()` CRUD
- Clicking a saved field loads polygon, fits bounds, recomputes NDVI for that geometry
- NDVI functions refactored to accept an optional `ee.Geometry` parameter
- Edit/delete buttons only visible when `drawnItems` has layers

### Feature B — Dashboard ✅

- ☰ toggle opens 280px left sidebar listing saved fields
- Each card: name + area (ha) + live health badge (🟢 Healthy / 🟡 Below expected / 🔴 Stressed)
- 📅 button to set/change planting date after save
- Status computed via `reduceRegion` over the field polygon for the most recent month
- Click card to load; hover ✕ to delete; backward-compatible with pre-patch fields

### Feature C — PNG/PDF export ✅

- "Export PNG" button downloads `canvas.toDataURL('image/png')` from the Chart.js chart
- PDF export via jsPDF (see 7.3)

---

## Part 3 — Feature patches

### Patch: Field area (hectares) ✅

- turf.js (v6) `turf.area()` (square meters → hectares) computed in-browser, cached at save time
- `getFieldAreaHectares()` + `formatHectares()` (sub-0.1 ha shows 3 decimals) + `getOrComputeArea()` fallback
- `map.on(L.Draw.Event.EDITED)` recalculates area after shape edits — card updates immediately
- Geodesic (spherical Earth) calculation — already accurate, no extra correction needed
- Optional `showArea: true, metric: ['ha']` for a live preview while drawing

### Patch: Growth-stage-aware thresholds ✅

- Problem: flat thresholds cry wolf early in the season and miss real stress later
  (freshly transplanted rice has low NDVI that's _normal_, not stress)
- `RICE_GROWTH_STAGES` table — 6-stage rice phenology (Transplanting → Harvest/Senescence)
  with expected NDVI ranges; days-since-planting → stage lookup
- `buildStatusText()` compares actual NDVI against stage-expected range; deficit >0.15 → 🔴
- Flat-threshold fallback when `plantingDate` is unknown (backward-compatible)
- Output example: `🟡 Below expected — Tillering, Day 24 (NDVI 0.31)`
- **Honesty note:** stage-NDVI curve is a published-phenology approximation, not field-validated for Battambang — say so if asked
- Optional: shaded expected-range band on the trend chart
- Sets up later: harvest reminders, more meaningful rainfall cross-referencing

### Patch: LSWI + CHIRPS rainfall ✅

- **LSWI** = `normalizedDifference(['B8', 'B11'])` (NIR/SWIR) — water/moisture-sensitive, good for catching transplanting/flood events; palette tan→lightblue→darkblue
- Slotted into a 3-way segmented control (NDVI / NDWI / LSWI) via an `INDEX_CONFIG` map
- **CHIRPS rainfall** (`UCSB-CHG/CHIRPS/DAILY`, ~5km resolution): `getRainfallMm()` sums precipitation over a trailing 21-day window
- Wired into `checkStress()`: on >15% NDVI drop, appends context — "only Xmm rain — drought stress is plausible" or "Xmm rain — low rainfall likely isn't the cause"
- Phrased as context, not diagnosis (correlation, not causation)
- **Optional:** auto-generate dry-month bands on the slider from CHIRPS (months < 50mm) instead of hand-placed markers — done later in Feature I

### Patch: UI redesign ✅

- `.panel` base class — one shared visual language across slider panel, info panel, dashboard
- Segmented 3-way index toggle; Compare checkbox switch; Export dropdown (PNG/PDF) with outside-click-to-close
- Field cards: header row (name + status badge) + stat row (area / planted date / NDVI) below a divider; area warning for implausibly large fields (>50 ha)
- `.status-toast` fading pill replaces the permanent top status bar
- Tabler Icons (`@tabler/icons-webfont`) for iconography
- `buildStatusObject()` returns `{ badgeClass, badgeText, stageLabel }` instead of an HTML string
- Pure CSS/markup — nothing computational changed

---

## Part 4 — Product features (built during development)

### Feature D — UI-managed preset locations ✅

- `PRESETS` array rendered dynamically by `renderPresets()`
- Pencil icon opens editor overlay: editable name/lat/lng/zoom + delete
- "Add current view" captures live map center + zoom; "Reset defaults" restores originals
- Persisted to `localStorage` under `ndvi_presets`

### Feature E — AOI editor (UI-managed bounding box) ✅

- `var aoiCoords` loaded from `localStorage` key `ndvi_aoi` (replaces hardcoded `AOI_COORDS`)
- Map icon button opens AOI editor modal (West/South/East/North inputs); red dashed rectangle overlay
- Applied/reset triggers recompute of dry months + NDVI with the new geometry
- Default: cement-factory box `[102.985, 12.845, 103.048, 12.898]`

### Feature F — Satellite basemap toggle ✅

- Street / Satellite segmented toggle in the slider panel `nav-row`
- Esri World Imagery (free, no API key); swaps base layer on both main and compare maps simultaneously

### Feature G — Field deselection ✅

- Clicking an already-selected field card deselects it
- `clearFieldSelection()` clears overlay, resets `currentGeometry`, recomputes over full AOI
- Map view stays unchanged; basemap re-asserted to prevent Leaflet tile glitches; `.field-card.active` blue border

### Feature H — Place search / geocoder ✅

- Search bar + Go button in `nav-row`; uses Nominatim (OpenStreetMap free geocoding)
- Enter key or button triggers `searchPlace()` → `map.setView([lat, lon], 16)`
- Toast on no results or network failure — never crashes the app

### Feature I — CHIRPS auto dry-month markers ✅

- `fetchDryMonths()` queries CHIRPS per month, flags months below 50mm total precipitation
- Striped amber markers in a second row below hand-placed event markers; re-renders both sliders

### AOI refinement ✅

- AOI changed from wide Battambang box to cement factory `[102.985, 12.845, 103.048, 12.898]`
- Map center/zoom updated to `[12.8715, 103.0165], zoom 14` (both maps)
- `.clip(geom)` added after `.median()` to restrict computation to AOI
- Presets updated to cement factory area

---

## Part 5 — Supabase Backend + Telegram Alerts (Phase 8) 🚧 In progress

**Scope of this phase:** move saved fields from browser `localStorage` to Supabase, and add scheduled
server-side stress checks that push Telegram alerts. The AI/LLM advisory layer is **explicitly not
being built in this phase** — see "AI window" note at the end. Don't add it unless asked.

Schema lives in the companion file `schema.sql` — run that in Supabase before starting Phase 8.2.

### 5.0 What changes architecturally

Today (per Parts 1–4): everything runs in the browser. A user opens the OAuth popup, Earth
Engine computes NDVI live, saved fields sit in that browser's `localStorage`. No server, no always-on
process.

After this phase: fields live in Supabase (Postgres), so any device/staff member with login can see
them. A **scheduled worker** (Supabase pg_cron → Edge Function, no separate server) runs daily,
re-checks each saved field's stress status using a Google service account (no user has to be logged
in), and messages Telegram when something's wrong.

```
Browser app (existing)  <──────>  Supabase (Postgres + Auth)
                                          ▲
                                          │  service_role key (read fields, write alerts)
                                          │
                     Supabase pg_cron ──> SQL fn ──> ee-alerts-worker Edge Function
                                            (npm:@google/earthengine + service account)
                                                  │
                                                  ▼
                                           Telegram Bot API
```

**Scheduling choice:** the scheduled worker runs as a **Supabase pg_cron job** that calls a
**Supabase Edge Function** (Deno) via `net.http_post` — everything stays inside Supabase, no separate
Cloud Scheduler or Python service. The original Python plan was set aside once the Earth Engine **Node**
client (`@google/earthengine`) was confirmed working in Deno (see 8.4/8.5 — the app's earlier
`Failed to locate function parameters` bug was a Vite bundler interop issue, not a Deno one).

### 5.1 Phase 8.1 — Supabase schema & auth ✅

- Supabase project `https://wopwwtnvqyomiwbsxiks.supabase.co` (anon key in `.env` / `app.js`)
- Auth: **Google OAuth** (single provider — the email magic-link/password forms were removed; Earth Engine keeps its own separate Google OAuth popup)
- `schema.sql` updated: `fields.owner_id` now defaults to `auth.uid()`, added `set_updated_at()` trigger
- App: supabase-js CDN added, auth overlay reworked into a dark-glass card with one "Sign in with Google" button for Supabase + one for Earth Engine, user menu with sign-in/sign-out, `onAuthStateChange` auto-loads fields and areas
- **Checkpoint:** can sign in with Google and see an empty `fields` list from Supabase in the Supabase dashboard table view

### 5.2 Phase 8.2 — Migrate the app off localStorage ✅

- `saveField()` / `getSavedFields()` / `deleteField()` / `loadField()` / `loadFieldById()` now use Supabase (`fieldsCache` in-memory mirror + async CRUD); same function names, new implementation
- New `updateField(id, patch)` handles area recalc (on `EDITED`) and planting-date edits
- One-time import: `importLocalFieldsIfAny()` uploads existing `ndvi_fields` localStorage on first login, then clears it
- `updateFieldStatus()` guarded by `eeReady` so dashboard renders before EE init
- **Checkpoint:** draw a field, refresh the page (or open on a different device, same login) — field persists via Supabase, not the browser

### 5.3 Phase 8.3 — Telegram bot + account linking ✅ (implemented in repo; needs deployment)

- In-app: "Telegram alerts" entry in the top-right user menu → modal generates a short-lived code and
  shows a deep link `t.me/<bot>?start=<code>` (bot username from `VITE_TELEGRAM_BOT_USERNAME` /
  `TELEGRAM_BOT_USERNAME` in `src/config.js`); polls `profiles.telegram_chat_id` every 3s until linked
- Bot webhook = **Supabase Edge Function** `supabase/functions/telegram-webhook/index.ts` (Deno,
  `verify_jwt = false`): receives `/start <code>`, matches it in `link_codes` via `service_role`
  (bypasses RLS — no public select-by-code policy exists), redeems through the `redeem_link_code()`
  RPC (migration2.sql) that atomically sets `profiles.telegram_chat_id` and marks the code used
- `migration2.sql` guard trigger: a logged-in user can only _clear_ their `telegram_chat_id`
  (disconnect); the chat id is set only by the bot
- **Deploy:** run `migration2.sql` → `supabase functions deploy telegram-webhook` →
  `supabase secrets set TELEGRAM_BOT_TOKEN=...` → Telegram `setWebhook` to
  `https://wopwwtnvqyomiwbsxiks.functions.supabase.co/telegram-webhook`
- **Checkpoint:** tapping "Telegram alerts" in the app → messaging the bot → `profiles.telegram_chat_id`
  populates for that user

### 5.4 Phase 8.4 — Earth Engine service account ✅

- In the same GCP project (`gen-lang-client-0978198347`), created a service account, granted it Earth
  Engine access, downloaded the JSON key
- Stored the key as a Supabase Edge Function secret (`supabase secrets set EE_SERVICE_ACCOUNT_KEY=...`)
  — never committed, never sent to the browser
- **Verified in Deno** via the throwaway `ee-spike` function (delete when done): the Earth Engine
  Node client (`npm:@google/earthengine@0.1.395`) imports and authenticates with a service-account
  key inside a Supabase Edge Function — the key risk from the original Python plan is cleared
- **Checkpoint:** the worker authenticates and pulls a real NDVI value with no browser/OAuth popup involved ✅

### 5.5 Phase 8.5 — Scheduled worker (Supabase pg_cron → Edge Function) ✅

- **Scheduling:** `migration3.sql` enables `pg_cron` + `pg_net`, stores the `service_role` key in
  **Supabase Vault**, and schedules `ndvi-alerts-daily` (once daily, 23:00 UTC = 06:00 Cambodia) to
  `net.http_post` the worker function with a `service_role` Bearer token
- **Worker = `ee-alerts-worker` Edge Function** (Deno, `npm:@google/earthengine@0.1.395` + `@supabase/supabase-js`):
  1. Authenticates Earth Engine with the service-account key (`authenticateViaPrivateKey`)
  2. Queries Supabase (via `service_role`) for all fields where the owner has a `telegram_chat_id` set
  3. For each field: recomputes NDVI (90-day Sentinel-2 median, `.normalizedDifference(['B8','B4'])`) +
     growth-stage-aware status — a port of the app's 6-stage phenology thresholds and flat fallback.
     The 90-day window (was 30) keeps rainy-season fields with sporadic cloud-free scenes from
     returning `no_data` every run; the `<40` cloud-cover filter is deliberately **not** loosened
     so residual cloud can't bias NDVI downward into false "stress". On an empty collection the
     worker logs `status = 'no_data'` (no message, no crash).
  4. Compares new status to the _last logged_ status in `alerts_log` (dedup) — sends Telegram only on
     a genuine change **for the worse** (or first non-healthy result). `SEVERITY` includes
     `no_data: -1` so any transition *from* no-data to a real status is treated as a worsening.
  5. Inserts an `alerts_log` row every run (history) with the message text; calls Telegram `sendMessage`
     with `chat_id` when a message was warranted (includes 21-day CHIRPS rainfall context)
- **Build the alert text as a template function, not an inline string** —
  `buildAlertMessage(status, ndviValue, rainfallMm, growthStage)` returns the message. This is the
  hook for the AI layer later — see "AI window" note below.
- **Checkpoint:** the daily job (or a manual trigger) produces a Telegram message for a field that's
  deliberately stressed, and an `alerts_log` row every run ✅ (user-confirmed working)

### 5.6 Phase 8.6 — End-to-end test 🚧 In progress

- Let the scheduled job run for a few real days on your own test field
- Confirm: no duplicate alerts, no missed alerts, dedup logic holds up, Telegram message content is
  legible in Khmer/English as needed
- **Checkpoint:** a real stress event on your test field produces exactly one Telegram message, not
  zero and not five — user has confirmed the worker runs and messages arrive; sustained multi-day
  dedup validation is the remaining confirmation

### 5.7 Dedup logic (decides whether a status change actually sends a message)

```
last_status = most recent alerts_log.status for this field (or null if none yet)
new_status  = freshly computed status from Earth Engine

if new_status != last_status:
    insert alerts_log row (field_id, new_status, ndvi_value, message, chat_id)
    if new_status is worse than last_status (or last_status was null and new_status is not healthy):
        send Telegram message
else:
    insert alerts_log row anyway (for the history/trend), but skip the Telegram send
```

This keeps a full history for later (useful for the dashboard, or for showing a co-op "here's the
season's alert log" during a pitch) while only pinging Telegram on genuine changes.

### 5.8 Suggested build order & rough time

1. Supabase schema + auth — done ✅
2. Migrate app CRUD off localStorage — done ✅
3. Telegram bot + linking flow — implemented ✅ (needs deployment: `migration2.sql`, function deploy, token secret, webhook registration)
4. Earth Engine service account — done ✅ (verified in Deno via `ee-spike`, then the real worker)
5. Scheduled worker — done ✅ (`ee-alerts-worker` + `migration3.sql` pg_cron/Vault job)
6. End-to-end test + dedup tuning — in progress 🚧 (multi-day dedup validation remaining)

**Backend Phase 8 is effectively complete except the sustained end-to-end confirmation.**

### 5.9 Known risks to plan around (backend)

- **EE noncommercial fee-for-service restriction** — fine for now, becomes a real line item the
  moment a co-op actually pays for this
- **Alert fatigue** — the dedup logic above is a starting point; watch real usage and adjust the
  "worse than" comparison if it's too chatty or too quiet
- **pg_cron/Vault wiring** — the daily job reads the `service_role` key from Supabase Vault by name;
  if the Vault secret name or the `net.http_post` URL drifts, the job fails silently (watch `cron.job`
  and `net._http_response`)
- **Free tier limits** — Supabase free tier and a once-daily job are both comfortably
  within free quotas at this scale; recheck if usage grows past a handful of test fields

### 5.10 AI window

`buildAlertMessage()` in Phase 8.5 is deliberately a standalone function, not inline code, so that a
future AI/LLM layer can replace what's _inside_ it (plain-language generation from the same status/
NDVI/rainfall/growth-stage inputs) without touching Supabase, the scheduler, or the Telegram send
logic.

> **Update (Part 7):** the AI layer has since been built as **Consult AI** — a separate Edge
> Function (`consult-ai`) with a **Gemini → DeepSeek → Qwen** fallback chain, called on demand from
> the field detail panel. See Part 7. The Telegram worker's `buildAlertMessage()` remains a plain
> template and was left untouched; it is still the future hook if alert messages should also become
> LLM-generated.

---

## Part 6 — Multi-area support (per-user AOIs) ✅

Replaces the single hardcoded/localStorage AOI with per-user, multi-AOI support backed by Supabase.

### Feature: Areas dropdown + New Area modal

- `aois` table (`owner_id`, `name`, `bounds` jsonb, `created_at`), capped at **5 per user** via a DB trigger; nullable `aoi_id` added to `fields` (schema-ready, not wired to the UI yet)
- CRUD mirrors the fields pattern: `getAois()` / `createAoi()` / `updateAoi()` / `deleteAoi()` in `store.js`, backed by `loadAois` / `insertAoi` / `updateAoi` / `deleteAoi` in `src/services/supabase.js`; in-memory `state.aois` mirror
- **"Areas" dropdown** in the BandPanel: lists saved areas by name (select → recenter + re-clip NDVI/NDWI/LSWI on both maps), trash to delete, "+ New area"
- **New Area modal** (`AoiEditor.vue`): name field + West/South/East/North inputs (prefilled from current area) **or** a Nominatim place search that auto-fills the box from the matched place's bounding box
- **5-area cap handled in UI**: "+ New area" hidden and the map-icon button gated once 5 areas exist; insert errors matching the limit → toast "Limit of 5 areas reached"
- **Default seed**: on first login with no areas, auto-creates "Battambang (default)" from `[102.985, 12.845, 103.048, 12.898]` so the map is never empty
- `ndvi_aoi` localStorage key removed; `state.aoiCoords` now derives from the selected AOI row via `applyAoiBounds()` (redraws the red dashed rectangle, recenters, recomputes dry months + both maps)
- Help modal updated with an "Areas of interest" section

### Supporting UX work (this session)

- Supabase auth simplified to **Google OAuth only** (email magic-link/password forms removed)
- Auth overlay redesigned to the dark-glass design system (brand icon, Google-logo buttons with captions, ✕ close)
- Mobile fixes: TopBar user chip collapses to an icon + dropdown at ≤780px; `.time-panel` z-index lowered to 25 so the Export dropdown paints above it; redundant Street/Satellite toggle hidden at ≤480px

---

## Part 7 — Consult AI (AI agronomist) + multi-provider LLM fallback 🚧 Implemented (needs deploy/verify)

The "AI window" opened in 5.10. A farmer can get a plain-language interpretation of a field's
satellite health data (NDVI, LSWI, 21-day rainfall, growth stage) from a server-side LLM, with a
resilient **Gemini → DeepSeek → Qwen** fallback chain so one provider's quota/404/outage never
blocks the feature.

### 7.1 Consult AI button + Edge Function

- **Frontend** (`src/components/FieldDetailPanel.vue`): "Consult AI" button + response card on
  saved fields; disabled while the map is loading and when the selected month has no scenes;
  guards on `ndviValue == null`, not-signed-in, EE-not-ready, and surfaces
  `429 daily_limit_reached` / `400 missing_data` as toasts.
- **Auth token** comes from `requireSession()` (`src/services/supabase.js` — auto-refreshes a
  stale/near-expired access token before returning, same helper `insertField`/`insertAoi` use),
  wrapped in a try/catch so genuine sign-in failures show a friendly toast instead of a rejected
  request.
- **Edge Function** `supabase/functions/consult-ai/index.ts` (JWT-required):
  - verifies the user JWT; rejects missing NDVI with `400 missing_data`
  - serves cached explanations from `ai_explanations` when NDVI + status haven't moved (<0.02)
  - per-user daily cap via `ai_usage.calls_today` (default 20) → `429 daily_limit_reached`
  - CORS from the `APP_URL` secret (fallback `*`) + OPTIONS preflight

### 7.2 Multi-provider fallback

- `generateExplanation(prompt)` orchestrator tries providers in order, returns the first usable
  answer as `{ text, model }`. Each caller returns `string | null` and never throws, so the chain
  proceeds cleanly; every call has a 20s `AbortController` timeout for fast failover:
  - `callGemini` — `gemini-3.5-flash` (`generateContent`); 2.0-flash reported zero quota and
    2.5-flash returned 404 "no longer available" for this API key. `thinkingConfig` low +
    `maxOutputTokens: 800` (raised from 500 so thinking overhead can't truncate the answer).
  - `callDeepSeek` — OpenAI-compatible `https://api.deepseek.com/chat/completions`,
    `deepseek-chat`, `max_tokens: 500`.
  - `callQwen` — DashScope compatible-mode
    `https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions`, `qwen3-max`,
    `max_tokens: 500`.
- Responding model stored as `ai_explanations.model_used` (`migration6.sql`) and logged as
  "AI explanation served by: …" — **auditing only**, never sent to the frontend. API response
  stays `{ ok, explanation, cached }`; the UI keeps the "AI-generated interpretation to guide
  you — not a diagnosis" framing regardless of provider. Same English/Khmer prompts across providers.

### 7.3 Related fixes

- **Tab-refresh regression:** supabase-js fires `SIGNED_IN` on every tab focus (visibility-change
  session recovery); a `lastLoadedUserId` guard in `src/store.js` prevents re-running
  field/AOI loading and the "Reloading NDVI for …" recompute on tab return.
- **Rainfall (21-day) card:** "Loading…" / "Data unavailable" instead of a bare dash when CHIRPS
  data can't be fetched.
- RLS/session hardening (`migration5.sql`, `requireSession()`) for field/AOI inserts.

### 7.4 Deploy steps

1. `supabase secrets set DEEPSEEK_API_KEY="..."` and `supabase secrets set QWEN_API_KEY="..."`
2. Apply `migration6.sql` in the Supabase SQL editor
3. `supabase functions deploy consult-ai`
4. Verify: with a bad Gemini key the request falls through to DeepSeek; check
   `supabase functions logs consult-ai` for "AI explanation served by: deepseek-chat".

---

## Stack notes (migration + current state)

### Why no Vite

The EE JS client does dynamic function-binding and injects its own OAuth/gapi loader
internally. Under Vite's dev-server module graph and pre-bundling cache this produces
`Failed to locate function parameters` — not an app bug, a client/bundler interop issue.
Fix: load EE via a plain `<script>` tag (Google's own documented approach).

### What changes vs. Vue

- No component reactivity — state lives in plain JS variables at the top of `app.js`;
  manually update the DOM via small `update...()` functions
- No build step — edits take effect on browser refresh
- Simpler deployment — any static host (Vercel, Netlify, Cloudflare Pages, GitHub Pages)
  serves the three files as-is, no build command

### Current tech stack

> **Note:** the sections above describe the original plain-HTML/JS app. The frontend has since been
> migrated to **Vue 3 + Vite** (`ndvi-monitor/` with `src/`, `index.html`, CDN-loaded EE/Leaflet), and
> saved fields now persist to **Supabase** instead of localStorage (see Part 5). The stack table below
> is the historical record; the working app is the Vue rewrite.

| Layer             | Tool                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------- |
| Frontend          | Plain HTML/CSS/JS (historical) → **Vue 3 + Vite** (current, `src/`)                   |
| Map               | Leaflet + OpenStreetMap tiles / Esri World Imagery                                    |
| Satellite compute | Google Earth Engine (JS client via CDN `<script>` tag, v1.7.36)                       |
| Auth              | Earth Engine OAuth popup (`ee.data.authenticateViaOauth`) + **Supabase Google OAuth** |
| Geocoding         | Nominatim (OpenStreetMap free API)                                                    |
| Drawing           | leaflet-draw (v1.0.4)                                                                 |
| Area calc         | turf.js (v6)                                                                          |
| Charts            | Chart.js (v4.4.7)                                                                     |
| PDF               | jsPDF                                                                                 |
| Icons             | Tabler Icons (`@tabler/icons-webfont`)                                                |
| Storage           | localStorage (EE token, presets) → **Supabase** (fields, areas, alerts)               |

### OAuth setup (Google Cloud Console)

- OAuth 2.0 Client ID (Web application type): `355514869488-q3v52vvkb7c3gikr0og89o26m51ev403.apps.googleusercontent.com`
- Authorized JS origins: `http://localhost:5173` (Vite), `http://localhost:3000` (serve), `http://localhost:60822` (serve dynamic)
- Token persisted via `localStorage` — single sign-in survives reloads
- OAuth popup flows generally need `http://`, not `file://` — use a local server

---

## Known risks to plan around

1. **Cloud cover** — Cambodia's rainy season clouds many Sentinel-2 images. `.median()`
   composites help; some months may still look patchy. Keep a verified fallback date range.
2. **Quota** — Community tier gives 150 EECU-hours/month. A live demo is unlikely to hit it,
   but don't leave the app auto-refreshing overnight.
3. **Booth wifi** — the single biggest real-world risk to a live demo; consider pre-fetching
   and caching a few months of tiles as an offline fallback.
4. **NDVI ≠ diagnosis** — a stress signal tells you _something_ changed, not _what_ caused it
   (drought vs. disease vs. pest vs. soil all lower NDVI similarly). Same honesty applies to
   the growth-stage curve (approximation, not field-calibrated) and rainfall correlation (context, not causation).

---

## What this sets up for later (not now)

- **Harvest reminders** — days-since-planting crossing into the "Harvest" stage is a natural on-screen trigger, no backend needed
- **Auto-suggest planting date** — LSWI spike (flooding/transplanting) when a field is first drawn could auto-fill the planting date
- **Drought/flood risk assessment** — rainfall + NDVI together is the natural first step, but that's a scoped feature of its own
- **Backend path** — `localStorage` → Supabase table (`fields`: owner, geojson, name, notes) is a clean swap; Telegram alerts become straightforward once a scheduled job can iterate a database of fields. **Done — see Part 5 (Phase 8): fields migrated, pg_cron → Edge Function worker sending alerts, only the sustained E2E dedup validation remains.**

---

## Suggested build order (recap)

1. Prove NDVI in the Earth Engine Code Editor over real Battambang coordinates (Phase 1)
2. Scaffold static app + auth + blank map (Phase 2)
3. Render one static NDVI tile layer (Phase 3)
4. Add the month time slider (Phase 4)
5. Add click-to-inspect + trend chart (Phase 5)
6. Polish: presets, loading states, explanation panel (Phase 6)
7. Stretch: events, compare, export, NDWI (Phase 7)
8. Product pivot: draw/save fields, dashboard, export (Features A–C)
9. Patches: field area → growth-stage thresholds → LSWI + CHIRPS → UI redesign
10. Product features: presets/AOI editors, satellite toggle, deselection, geocoder, auto dry-month markers
11. **Backend (Phase 8, nearly done):** Supabase schema+auth ✅ → migrate CRUD off localStorage ✅ → Telegram bot + linking ✅ (Edge Function + app UI, awaiting deployment) → EE service account ✅ (verified in Deno) → scheduled worker ✅ (`ee-alerts-worker` + `migration3.sql` pg_cron/Vault job) → end-to-end test 🚧 (multi-day dedup validation; see Part 5)
12. **Multi-area (Part 6, done):** per-user `aois` in Supabase → Areas dropdown + New Area modal (manual coords or Nominatim place search) → 5-area cap + default seed → Google-only auth + auth card redesign + mobile fixes
13. **Consult AI (Part 7, implemented — needs deploy):** `consult-ai` Edge Function with Gemini → DeepSeek → Qwen fallback, "Consult AI" button + response card, `ai_explanations` cache + `model_used`, daily per-user cap, `requireSession()` token refresh → set DeepSeek/Qwen secrets, apply `migration6.sql`, deploy function

---

## Status

Parts 1–4 are complete and feature-stable: NDVI/NDWI/LSWI analysis, time slider with Latest button and scene count indicator, draw & save fields, dashboard with growth-stage-aware health badges, compare mode, PNG/PDF export, event overlays, CHIRPS rainfall context on stress alerts, preset locations, UI-managed preset/AOI editors, area recalculation on edit, satellite basemap toggle, place search, field deselection, and a help panel. **Part 6 adds per-user multi-area support** (Areas dropdown, New Area modal with coords/place search, 5-area cap, first-login default seed). The frontend runs as a Vue 3 + Vite app with CDN-loaded Earth Engine/Leaflet.

**Phase 8 (Part 5) is nearly complete:** 8.1 (Supabase schema & auth) ✅, 8.2 (migrate fields off localStorage) ✅, 8.3 (Telegram bot + account linking — Edge Function + app UI, implemented, awaiting deployment) ✅, 8.4 (EE service account, verified in Deno) ✅, 8.5 (scheduled worker — `ee-alerts-worker` Edge Function + `migration3.sql` pg_cron/Vault daily job) ✅ are done and confirmed working. Remaining: 8.6 sustained end-to-end dedup validation, plus deployment of 8.3's webhook/token secrets. **Part 6 (multi-area support) ✅ is complete.** **Part 7 (Consult AI) is implemented in the repo** — `consult-ai` Edge Function with a Gemini → DeepSeek → Qwen fallback chain, "Consult AI" button + response card in the field detail panel, `ai_explanations` cache with `model_used`, per-user daily cap, and `requireSession()` token refresh; still needs the DeepSeek/Qwen secrets set, `migration6.sql` applied, and the function redeployed. Also pending separately: the Vue rewrite's final end-to-end smoke test and the design-system redesign (see `PROCESS.md`).
