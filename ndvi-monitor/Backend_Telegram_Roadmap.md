# NDVI Rice Crop Health Monitor — Phase 8: Supabase Backend + Telegram Alerts

### Start here if you've already read `master_roadmap.md`. This is the next phase, in progress.

**Scope of this phase:** move saved fields from browser localStorage to Supabase, and add scheduled
server-side stress checks that push Telegram alerts. The AI/LLM advisory layer is **explicitly not
being built in this phase** — see "AI window" note at the end. Don't add it unless asked.

Schema lives in the companion file `schema.sql` — run that in Supabase before starting Phase 8.2.

---

## 0. What changes architecturally

Today (per master_roadmap.md): everything runs in the browser. A user opens the OAuth popup, Earth
Engine computes NDVI live, saved fields sit in that browser's `localStorage`. No server, no always-on
process.

After this phase: fields live in Supabase (Postgres), so any device/staff member with login can see
them. A **separate, small Python service** (Cloud Function or Cloud Run, not part of the web app) runs
on a schedule, re-checks each saved field's stress status using a Google service account (no user has
to be logged in), and messages Telegram when something's wrong.

```
Browser app (existing)  <──────>  Supabase (Postgres + Auth)
                                          ▲
                                          │  service_role key (read fields, write alerts)
                                          │
                    Supabase pg_cron ──> SQL fn ──> Edge Function
                                            (earthengine-api + service account)
                                                  │
                                                  ▼
                                           Telegram Bot API
```

**Scheduling choice:** the scheduled worker runs as a **Supabase pg_cron job** that calls a
**Supabase Edge Function** (Deno) via `net.http_post` — this avoids a separate Cloud Scheduler +
Python service entirely and keeps everything inside Supabase. Note the deviation from the earlier
Python plan: Edge Functions run Deno, a different runtime than the browser or Node. The app already
hit one EE/bundler interop bug switching off Vite (`Failed to locate function parameters`). The
Earth Engine **Node** client (`@google/earthengine`) supports service-account auth and is importable
in Deno, but that import is the one real risk to verify before building Phase 8.5 — if it fails, fall
back to Python (Cloud Function) with pg_cron still driving the trigger via `net.http_post`.

---

## Phase 8.1 — Supabase schema & auth ✅
- Supabase project `https://wopwwtnvqyomiwbsxiks.supabase.co` (anon key in `.env` / `app.js`)
- Auth: **Google OAuth** (single provider — email magic-link/password forms removed; Earth Engine keeps its own separate Google OAuth popup)
- `schema.sql` updated: `fields.owner_id` now defaults to `auth.uid()`, added `set_updated_at()` trigger
- App: supabase-js CDN added, auth overlay reworked into a dark-glass card with one "Sign in with Google" button for Supabase + one for Earth Engine, user menu with sign-in/sign-out, `onAuthStateChange` auto-loads fields and areas
- **Checkpoint:** can sign in with Google and see an empty `fields` list from Supabase in the Supabase dashboard table view

## Phase 8.2 — Migrate the app off localStorage ✅
- `saveField()` / `getSavedFields()` / `deleteField()` / `loadField()` / `loadFieldById()` now use Supabase (`fieldsCache` in-memory mirror + async CRUD); same function names, new implementation
- New `updateField(id, patch)` handles area recalc (on `EDITED`) and planting-date edits
- One-time import: `importLocalFieldsIfAny()` uploads existing `ndvi_fields` localStorage on first login, then clears it
- `updateFieldStatus()` guarded by `eeReady` so dashboard renders before EE init
- **Checkpoint:** draw a field, refresh the page (or open on a different device, same login) — field persists via Supabase, not the browser

## Phase 8.3 — Telegram bot + account linking ✅ (implemented in the repo; needs deployment)
- Create the bot via **@BotFather** in Telegram → get bot token → store as a secret (Supabase
  Vault or Cloud Function env var, never in client code)
- In-app: "Telegram alerts" entry in the top-right user menu opens a modal that generates a
  short-lived code and shows a deep link `t.me/<bot>?start=<code>` (bot username from
  `VITE_TELEGRAM_BOT_USERNAME` / `TELEGRAM_BOT_USERNAME` in `src/config.js`); the app polls the
  user's `profiles.telegram_chat_id` every 3s until it links, then shows "Connected"
- Bot webhook = **Supabase Edge Function** `supabase/functions/telegram-webhook/index.ts`
  (Deno, `verify_jwt = false`): receives `/start <code>`, matches it in `link_codes` (via
  `service_role`, which bypasses RLS — no public select-by-code policy exists), and redeems it
  through the `redeem_link_code()` RPC (migration2.sql) which atomically sets the user's
  `telegram_chat_id` and marks the code used
- `migration2.sql` also adds a guard trigger so a logged-in user can only ever *clear* their
  `telegram_chat_id` (disconnect) — the actual chat id is set only by the bot
- Deploy steps: run `migration2.sql` in the SQL editor → `supabase functions deploy
  telegram-webhook` → `supabase secrets set TELEGRAM_BOT_TOKEN=...` → register the webhook
  `https://wopwwtnvqyomiwbsxiks.functions.supabase.co/telegram-webhook` via Telegram's
  `setWebhook` API
- **Checkpoint:** tapping "Telegram alerts" in the app → messaging the bot → `profiles.telegram_chat_id`
  populates for that user

## Phase 8.4 — Earth Engine service account ⬜
- In the same GCP project (`gen-lang-client-0978198347`), create a service account, grant it Earth
  Engine access, download the JSON key
- Store the key as a Supabase Edge Function secret (`supabase secrets set EE_SERVICE_ACCOUNT_JSON=...`)
  — never commit it, never send it to the browser
- **Note:** still fine under the noncommercial/Community tier for a scheduled batch job at this scale.
  Revisit Earth Engine's commercial licensing *before* any paid co-op subscription goes live — the
  noncommercial tier explicitly excludes fee-for-service use.
- **Checkpoint:** a script using `earthengine-api` (Node/Deno) + the service account key can
  authenticate and pull an NDVI value, no browser/OAuth popup involved

## Phase 8.5 — Scheduled worker (Supabase pg_cron + Edge Function) ⬜
- **Scheduling:** use a **Supabase pg_cron job** (Postgres scheduling, no separate Cloud Scheduler) —
  `cron.schedule(...)` fires a SQL function each day; that function calls the worker via
  `net.http_post` (the `supabase_http` extension), which needs a `service_role`-signed JWT for the
  function (or `verify_jwt = false` on the function). Start with **once daily** — rice stress doesn't
  move hour to hour, and it keeps Earth Engine usage low.
- **Worker = a Supabase Edge Function** (Deno) instead of a Python Cloud Function:
  1. Authenticate Earth Engine with the service-account key (`@google/earthengine` Node client
     supports service-account auth and is importable in Deno — verify this first, it's the one real
     risk vs. Python)
  2. Query Supabase (via `service_role` key) for all fields where the owner has a `telegram_chat_id` set
  3. For each field: recompute NDVI + growth-stage-aware status — **port the same logic already
     working in `app.js`** (6-stage phenology thresholds, CHIRPS rainfall context), don't redesign it
  4. Compare new status to the *last logged* status for that field (see dedup logic below) —
     **only send a Telegram message on a status change**, not every single day. Daily "still stressed"
     pings are how people mute a bot within a week.
  5. Insert a row into `alerts_log`; call Telegram `sendMessage` if status changed for the worse
- **Build the alert text as a template function, not an inline string** —
  `buildAlertMessage(status, ndviValue, rainfallMm, growthStage)` returns the message. This is the
  hook for the AI layer later — see "AI window" note below.
- **Checkpoint:** manually trigger the function once, confirm a Telegram message arrives for a field
  you've deliberately set to a stressed state

## Phase 8.6 — End-to-end test ⬜
- Let the scheduled job run for a few real days on your own test field
- Confirm: no duplicate alerts, no missed alerts, dedup logic holds up, Telegram message content is
  legible in Khmer/English as needed
- **Checkpoint:** a real stress event on your test field produces exactly one Telegram message, not
  zero and not five

---

## Dedup logic (decides whether a status change actually sends a message)

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

---

## Suggested build order & rough time

1. Supabase schema + auth — done ✅
2. Migrate app CRUD off localStorage — done ✅
3. Telegram bot + linking flow — implemented ✅ (needs deployment: `migration2.sql`, function deploy, token secret, webhook registration)
4. Earth Engine service account — create in GCP, store JSON as Edge Function secret
5. Verify `@google/earthengine` imports & authenticates in Deno (the key risk — see scheduling note above)
6. Scheduled worker: pg_cron → `net.http_post` → Edge Function that ports the app's stress-check logic + sends Telegram — 3–4 days
7. End-to-end test + dedup tuning — 1–2 days

**Remaining roughly 1–1.5 weeks of focused work.** Fits inside the AIM 2-month window alongside thesis/
teaching load, with time left over for pitch prep.

## Known risks to plan around
- **EE service-account auth in Deno** — the `@google/earthengine` Node client is the key risk; budget a
  day for first-time setup friction (IAM permissions, enabling the right APIs, Deno import). If it
  fails, fall back to a Python Cloud Function with pg_cron still triggering via `net.http_post`
- **pg_cron → function auth** — the SQL job must call the Edge Function with a `service_role`-signed
  JWT (or the function runs `verify_jwt = false`); test the HTTP call before wiring the schedule
- **Alert fatigue** — the dedup logic above is a starting point; watch real usage and adjust the
  "worse than" comparison if it's too chatty or too quiet
- **EE noncommercial fee-for-service restriction** — fine for now, becomes a real line item the
  moment a co-op actually pays for this
- **Free tier limits** — Supabase free tier and a once-daily job are both comfortably
  within free quotas at this scale; recheck if usage grows past a handful of test fields

---

## AI window (not built in this phase)

`buildAlertMessage()` in Phase 8.5 is deliberately a standalone function, not inline code, so that a
future AI/LLM layer can replace what's *inside* it (plain-language generation from the same status/
NDVI/rainfall/growth-stage inputs) without touching Supabase, the scheduler, or the Telegram send
logic. Do not build this now — only implement it if explicitly asked to start the AI phase.
