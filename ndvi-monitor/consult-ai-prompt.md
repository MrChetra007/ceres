# Add "Consult AI" button — AI Agronomist feature

## What's already done (backend)
- `ai_usage` table (per-user daily call counter, reset nightly via pg_cron)
- `ai_explanations` table (cache: one row per field, keyed on field_id)
- Edge Function `consult-ai` is deployed and live at:
  `https://wopwwtnvqyomiwbsxiks.functions.supabase.co/consult-ai`
- It requires a real logged-in user's Supabase JWT (not `--no-verify-jwt` — unlike
  the Telegram webhook and cron worker, this one checks `Authorization: Bearer <token>`)
- It expects a JSON body: `{ fieldId, ndviValue, lswiValue, rainfallMm, status, growthStage, dayCount, lang }`
- It returns: `{ ok: true, explanation: string, cached: boolean }` on success,
  or `{ ok: false, error: "daily_limit_reached" }` with HTTP 429 when the user
  has hit their daily cap (20/day), or a generic `{ ok: false, error }` on other failures

## What to build (frontend)

1. **Add a "Consult AI" button** to `FieldDetailPanel.vue`, visible only when a field
   is selected (not in the map-click-only view) — near the existing NDVI hero/stress
   card area.

2. **On click**, call the Edge Function:
   - Get the current session token from the Supabase client (`sbClient.auth.getSession()`)
   - POST to the `consult-ai` URL above with `Authorization: Bearer <access_token>`
   - Pass the field's current values already computed for the detail panel: NDVI,
     LSWI, 21-day rainfall, health status, growth stage label, and days-since-planting
   - Pass `lang` based on whichever language the UI is currently set to (reuse
     whatever language-state mechanism the app already has, or default to `"en"`
     if the app doesn't track a language preference yet)

3. **Loading state:** show a spinner or "Consulting AI..." while the request is in
   flight — this can take a few seconds since it's an LLM call.

4. **Display the response:**
   - Show the returned `explanation` text in a small card/panel below the button,
     styled consistent with the existing dark glass `.panel` design tokens
     (`--panel`, `--panel-border`, etc. from `style.css`)
   - If `cached: true` came back, no special UI needed — it should look identical
     to a fresh response, the caching is invisible to the user

5. **Handle the daily limit gracefully:**
   - If the response is `{ ok: false, error: "daily_limit_reached" }` (HTTP 429),
     show a friendly toast or inline message: "You've used today's AI explanations —
     more tomorrow." Do not show a raw error.

6. **Handle other failures gracefully:**
   - Any other `ok: false` response or network failure → toast:
     "Couldn't get an explanation right now — please try again." Never show the raw
     error string to the user.

7. **Don't auto-trigger this on field load** — it's an on-demand button click only,
   never called automatically, since every call costs against the user's daily
   quota and the shared API budget.

## Important constraints
- This is an LLM-generated explanation, not a diagnosis — if you add any UI framing
  text near the response (a label, a disclaimer), keep it consistent with how the
  rest of the app already talks about uncertainty (see the existing "Honesty note"
  language already used for growth-stage thresholds and stress alerts elsewhere
  in the app / help panel).
- Don't cache the response client-side beyond the current page session — the
  server-side cache in `ai_explanations` is the source of truth; always call the
  Edge Function fresh on each button click and let it decide whether to serve
  a cached answer.

## Acceptance
- Clicking "Consult AI" on a real field returns a plain-language explanation in
  the correct language within a few seconds
- Clicking it twice in a row on the same field (no data change) returns instantly
  (served from cache) — verify by checking whether `cached: true` comes back
- Clicking it 21+ times in one day (as one test user) correctly shows the daily
  limit message instead of erroring
- The explanation text never reads as a confident single-cause diagnosis — if it
  does, that's a prompt-tuning issue on the backend, not something to fix in the
  frontend
