# Phase 13 — AI Advisory, Ground-Truth Photos, Auto-Planting Detection

## Context

This is the NDVI Rice Crop Health Monitor (Cambodia). Current stack:
- Frontend: Vue 3 + Vite (`src/`), CDN-loaded Earth Engine + Leaflet
- Backend: Supabase (Postgres + Auth + Storage + Edge Functions)
- Existing Edge Functions: `consult-ai` (on-demand LLM field explanation, Gemini → DeepSeek → Qwen
  fallback chain), `telegram-webhook` (bot linking via `/start <code>`), `ee-alerts-worker`
  (daily pg_cron job: recomputes NDVI per field, dedups against `alerts_log`, sends Telegram
  alerts on worsening status)
- `ee-alerts-worker` currently builds alert text via `buildAlertMessage(status, ndviValue,
  rainfallMm, growthStage)` — a plain template function, deliberately left standalone so it can
  be swapped for LLM generation later. That "later" is now.

Do not touch: Consult AI's existing behavior/UI, the dedup/severity logic in the worker, the
Telegram linking flow in Phase 8.3, or any Earth Engine/Leaflet map logic. This phase only adds
the three features below.

Explicitly out of scope for this phase: TTS/voice alerts, harvest-window prediction, pest/disease
risk mapping, yield estimation, offline mode. Do not build these even if related code seems
convenient to add.

---

## Feature 1 — AI-Generated Telegram Advisory Text

**Goal:** Replace the flat template in `ee-alerts-worker`'s `buildAlertMessage()` with a real
LLM-generated explanation, using the same reasoning quality as Consult AI, in the farmer's
language (Khmer or English).

**Steps:**

1. Extract the provider-fallback orchestrator (`generateExplanation(prompt)` — tries Gemini →
   DeepSeek → Qwen, returns `{ text, model }`, never throws) out of `consult-ai/index.ts` into a
   shared module both Edge Functions can import (e.g. `supabase/functions/_shared/llm.ts`).
   Update `consult-ai` to import from the shared module — do not duplicate the logic.

2. In `ee-alerts-worker`, replace the call to `buildAlertMessage()` with a call to
   `generateExplanation()`, passing a prompt built from:
   - NDVI value and % change over the comparison window
   - LSWI value (moisture context)
   - CHIRPS rainfall (21-day trailing, mm)
   - Growth stage + day count (from the existing 6-stage phenology lookup)
   - Field name
   - Target language: `km` or `en` (see Feature 1b)

   Prompt shape (adapt wording, keep the reasoning task): given NDVI/LSWI/rainfall/growth-stage,
   infer the *likely* cause of a stress signal (drought vs. flood vs. normal-for-stage) and give
   one practical, cautious suggestion. Explicitly instruct the model: this is guidance to inform
   the farmer, not a diagnosis — never state a cause with certainty, always hedge language like
   "likely" / "could be."

3. Keep everything else in the worker untouched: the dedup logic, `SEVERITY` map, `alerts_log`
   insert-every-run behavior, and the "only send Telegram on a worsening transition" rule.
   The LLM only changes the *text* of the message that gets sent, never whether one is sent.

4. Handle LLM failure gracefully: if all three providers fail, fall back to the original plain
   `buildAlertMessage()` template rather than sending nothing or crashing the worker run.

5. Log which model answered (`model_used`) the same way `consult-ai` does, for internal auditing
   only — never expose this in the Telegram message.

### Feature 1b — Khmer Localization

1. Add a `preferred_language` column to `profiles` (default `'en'`), settable from the app (a
   simple toggle in the user menu or Telegram-linking modal is enough — don't over-build UI here).

2. Pass `preferred_language` into both `consult-ai` and `ee-alerts-worker` prompts so LLM output
   matches the farmer's language. Prompts should instruct the model to reply *entirely* in the
   requested language — no mixed-language output.

3. Audit farmer-facing UI strings (Telegram messages, `FieldDetailPanel.vue`, `AuthOverlay.vue`,
   `HelpModal.vue`) for hardcoded English that should be Khmer when `preferred_language = 'km'`.
   Scope: only strings a farmer would actually see during normal use — don't localize internal
   admin/dev-facing text.

---

## Feature 2 — Ground-Truth Photo Attachments

**Goal:** Let a farmer reply to a Telegram alert with a phone photo of their field; store it,
link it to the field and the alert that prompted it, and surface it in the app.

**Schema (`migrations/007_field_photos.sql`):**

```sql
create table field_photos (
  id uuid primary key default gen_random_uuid(),
  field_id uuid references fields(id) on delete cascade,
  owner_id uuid references auth.users(id) on delete cascade,
  storage_path text not null,
  alert_log_id uuid references alerts_log(id),
  caption text,
  created_at timestamptz default now()
);

alter table field_photos enable row level security;
create policy "owners can read their own photos" on field_photos
  for select using (auth.uid() = owner_id);
-- inserts happen via service_role from the Edge Function, not directly from the client
```

Create a **private** Supabase Storage bucket `field-photos`. Photos are read via signed URLs
generated server-side (or via an RLS-respecting client call) — never make the bucket public.

**Webhook changes (`telegram-webhook/index.ts`):**

1. Add a branch alongside the existing `/start <code>` handling: if the incoming update contains
   `message.photo`, handle it as a ground-truth photo instead of a linking code.

2. Telegram sends `photo` as an array of size variants — use the largest (`photo[photo.length-1]`).
   Call the Telegram Bot API `getFile` with its `file_id` to get a `file_path`, then download the
   bytes from `https://api.telegram.org/file/bot<TOKEN>/<file_path>`.

3. Upload the bytes to Supabase Storage: `field-photos/{owner_id}/{timestamp}.jpg`, using the
   `service_role` client (same pattern as the worker's Supabase access).

4. **Field linking logic:** look up the sender's `telegram_chat_id` → `profiles.id` (owner_id) →
   their `alerts_log` rows from the last 48 hours, ordered by recency.
   - If exactly one field has a recent alert, attach the photo to that field automatically.
   - If multiple fields have recent alerts, reply with an inline keyboard ("Which field is this
     photo from?" with field-name buttons) and wait for the callback before inserting the row.
     Handle the `callback_query` update type for this.
   - If no recent alert exists for that user at all, attach to their most recently active field
     if they only have one; otherwise ask via the same inline-keyboard pattern.

5. Insert the `field_photos` row (with `alert_log_id` if one was matched) once the field is
   resolved. Reply to the farmer confirming receipt, naming the field: e.g. "📸 Photo received
   for [Field name] — thanks, this helps us understand what's happening."

6. Handle the case where a photo arrives from a `chat_id` not linked to any account — reply
   asking them to link via `/start` first, don't silently drop it or crash.

**Frontend (`FieldDetailPanel.vue`):**

1. Add a small horizontal photo strip (thumbnails, newest first) below the existing field detail
   cards, populated from `field_photos` for the active field.

2. Generate signed URLs for display (short expiry, e.g. 1 hour) rather than exposing the bucket
   publicly. Fetch these when the panel loads for a field with photos, not eagerly for all fields.

3. Clicking a thumbnail opens it larger (reuse whatever modal/lightbox pattern already exists in
   the app, e.g. the `ChartModal.vue` pattern, if one fits — otherwise keep it minimal).

---

## Feature 3 — Auto-Planting-Date Detection (LSWI Spike)

**Goal:** Automatically estimate a field's planting/transplant date from a detectable LSWI spike
(dry soil → flooded field), pre-filling it instead of requiring manual entry.

**Steps:**

1. Add `detectPlantingDate(geometry)` to `src/services/earthEngine.js`:
   - Pull LSWI (`normalizedDifference(['B8', 'B11'])`) time series over the trailing ~90 days for
     the given field geometry, at whatever cadence available cloud-free scenes allow.
   - Find the point with the steepest positive week-over-week (or scene-to-scene) increase —
     dry soil (~0.0–0.2) jumping toward flooded (~0.4+) is the transplant signal.
   - Return `{ estimatedDate, deltaMagnitude }` — the date of the spike and how large the jump
     was, as a rough confidence signal (bigger jump = more confident).
   - If no clear spike is found (e.g. sparse cloud-free data, or the field was already flooded
     at the start of the window), return `null` rather than guessing — don't fabricate a date.

2. Wire into the save-field flow (`store.js`, wherever `saveField()` currently runs): if the
   farmer didn't manually enter a planting date, call `detectPlantingDate()` and pre-fill it if
   a result was returned. Show it in the UI as an estimate, not a fact — e.g. "Estimated from
   satellite data (tap to adjust)" — and let the farmer overwrite it exactly like a manual entry.

3. Don't auto-overwrite an existing manually-set planting date. Only use this to fill in a blank.
   If the farmer wants to re-run detection (e.g. new season, redrawn field), that should be an
   explicit action, not automatic.

4. This is a good validation opportunity: when Feature 2 photos come in, they can be manually
   cross-checked against the LSWI-estimated date during development to sanity-check the threshold
   before relying on it in the AIM demo. No code needed for this — just a manual QA step.

---

## Build Order

1. Feature 3 (LSWI detection) — self-contained, no new infra, good to validate first
2. Feature 1 (AI advisory + Khmer) — reuses existing `consult-ai` logic, moderate effort
3. Feature 2 (photo attachments) — most new surface area (schema, storage, webhook branching,
   inline keyboards) — do last since it depends on nothing above but has the most edge cases

## Acceptance Checklist

- [ ] `detectPlantingDate()` returns a sensible date on a real test field with known transplant
      timing, and `null` (not a wrong guess) when data is insufficient
- [ ] Telegram alert messages are LLM-generated, hedge appropriately, and respect
      `preferred_language`
- [ ] LLM failure falls back to the plain template instead of silently failing
- [ ] A photo sent to the bot is stored, linked to the correct field, and confirmed back to the
      farmer — including the multi-field disambiguation path
- [ ] Photos render in `FieldDetailPanel.vue` via signed URLs, bucket stays private
- [ ] `npm run build` passes; existing features (dashboard, compare, export, Consult AI, existing
      Telegram alerts) still behave identically
