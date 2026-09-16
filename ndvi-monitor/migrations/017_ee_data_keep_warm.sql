-- Keep the `ee-data` Edge Function warm so a signed-in user's first map load
-- doesn't pay the cold-start + Earth Engine auth cost (the service-account
-- JWT access token expires after ~1h, and ee-data refreshes it at a 45-min TTL).
--
-- Uses the same cron + pg_net + Vault pattern as 003_cron_scheduled_worker.sql:
-- a service-role ping to the ee-data `ping` action. The platform gateway JWT
-- check accepts the service-role token (verify_jwt is on by default), and the
-- handler runs ensureEE() before dispatching, so each ping re-authenticates the
-- Earth Engine session when needed.
--
-- Every 20 minutes keeps the ping inside the 45-minute EE session TTL while
-- leaving plenty of idle budget for the free tier.

-- If the vault secret from migration 003 is missing on a fresh project, create
-- it first (same value used by the alerts worker):
-- select vault.create_secret('YOUR_SERVICE_ROLE_KEY', 'service_role_key');

select cron.schedule(
  'ee-data-keep-warm',
  '*/20 * * * *',
  $$
  select net.http_post(
    url := 'https://wopwwtnvqyomiwbsxiks.functions.supabase.co/ee-data',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := jsonb_build_object('action', 'ping')
  );
  $$
);

-- To check it's registered:
-- select * from cron.job;

-- To unschedule later:
-- select cron.unschedule('ee-data-keep-warm');