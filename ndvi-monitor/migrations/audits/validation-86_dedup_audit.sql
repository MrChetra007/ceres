-- ============================================================================
-- Phase 8.6 — End-to-end dedup validation audit
-- Run in the Supabase SQL editor. Verify the worker produces exactly ONE
-- Telegram message per genuine status change (never zero, never five).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Sanity: is the daily cron job actually registered?
--    Expected: one row named 'ndvi-alerts-daily' with schedule '0 23 * * *'.
--    If empty, re-run migrations/003_cron_scheduled_worker.sql and check cron.job / net._http_response.
-- ---------------------------------------------------------------------------
select jobid, jobname, schedule, active
from cron.job
order by jobname;

-- ---------------------------------------------------------------------------
-- 2) The dedup source of truth: what does the worker believe is "last run"?
--    Per field, the most recent alerts_log.sent_at is what dedup compares to.
--    If two rows share the same timestamp (same-second inserts), the ordering
--    is unstable — watch this under stress.
-- ---------------------------------------------------------------------------
select field_id, count(*)                       as total_runs,
       count(message)                            as messages_sent,
       max(sent_at)                              as last_seen,
       string_agg(status, ' -> ' order by sent_at) as status_sequence
from alerts_log
group by field_id
order by last_seen desc nulls last;

-- helper severity, mirrors the worker's SEVERITY map (define before use)
create or replace function public.alert_severity(s text)
returns int language sql immutable as $$
  select case s
    when 'healthy' then 0
    when 'below_expected' then 1
    when 'stressed' then 2
    else -1
  end;
$$;

-- ---------------------------------------------------------------------------
-- 3) Dedup correctness: for each field, count transitions where status CHANGED
--    to a worse value vs. how many Telegram messages were sent. They must match.
--    Run this repeatedly across several days and confirm the message count does
--    NOT grow while the status stays flat.
-- ---------------------------------------------------------------------------
with seq as (
  select field_id,
         status,
         sent_at,
         lag(status) over (partition by field_id order by sent_at) as prev_status,
         message
  from alerts_log
)
select field_id,
       count(*)                                              as rows,
       count(*) filter (where message is not null)            as msgs_sent,
      count(*) filter (
  where prev_status is not null
    and status <> prev_status
    and public.alert_severity(status) > public.alert_severity(prev_status)
) as worsening_transitions,
       count(*) filter (where prev_status is not null
                          and status = prev_status
                          and message is not null)            as dup_msgs_on_flat
from seq
group by field_id;

-- ---------------------------------------------------------------------------
-- 4) last 25 raw rows for a sanity scroll (run this with a specific field filter)
-- ---------------------------------------------------------------------------
select field_id, status, ndvi_value, message, sent_at
from alerts_log
order by sent_at desc
limit 25;