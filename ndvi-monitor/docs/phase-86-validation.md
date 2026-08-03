# Phase 8.6 — End-to-end dedup validation runbook

Goal: confirm the scheduled worker produces **exactly one** Telegram message per
genuine status change for a test field — never zero, never five — across several
real runs.

Reference: `NDVI_Master_Roadmap.md` §5.6–5.7, `PROCESS.md` Phase 8.5/8.6.
Tooling: `validation-86.sql`, `scripts/trigger-alerts-worker.sh`.

## The dedup contract being validated

From the roadmap §5.7 and `ee-alerts-worker/index.ts`:

| Scenario | expected messages |
|---|---|
| healthy → below_expected (worsening) | 1 |
| below_expected → stressed (worsening) | 1 |
| persistent stress (status unchanged) | **0** (this is the dedup) |
| recovery stressed → healthy | 0 (improvement — not an alert) |

## Setup

1. Ensure the daily job is live — run `validation-86.sql` query #1; a row named
   `ndvi-alerts-daily` (schedule `0 23 * * *`) must exist.
2. Create a **test field** in the app (draw a polygon over a real rice paddy).
3. In the app, link Telegram for the signed-in account (bot deep link flow).
4. Note the field id: `select id, name from fields;`

## Option A — real-time (wait for the daily run)

Simply let `ndvi-alerts-daily` fire each day at 23:00 UTC (06:00 Cambodia) for
5–7 days on the test field. After each run run `validation-86.sql` query #3 and
check `msgs_sent == worsening_transitions` and `dup_msgs_on_flat == 0`.

## Option B — manual trigger (faster, recommended)

Runs the worker on demand so multiple data points are collected in minutes
instead of days — you are simulating what the cron job does, so use the **same**
service_role token and body:

```bash
bash scripts/trigger-alerts-worker.sh
# or, passing the key read from Vault another way
SERVICE_ROLE_KEY="<your key>" bash scripts/trigger-alerts-worker.sh
```

Run it 3–5 separate times, spacing them out, and confirm with query #3 that the
**message count does not grow across identical-status runs** (this is the dedup
proof).

> The manual trigger and the cron both hit the same function with a service_role
> bearer, so dedup behavior is identical. The cron remains the real "multi-day"
> validation; the manual trigger just lets you see it converge quickly.

## Deliberately forcing a stress signal

NDVI drops come from real cloud cover / season — you don't need to fabricate one.
To make a *reproducible* change for testing:

1. **Worsening:** the worker uses a 30-day S2 median. A field whose recent window
   has heavy cloud returns `nd = 0` → status `stressed`. Running the worker when
   clouds hit produces a genuine worsening, which is a legitimate test trigger.
2. **Recovery:** wait for clearer imagery so NDVI returns → status improves →
   **no** message (verifies the recovery-silence rule).

## Pass criteria

- `validation-86.sql` #1: cron job present.
- `validation-86.sql` #3: per field, `msgs_sent == worsening_transitions`.
- `validation-86.sql` #3: `dup_msgs_on_flat == 0`.
- Across 3+ manual runs with an unchanged status, `msgs_sent` stays flat
  (no growth).
- The Telegram chat receives one message per genuine worsening, and NO message
  on recovery or on flat status.

## When this passes

Update `PROCESS.md` Phase 8.6 → ✅ Complete, and `NDVI_Master_Roadmap.md` §5.6
status. That closes the last open backend item.