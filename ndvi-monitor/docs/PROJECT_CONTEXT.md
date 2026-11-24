# Ceres / NDVI Rice Monitor — AI Context Handoff

**Use this file first.** If a future AI session needs to understand the app quickly, point it here. It is the shortest accurate map of the product, the code, the current state, and the rules for changing it.

**Last updated:** 2026-11-24  
**Repo:** `D:\SAAS\NDVI`  
**App root:** `D:\SAAS\NDVI\ndvi-monitor`  
**Supabase project ref:** `wopwwtnvqyomiwbsxiks`  
**Remote note:** GitHub reports the canonical repo as `https://github.com/MrChetra007/ceres.git`.

---

## 1. What the app is

Ceres is a satellite crop-health monitor for rice farmers in Cambodia, built around real Sentinel-2 data and Supabase.

Core user flow:

1. Sign in with email/password (Supabase Auth).
2. Draw a field polygon/rectangle on a Leaflet map.
3. Set crop and planting date.
4. View monthly NDVI / NDWI / LSWI / SAVI / EVI / GNDVI / RVI / true-color layers.
5. Get a field health status, trend chart, rainfall context, stress alert, and AI-written advisory.
6. Receive Telegram alerts.
7. For CamDX: tag the field with official Province > District > Commune > Village codes, optionally consent to share anonymized health, and let extension officers see commune-level summaries at `/government`.

The important product distinction: **Ceres is not just a map viewer.** It is a field record system + satellite pipeline + alerting system + (now) a two-sided CamDX data exchange.

---

## 2. Current state (as of 2026-11-24)

### Working / complete

- NDVI / NDWI / LSWI / SAVI / EVI / GNDVI / RVI / true-color map layers
- Time slider, latest view, scene counts, cloud-blocked and radar fallback states
- Field draw/save/edit/delete and dashboard
- Growth-stage-aware health status
- Trend chart, PNG/PDF export
- CHIRPS rainfall context and dry-month markers
- Open-Meteo 5-day forecast
- Telegram linking + scheduled `ee-alerts-worker`
- Email/password auth
- CamDX Phase 0–6 implementation:
  - admin-boundary tables + 36-file seed
  - location picker + consent
  - DataEF current conditions
  - extension-viewer role + commune summary RPC
  - demo shared fields
  - `/government` dashboard
  - DataEF province aliases
- Decision engine (Phase 1 — 2026-11-24):
  - deterministic `monitor` / `scout` / `act` recommendation from existing signals
  - in-app "What to do" card, decision-aware Consult AI, and tiered Telegram advisories
  - see the “Decision engine (Phase 1)” subsection below
- Feedback loop (Phase 2 — 2026-11-24):
  - "I checked my field" observations (tags / outcome / notes / photo) → `field_observations`
  - append-only action + feedback log → `field_actions` (done / snoozed / dismissed / rated)
  - Done / Snooze / Dismiss suppress repeat Telegram alerts; usefulness ratings are stored
  - see the “Feedback loop (Phase 2)” subsection below
- Today triage (Phase 3 — 2026-11-24, slice 1):
  - ranked top-3 "where to look first" list in the sidebar, reusing `buildDecision`
  - ranks by action tier, signal score and hectares, and shows the decision headline
- Telegram digest (Phase 3 — 2026-11-24, slice 2):
  - `ee-alerts-worker` sends one message per chat instead of one per optical field
- Seasonal timing nudges are still pending.

### Decision engine (Phase 1 — 2026-11-24)

Turns the metrics the app already has into one **actionable** recommendation instead of leaving the farmer to interpret indices.

- **Files (keep in sync):** `src/services/decision.js` (browser) and `supabase/functions/_shared/decision.ts` (Deno) are verbatim ports with the same rules — same pattern as `_shared/growthStage.ts` vs `src/config.js`. Change both together.
- **Output:** a structured card `{ tier, severity, urgency, timeWindow, headline, hypotheses, actions, verify, reason, flags, score }`. Text items are `{ key, params }` resolved through `decision.*` i18n keys (en/km) in the UI and an English map for LLM prompts.
- **Tiers:**
  - `monitor` — no evidence of a problem; keep normal practices and re-check next pass.
  - `scout` — uncertain/early signal; check the field before spending money. Includes below-expected, radar, no-data, and all low-confidence cases.
  - `act` — deliberately narrow: only a **stressed** field with a clear time-sensitive reason (high severity, a sensitive stage, or dry/wet at a water-hungry stage).
- **Hard rules:** low confidence, radar, and no-data never exceed `scout`; below-expected never reaches `act`; rain within ~3 days relieves a dry, non-stressed field (advises waiting). Hypotheses are always framed as possibilities, never diagnoses.
- **Where it is used:**
  - `FieldDetailPanel.vue` — "What to do" card on the NDVI tab (tier, action window, next steps; collapsible field-check / causes / why).
  - `consult-ai` — recomputes the decision server-side from `statusKey` + forecast + trend and injects a `DECISION` block into the prompt. The LLM may only **phrase** it.
  - `ee-alerts-worker` — computes the decision, prefixes every Telegram message with an authoritative `[Monitor]/[Check field]/[Act now]` tag (Khmer too), and appends a deterministic next step when the LLM falls back.
- **LLM contract:** the model must never upgrade/downgrade the tier, urgency, or recommended step. Thresholds live in `DECISION_THRESHOLDS` inside both decision files.
- **Verification:** `npm run build`, plus a Node parity test that runs the client and Deno modules over the same scenarios and asserts identical output.

### Feedback loop (Phase 2 — 2026-11-24)

Closes the loop between an advisory and what the farmer actually sees and does.

- **Migration:** `migrations/020_feedback_loop.sql` (run it before testing). Adds:
  - `field_observations` — one "field check": `tags` (`water`/`weed`/`pest`/`disease`/`nutrient`/`other`/`none`), `outcome` (`improved`/`same`/`worse`/`unknown`), `notes`, optional `photo_path` in the existing private `field-photos` bucket, `source`.
  - `field_actions` — append-only log: `status` (`done` / `snoozed` / `dismissed` / `rated`), `decision_tier`, `action_key`, `useful`, `reason`, `snooze_until`, optional `alert_id`.
  - Owner-only RLS. Inserts require the field to be owned by `auth.uid()` (and, when set, the alert to belong to the same owner).
- **UI**
  - `FieldObservationModal.vue` + the "Field checks" card in `FieldDetailPanel.vue`: record a check with a camera photo; the last 3 are shown with tags/outcome/notes.
  - Decision card footer: **Done** / **Snooze 3 days** / **Dismiss**, plus a usefulness rating (thumbs up/down, optional reason).
- **Worker suppression:** `ee-alerts-worker` reads the latest `done` / `snoozed` / `dismissed` row per field before doing any Earth Engine work and skips the message:
  - `snoozed` → skip until `snooze_until`
  - `dismissed` → skip for 7 days
  - `done` → skip for 3 days
  - `rated` → never suppresses
- **Notes:** a later rating does not cancel a snooze/dismiss — the worker filters to the three acknowledgement statuses. If migration 020 is not applied, the worker treats it as "no acknowledgement" (non-fatal) and the UI inserts fail.

### Today triage (Phase 3 — slice 1, 2026-11-24)

`TodayTriage.vue` (rendered at the top of `Sidebar.vue` when there are 2+ fields) closes the "which field should I look at first?" gap.

- Reuses `buildDecision` per field from data already in memory: `fieldStatus`, `fieldTrends`, growth stage, confidence and area. **No extra Earth Engine calls** — it deliberately omits per-field rainfall/forecast; open the field for the full decision.
- Ranks actionable fields (`act` > `scout`, then signal score, then capped hectares) and shows the top 3 with the decision headline and tier.
- Shows a calm "all fields look normal" state when every field is `monitor`; hidden for single-field users.
- Seasonal timing nudges are still pending for Phase 3.

### Telegram digest (Phase 3 — slice 2, 2026-11-24)

`ee-alerts-worker` now buffers optical NDVI advisories per Telegram chat and sends:

- one message as before when a farmer has a single optical field;
- one digest — `Today's field update (N fields):` followed by `• [tier] Field: …` — when there are several.

Details:

- Each item is capped at 500 chars, the whole digest at 3,800 (Telegram's limit is 4,096). Overflow becomes `…and N more field(s)`; fields omitted from an over-long digest are logged with `telegram_sent = false` because they were not delivered.
- `alerts_log` still gets one row per field with that field's **individual** message (per-field history/audit) plus the real delivery flag.
- `no_data` and radar-only messages still send individually — those branches are separate; the digest currently covers the optical NDVI path.

### Operational steps still required when testing CamDX

If not already done on the target database:

1. Run `migrations/019_roles_and_commune_summary.sql`.
2. Grant the extension role:

```sql
update public.profiles
set role = 'extension_viewer'
where id = '<extension-viewer-user-uuid>';
```

3. Run `migrations/seed/demo_shared_fields.sql`.
4. Deploy `dataef-weather` and `ee-alerts-worker` if not already deployed.
5. Test `/government` as the extension viewer and as a normal farmer.

### Known project status

- `018_admin_boundaries.sql` applied.
- Admin seed is split into `migrations/seed/` because the single 1.3 MB SQL file exceeded the Supabase SQL Editor limit.
- Expected seed counts: **25 provinces, 210 districts, 1,661 communes, 14,512 villages**.
  - DataEF source has 14,576 villages but contains 54 duplicate codes, one malformed code (`0506140-`), and 9 orphan villages under missing commune `120913`.
  - Duplicates/malformed/orphan rows are intentionally skipped.
- PWA files exist but are **disabled** intentionally.

---

## 3. Tech stack

| Layer | Tool |
|---|---|
| Frontend | Vue 3 + Vite |
| Map | Leaflet 1.9.4 + leaflet-draw 1.0.4 (CDN globals) |
| Charts | Chart.js |
| PDF | jsPDF |
| Geocoding | Nominatim |
| Auth/DB | Supabase (Postgres + email/password Auth) |
| Satellite compute | Google Earth Engine via `ee-data` Edge Function |
| Alerts | `ee-alerts-worker` + Telegram Bot API |
| AI advisory | `_shared/llm.ts` → Gemini → DeepSeek → Qwen fallback |
| Weather | Open-Meteo (forecast), CHIRPS/IMERG (rainfall), DataEF (official current conditions) |
| Admin data | DataEF 2025 lists, seeded into Supabase |

---

## 4. Repo layout

```text
ndvi-monitor/
├── index.html
├── vite.config.js
├── src/
│   ├── main.js
│   ├── App.vue
│   ├── store.js                 # all app state + business logic
│   ├── config.js                # indices, thresholds, URLs, presets
│   ├── router/index.js          # /, /map, /government, /pricing, /billing
│   ├── components/              # map, panels, sidebar, modals, pickers
│   ├── views/                   # LandingPage, MapView, GovernmentDashboard, Pricing
│   ├── services/
│   │   ├── earthEngine.js       # thin client for ee-data
│   │   ├── supabase.js          # Supabase client + auth + field/area CRUD
│   │   ├── adminBoundaries.js   # Province/District/Commune/Village lookups
│   │   ├── dataefService.js     # DataEF current-conditions proxy client
│   │   ├── weatherService.js    # Open-Meteo forecast
│   │   ├── decision.js          # Phase 1 decision engine (client mirror)
│   │   └── geocode.js           # Nominatim reverse geocode
│   ├── i18n/en.js               # English
│   ├── i18n/km.js               # Khmer
│   └── styles/                  # design tokens + component CSS
├── supabase/functions/
│   ├── ee-data/                 # Earth Engine proxy for map/trends/status
│   ├── ee-alerts-worker/        # nightly Telegram advisories
│   ├── dataef-weather/          # JWT proxy for DataEF current conditions
│   ├── consult-ai/              # AI agronomist
│   ├── telegram-webhook/        # bot linking/photos
│   ├── trigger-alerts-worker/   # service-role-only manual trigger
│   └── _shared/                 # llm, weather, dataef, cloudMask, growthStage, decision
├── migrations/                  # schema + feature migrations
│   └── seed/                    # admin data, demo data, verify_seed.sql
└── docs/                        # project docs
```

---

## 5. Architecture / data flow

```text
Browser (Vue)
  ├── Supabase Auth / Postgres / RLS
  ├── supabase.functions.invoke('consult-ai')
  ├── supabase.functions.invoke('dataef-weather')
  └── fetch ee-data with Supabase JWT
          ├── Earth Engine (Sentinel-2 / Sentinel-1)
          └── Supabase service-role caches

ee-data
  ├── authenticates with EE_SERVICE_ACCOUNT_KEY
  ├── computes index tiles/trends/status/observations/rainfall
  └── writes ee_tile_cache / ee_trend_cache / ee_observation_cache

ee-alerts-worker
  ├── service-role read of all fields with linked Telegram
  ├── reads admin_provinces for DataEF names
  ├── calls EE for status + radar fallback
  ├── calls CHIRPS for 21-day rainfall
  ├── calls Open-Meteo for 5-day forecast
  ├── calls DataEF for official current conditions
  ├── builds LLM advisory
  └── sends one Telegram message/digest per chat + logs alerts_log
```

The **decision engine** sits beside this flow: it consumes the same status/confidence/growth-stage/rainfall/forecast/trend values and produces the `monitor` / `scout` / `act` recommendation used by the field-detail card, Consult AI, and the alerts worker. The browser and Edge Functions must use the matching modules (`src/services/decision.js` and `_shared/decision.ts`).

The browser never authenticates directly with Earth Engine.

---

## 6. Auth, roles, and privacy

- Auth is **email/password**, not magic link.
- Google OAuth is disabled/commented out.
- `profiles` extends `auth.users`.
- Roles:
  - `farmer` (default)
  - `extension_viewer`
- Role changes are manual in SQL; users cannot change their own role.
- RLS is owner-only for `fields`, `aois`, `alerts_log`, `profiles`, and `billing_events`.
- `get_commune_stress_summary()` is a `security definer` RPC:
  - only callable by `extension_viewer`
  - returns commune aggregates only
  - suppresses groups with fewer than 3 shared fields
  - returns `includes_demo` instead of demo field names
  - never returns names, owner IDs, geometry, or coordinates
- The `/government` route guard is UX only; the database RPC is the real boundary.
- Known issue not fixed: “update own profile” policy still lets users edit their own subscription columns. Out of scope but should be fixed later.

---

## 7. Field data model (important columns)

`fields`:

```text
id, owner_id, name, geojson, area_ha, planting_date, planting_date_source,
notes, created_at, updated_at, aoi_id,
centroid_lat, centroid_lng, next_expected_pass, imagery_source,
crop_name, crop_english,
province_code, district_code, commune_code, village_code,
share_with_authorities
```

There are **no address columns** (no province/district name stored). Location is official codes + centroid. Human-readable names are resolved from `admin_*` tables at read time.

Location rules:

- `share_with_authorities` defaults false.
- It can only be true when `commune_code` is set.
- Clearing commune clears consent.
- Old fields with null location remain valid.

Phase 2 feedback tables:

```text
field_observations (id, field_id, owner_id, observed_on, tags text[], outcome, notes, photo_path, source, created_at)
field_actions      (id, field_id, owner_id, alert_id, decision_tier, action_key, status, useful, reason, snooze_until, notes, created_at)
```

Admin tables:

```text
admin_provinces (code, name_kh, name_en)
admin_districts (code, province_code, name_kh, name_en)
admin_communes  (code, district_code, province_code, name_kh, name_en)
admin_villages  (code, commune_code, district_code, province_code, name_kh, name_en)
```

Codes are TEXT with leading zeros. Never convert them to numbers.

---

## 8. Satellite/status pipeline

- `ee-data` is the only Earth Engine compute path.
- Indices: `ndvi`, `ndwi`, `lswi`, `savi`, `evi`, `gndvi`, `rvi`, `truecolor`.
- Cloud policy: Sentinel-2 scene cloud cover < 40% is “clean”; radar fallback uses Sentinel-1 RVI.
- Radar substitution is **NDVI-only**. NDWI/LSWI/SAVI/EVI/GNDVI return honest no-data.
- Field status comes from shared growth-stage logic:
  - `_shared/growthStage.ts`
  - `src/config.js` stage tables
- `ee-alerts-worker` tries a 14-day window first, widens to 90 days, then radar.
- `alerts_log.status` values: `healthy`, `below_expected`, `stressed`, `radar_flag`, `no_data`.
- Decision engine (Phase 1): `src/services/decision.js` + `_shared/decision.ts` convert that status + confidence + stage + rainfall + forecast + NDVI trend into `monitor` / `scout` / `act`. `act` requires a stressed reading with a clear time-sensitive reason; radar, no-data and low-confidence cap at `scout`.

---

## 9. Weather sources

- **Open-Meteo** — 5-day forecast at field centroid. Frontend + worker.
- **CHIRPS** — 21-day rainfall total in worker; monthly dry-month flags in `ee-data`.
- **GPM IMERG** — trailing rainfall in `ee-data` for the field panel.
- **DataEF** — official **current province conditions** only. Not a forecast.
  - `_shared/dataef.ts`
  - `dataef-weather` Edge Function
  - 30-minute cache, 8-second timeout, stale fallback
  - aliases for mismatched province names
  - `Stung Treng` currently has no working DataEF weather spelling

Never describe DataEF current conditions as a forecast. Open-Meteo is the only forecast.

---

## 10. CamDX layer

Admin lists are **static yearly reference data** seeded into Supabase. Do not call DataEF admin endpoints from the UI. Weather is live and goes through `dataef-weather`.

Seed workflow:

1. Run `migrations/018_admin_boundaries.sql` (already done on the current project).
2. Run files in `migrations/seed/` in numeric order.
3. Use `migrations/seed/verify_seed.sql` to identify MISSING/PARTIAL files.
4. Demo data: `migrations/seed/demo_shared_fields.sql`.
5. Role: `migrations/019_roles_and_commune_summary.sql`.

The SQL Editor rejects very large queries, so seed files are split into small chunks. Each file is an upsert by `code` and safe to re-run.

Demo data caveat: the demo seed is owned by the first `extension_viewer` profile. It creates `[DEMO]`-prefixed fields, all shared, with matching `alerts_log` rows. The summary function returns `includes_demo` so the UI can show “Includes demo data” without exposing names.

---

## 11. Mobile/UI conventions

- Dark theme with design tokens in `src/styles/design-tokens.css`.
- Panels use the `.panel` pattern.
- Mobile rule: **one surface at a time**.
  - Selecting a field closes the fields drawer.
  - Opening observations closes drawers.
  - Opening the fields drawer closes detail/observations.
- Time panel defaults collapsed on phones.
- Drawers are full-width on phones.
- Field detail is static inside `CollapsibleDrawer`; do not reintroduce a nested fixed/blur panel.
- `env(safe-area-inset-bottom)` and `55dvh` are used for the bottom sheet.
- Keep both `en.js` and `km.js` updated. Do not hard-code English in components.
- The government dashboard is lazy-loaded from the router.

---

## 12. Known gotchas / recent fixes

Do not reintroduce these:

- **Add-field bug:** `submitFieldForm` must pass `geojson` correctly to `saveField(name, geojson, plantingDate, cropRaw, location)`. This was broken and fixed.
- **Leaflet race:** Leaflet/leaflet-draw load from deferred CDN scripts. `LeafletMap.vue` waits for `window.L` and `L.Draw` before setup. Tile callbacks must tolerate `mapReg.map === null`.
- **Area switch:** selecting an AOI must detach the current field selection; otherwise the tile keeps rendering the field geometry.
- **Mobile overlay stacking:** do not auto-open the observations sheet and detail drawer together on phones.
- **Vite scan:** `vite.config.js` restricts `optimizeDeps.entries` to `index.html`; otherwise legacy prototype HTML causes a missing `three` dependency warning.
- **Caches:** `ee-data` server caches are split into three flags: `USE_EE_TILE_CACHE = true` (safe — keyed by `geometry_hash`), `USE_EE_TREND_CACHE = false` and `USE_EE_OBS_CACHE = false` (both keyed by `field_id` only; would serve stale values after a boundary edit until they gain a geometry hash or an edit-invalidation hook). Closed-month tile TTL is 2h, open-month 20min. Client caches are on: `USE_CHART_CACHE = true` (cleared on edit), weather 15-min cache, and `USE_AIM_CACHE = true` (key includes a geometry hash). Verify `ee_tile_cache` exists (run the `select`s in `015/016`) before relying on the tile cache.
- **Decision engine duplication + LLM contract:** `src/services/decision.js` and `supabase/functions/_shared/decision.ts` must stay identical (same pattern as `growthStage.ts`). The LLM may only phrase the result; it must never change the tier, urgency, or next step. `act` requires a stressed field; low-confidence/radar/no-data cap at `scout`.
- **Phase 1 deploy order:** deploy `consult-ai` and `ee-alerts-worker` together with the client build so the Telegram tier tag, AI prompt and the "What to do" card agree. Stale `consult-ai/index.js` and `ee-alerts-worker/index.js` duplicates still exist — confirm Supabase deploys the `.ts` entrypoints.
- **Phase 2 migration required:** run `migrations/020_feedback_loop.sql` before testing field checks or alert suppression. Without it, `field_observations` / `field_actions` inserts fail and the worker silently treats every field as unacknowledged.
- **Suppression is by latest acknowledgement:** the worker queries `field_actions` filtered to `done` / `snoozed` / `dismissed`, so a later `rated` row never cancels a snooze. Keep that filter when adding new statuses.
- **Triage uses cached client state:** `TodayTriage.vue` ranks from `fieldStatus` / `fieldTrends` already loaded and intentionally skips rainfall/forecast to avoid an Earth Engine fan-out, so a field's full decision can differ slightly until opened.
- **Telegram digest scope:** only the optical NDVI path is digested (one message per chat); `no_data` and radar messages still send individually. Item cap is 500 chars, total 3,800; omitted fields log `telegram_sent = false`.
- **PWA disabled intentionally:** manifest link and `attachPwa()` are commented out. Do not enable without dealing with stale service workers.
- **Secrets:** do not add service-role keys, bot tokens, or JWTs to code. `testcommand.txt` previously contained a bot token and anon JWT; rotate/delete it if it still exists.
- **Env mismatch:** `.env` uses `SUPABASE_URL` / `SUPABASE_ANON_KEY` without `VITE_`; `src/config.js` reads `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`, so hardcoded fallbacks are used.

---

## 13. Commands

```powershell
cd D:\SAAS\NDVI\ndvi-monitor

npm install
npm run dev
npm run build

# Edge Function deploys (account must have access to project wopwwtnvqyomiwbsxiks)
supabase functions deploy dataef-weather
supabase functions deploy consult-ai
supabase functions deploy ee-alerts-worker
supabase functions deploy trigger-alerts-worker

# Phase 2 feedback loop migration (run once on each database)
psql -v ON_ERROR_STOP=1 -f .\migrations\020_feedback_loop.sql

# Seed via psql, if using direct SQL
psql -v ON_ERROR_STOP=1 -f .\migrations\seed\001_admin_provinces.sql
# ... then 002, 003_*, 004_*
```

There is no lint/test script. `npm run build` is the basic verification.

---

## 14. Doc map

| File | Purpose |
|---|---|
| `ndvi-monitor/README.md` | Product overview / user-facing feature guide |
| `ndvi-monitor/docs/README.md` | Docs index |
| `ndvi-monitor/docs/PROJECT_CONTEXT.md` | This handoff |
| `ndvi-monitor/docs/roadmaps/CAMDX_HACKATHON_SPEC.md` | CamDX build spec |
| `ndvi-monitor/docs/reference/PROCESS.md` | Full build/phase log |
| `ndvi-monitor/docs/reference/current-process.md` | Recent debugging/deploy log |
| `ndvi-monitor/docs/reference/codebase-audit.md` | Deep read-only audit (2026-11-20) |
| `ndvi-monitor/docs/prompts/camdx-slide-deck-prompt.md` | Hackathon slide-deck prompt pack |

---

## 15. How to work with the owner

- Prefer full-file rewrites when replacing a file, and copy-paste-ready commands.
- Read the relevant file in full before changing it.
- Do not refactor unrelated code.
- Do not silently “fix” things outside the requested scope; report them at the end.
- Do not claim something is deployed/tested unless it was actually verified.
- Before schema changes, check the next free migration number.
- Before adding a new index, location field, or page, check RLS and role boundaries.
- Keep changes mobile-safe and bilingual.

---

## 16. Quick smoke test

After any significant change:

```text
1. npm run build
2. Sign in with email/password.
3. Confirm map loads and slider changes months.
4. Open a field; confirm detail panel, chart, rainfall and forecast.
5. Save a new field with location + consent; confirm codes in `fields`.
6. Switch areas; confirm the field deselects and the area renders.
7. As extension_viewer, open /government; confirm summary + demo notice.
8. As farmer, confirm /government redirects to /map.
9. Confirm a field with no province hides the DataEF card.
10. Confirm mobile shows one overlay at a time.
11. On the NDVI tab, confirm the "What to do" card shows a tier, action window and next steps; confirm a cloud-blocked/radar month never shows "Act now".
12. Run the alerts worker; confirm Telegram messages start with a `[Monitor]` / `[Check field]` / `[Act now]` tag.
13. Open a field → "I checked my field"; add a tag, an outcome and a photo; confirm it appears under "Field checks".
14. Tap "Snooze 3 days"; run the alerts worker and confirm that field is skipped while other fields still send.
15. Rate the card (thumbs up/down); confirm the feedback row is stored and does not cancel a snooze.
16. With 2+ fields, open the sidebar and confirm "Today" lists the top actionable fields; clicking one opens it.
17. With 2+ optical fields linked to the same Telegram chat, run the worker; confirm one combined digest message instead of one message per field.
```
