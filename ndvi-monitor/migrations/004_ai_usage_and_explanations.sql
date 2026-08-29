-- Daily AI usage tracking per user
create table ai_usage (
  user_id uuid primary key references profiles(id) on delete cascade,
  calls_today int not null default 0,
  last_reset date not null default current_date
);

alter table ai_usage enable row level security;
create policy "Users can view own ai usage" on ai_usage
  for select using (auth.uid() = user_id);

-- Cache: one row per field, overwritten each time the underlying data actually changes
create table ai_explanations (
  field_id uuid primary key references fields(id) on delete cascade,
  ndvi_value numeric,
  status text,
  explanation text not null,
  created_at timestamptz not null default now()
);

alter table ai_explanations enable row level security;
create policy "Users can view own field explanations" on ai_explanations
  for select using (
    exists (select 1 from fields where fields.id = ai_explanations.field_id and fields.owner_id = auth.uid())
  );

-- Nightly reset via pg_cron (reuses the extensions already enabled for the alerts worker)
select cron.schedule(
  'ai-usage-daily-reset',
  '0 17 * * *',  -- UTC 17:00 = 00:00 Cambodia — midnight reset
  $$ update ai_usage set calls_today = 0, last_reset = current_date; $$
);