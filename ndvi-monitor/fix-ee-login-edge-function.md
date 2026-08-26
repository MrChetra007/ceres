# Fix: Remove per-user Google/Earth Engine login requirement for NDVI rendering

## Context

The app already has a working Earth Engine **service account** (`EE_SERVICE_ACCOUNT_KEY`
Supabase secret), authenticated server-side inside `ee-alerts-worker` via
`authenticateViaPrivateKey`. That worker never needs a user to be logged in.

However, the **interactive map** (time slider, click-to-inspect, compare mode, dry-month
markers, planting-date detection) still authenticates Earth Engine client-side in the
browser via `ee.data.authenticateViaOauth(CLIENT_ID, ...)`. That OAuth flow only succeeds
for a Google account that is itself registered for Earth Engine access — i.e. only your
own account. Any other visitor's Google sign-in fails to render NDVI, even though they can
sign into the app fine via Supabase Google OAuth.

**Goal:** move all direct browser→Earth Engine calls behind a new Edge Function that
authenticates with the existing service account. The browser should never call
`ee.data.authenticateViaOauth` or talk to Earth Engine directly again. The separate
"Sign in with Google (Earth Engine)" button/flow should be removed entirely — Supabase
Google OAuth remains the only sign-in.

## Scope — what to build

### 1. New Edge Function: `supabase/functions/ee-data/index.ts`

A single JWT-required Edge Function (Deno, `npm:@google/earthengine@0.1.395`, same
service-account auth pattern as `ee-alerts-worker`) that exposes the EE operations the
frontend currently does client-side. Use an `action` field in the POST body to route:

| action | replaces (current frontend function) | inputs | output |
|---|---|---|---|
| `getIndexTile` | `loadIndexTile()` | `index` (ndvi/ndwi/lswi), `year`, `month`, `geometry` (GeoJSON) | `{ mode: 'index'|'cloud_blocked'|'no_data', count, url, cloudPct?, lastValidDate? }` |
| `getIndexTimeSeries` | click-to-inspect trend chart | `lat`, `lng`, `index` | array of `{ date, value }` |
| `getFieldStatus` | dashboard health badge (`reduceRegion`) | `geometry`, `plantingDate?` | `{ ndviValue, status, stage }` — reuse existing growth-stage logic |
| `getRainfall` | `getRainfallMm()` (CHIRPS 21-day) | `geometry`, `endDate` | `{ mm }` |
| `getDryMonths` | `fetchDryMonths()` | `geometry`, `months[]` | `{ dryMonths: [...] }` |
| `detectPlantingDate` | `detectPlantingDate()` (LSWI spike) | `geometry` | `{ estimatedDate, deltaMagnitude } \| null` |

Notes:
- Authenticate Earth Engine once per invocation using the same `EE_SERVICE_ACCOUNT_KEY`
  secret `ee-alerts-worker` already uses — do not create a second secret.
- Verify the caller's Supabase JWT (`verify_jwt = true` or manual check) so this isn't an
  open proxy — any signed-in app user may call it, no extra allowlist needed.
- Port the existing cloud-cover logic verbatim from `src/services/earthEngine.js`
  (`<40` clean / `>=40` cloud-blocked, true-color fallback, 90-day lookback for
  `lastValidDate`) — behavior must not change, only where it runs.
- Port the growth-stage-aware status logic (`RICE_GROWTH_STAGES`, `buildStatusObject`) —
  same source of truth `ee-alerts-worker` already has a copy of; consider extracting both
  into `supabase/functions/_shared/growthStage.ts` so the worker and this new function
  don't drift out of sync.
- Tile responses (`getMap()` URLs) are short-lived signed URLs from Earth Engine itself —
  don't try to cache or proxy the actual tile bytes, just return the URL for Leaflet to
  fetch directly (this is fine; the URL itself doesn't require the browser to be
  EE-authenticated, only the request that *generated* it does).

### 2. Frontend rewrite: `src/services/earthEngine.js`

- Delete `ee.data.authenticateViaOauth(...)` / `ee.initialize(...)` and the EE OAuth
  Client ID usage entirely.
- Delete the `<script>`-tag load of the Earth Engine JS client if nothing else in the
  bundle needs it client-side.
- Replace every function in this file that currently calls `ee.*` directly with a
  `fetch()` call to `ee-data`, passing the Supabase access token from `requireSession()`
  (same helper `insertField`/`insertAoi` already use) as the `Authorization: Bearer` header
  and the appropriate `action` + payload from the table above.
- Keep function signatures/names the same where possible (`loadIndexTile()`,
  `getRecentIndexValue()`, `getNdviTimeSeriesAtPoint()`, `getRainfallMm()`,
  `fetchDryMonths()`, `detectPlantingDate()`) so calling code elsewhere (`store.js`,
  `FieldDetailPanel.vue`, `TimeControl.vue`) doesn't need to change beyond await/error
  handling for network calls instead of direct EE calls.

### 3. Remove the Earth-Engine-specific auth UI

- Remove the second "Sign in with Google" button/flow that was specifically for Earth
  Engine (Phase 8.1 added one for Supabase + one for EE — keep only the Supabase one).
- Remove the EE OAuth token from `localStorage` handling (`eeReady` gating can now simply
  mean "app is authenticated with Supabase", since EE calls no longer need a separate
  client-side ready state).
- Update the "How this works" explanation modal if it references signing into Earth Engine
  directly.

### 4. Error handling

- `ee-data` should return clear JSON errors (`{ error: 'invalid_geometry' }`, etc.) with
  appropriate HTTP status codes — mirror the `400 missing_data` / `429` pattern already
  used in `consult-ai`.
- Frontend should surface a toast on failure the same way it already does for Consult AI
  and rainfall-unavailable states — no new UX pattern needed, reuse the existing toast
  system.

## Out of scope (do not touch)

- `ee-alerts-worker` — already uses the service account correctly, no changes needed
  except optionally sharing `_shared/growthStage.ts` if you extract it.
- `consult-ai`, `telegram-webhook`, `_shared/llm.ts` — unrelated to this fix.
- Supabase Google OAuth for app sign-in — keep as-is, this is not what's broken.

## Done when

- A fresh Google account that has never touched Earth Engine can sign into the app via
  Supabase and see the NDVI map, time slider, click-to-inspect chart, dashboard health
  badges, and dry-month markers — all without any Earth-Engine-specific
  login prompt appearing.
- The developer's own EE-registered Google account is no longer special-cased anywhere in
  the frontend.
