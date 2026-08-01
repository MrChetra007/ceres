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
                        Cloud Scheduler ──> Python Cloud Function
                                            (earthengine-api + service account)
                                                 │
                                                 ▼
                                          Telegram Bot API
```

**Why Python for the scheduled worker, not a Supabase Edge Function:** Edge Functions run Deno, a
different runtime than the browser or Node. The app already hit one EE/bundler interop bug switching
off Vite (`Failed to locate function parameters`). Earth Engine's Python client with a service account
is the most mature, most documented path for server-side use — no reason to risk a second version of
that same problem in an even less-tested runtime.

---

## Phase 8.1 — Supabase schema & auth ⬜
- Create Supabase project (if not already), note project URL + anon key + service_role key
- Auth: start with **email magic link** (free, built into Supabase Auth, no SMS provider needed).
  Phone OTP is nicer for farmer-facing use but needs a paid SMS provider — defer that.
- Run `schema.sql` in the Supabase SQL editor
- **Checkpoint:** can sign up, log in, and see an empty `fields` list from Supabase in the Supabase
  dashboard table view

## Phase 8.2 — Migrate the app off localStorage ⬜
- Swap `saveField()` / `getSavedFields()` / `deleteField()` / `loadField()` to call Supabase instead
  of `localStorage` (same function names, new implementation — minimal blast radius on the rest of
  `app.js`)
- One-time import: on first login, if `localStorage` still has saved fields, offer to upload them to
  Supabase, then stop using localStorage for fields going forward
- **Checkpoint:** draw a field, refresh the page (or open on a different device, same login) — field
  persists via Supabase, not the browser

## Phase 8.3 — Telegram bot + account linking ⬜
- Create the bot via **@BotFather** in Telegram → get bot token → store as a secret (Supabase
  Vault or Cloud Function env var, never in client code)
- In-app: "Connect Telegram" button generates a short-lived code, shows a deep link
  `t.me/<YourBot>?start=<code>`
- Bot webhook (can be a tiny Supabase Edge Function just for this one piece — it's simple request/
  response, no Earth Engine involved) receives `/start <code>`, matches it in `link_codes`, saves
  `chat_id` onto the user's `profiles` row
- **Checkpoint:** tapping "Connect Telegram" in the app → messaging the bot → `profiles.telegram_chat_id`
  populates for that user

## Phase 8.4 — Earth Engine service account ⬜
- In the same GCP project (`gen-lang-client-0978198347`), create a service account, grant it Earth
  Engine access, download the JSON key
- Store the key as a Cloud Function secret — never commit it, never send it to the browser
- **Note:** still fine under the noncommercial/Community tier for a scheduled batch job at this scale.
  Revisit Earth Engine's commercial licensing *before* any paid co-op subscription goes live — the
  noncommercial tier explicitly excludes fee-for-service use.
- **Checkpoint:** a local Python script using `earthengine-api` + the service account key can
  authenticate and pull an NDVI value, no browser/OAuth popup involved

## Phase 8.5 — Scheduled worker (Python Cloud Function) ⬜
- Cloud Scheduler triggers the function on a cadence (start with **once daily** — rice stress doesn't
  move hour to hour, and it keeps Earth Engine usage low)
- Function logic:
  1. Query Supabase (via `service_role` key) for all fields where the owner has a `telegram_chat_id` set
  2. For each field: recompute NDVI + growth-stage-aware status — **port the same logic already
     working in `app.js`** (6-stage phenology thresholds, CHIRPS rainfall context), don't redesign it
  3. Compare new status to the *last logged* status for that field (see dedup logic below) —
     **only send a Telegram message on a status change**, not every single day. Daily "still stressed"
     pings are how people mute a bot within a week.
  4. Insert a row into `alerts_log`; call Telegram `sendMessage` if status changed for the worse
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

1. Supabase schema + auth — 2–3 days
2. Migrate app CRUD off localStorage — 2–3 days
3. Telegram bot + linking flow — 1–2 days
4. Earth Engine service account + Python Cloud Function skeleton — 2–3 days
5. Port stress-check logic to Python + wire up Telegram send — 3–4 days
6. End-to-end test + dedup tuning — 1–2 days

**Total: roughly 2–3 weeks of focused work.** Fits inside the AIM 2-month window alongside thesis/
teaching load, with time left over for pitch prep.

## Known risks to plan around
- **EE service-account auth** — mature in Python, but budget a day for first-time setup friction
  (IAM permissions, enabling the right APIs on the service account)
- **Alert fatigue** — the dedup logic above is a starting point; watch real usage and adjust the
  "worse than" comparison if it's too chatty or too quiet
- **EE noncommercial fee-for-service restriction** — fine for now, becomes a real line item the
  moment a co-op actually pays for this
- **Free tier limits** — Supabase free tier and a once-daily Cloud Function are both comfortably
  within free quotas at this scale; recheck if usage grows past a handful of test fields

---

## AI window (not built in this phase)

`buildAlertMessage()` in Phase 8.5 is deliberately a standalone function, not inline code, so that a
future AI/LLM layer can replace what's *inside* it (plain-language generation from the same status/
NDVI/rainfall/growth-stage inputs) without touching Supabase, the scheduler, or the Telegram send
logic. Do not build this now — only implement it if explicitly asked to start the AI phase.
