create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Store the service role key somewhere the cron job can reach it, without
-- putting it in the SQL text itself. Supabase Vault is the safer option:
select vault.create_secret('YOUR_SERVICE_ROLE_KEY', 'service_role_key');

-- Schedule: once daily. Cron times are UTC — 23:00 UTC = 06:00 Cambodia (UTC+7),
-- a sensible early-morning check before anyone's out in the field.
select cron.schedule(
  'ndvi-alerts-daily',
  '0 23 * * *',
  $$
  select net.http_post(
    url := 'https://wopwwtnvqyomiwbsxiks.functions.supabase.co/ee-alerts-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- To check it's registered:
select * from cron.job;

-- To unschedule later if needed:
-- select cron.unschedule('ndvi-alerts-daily');