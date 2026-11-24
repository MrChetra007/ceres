-- ============================================================================
-- Migration: Phase 2 feedback loop
--   field_observations — "I checked my field" ground-truth records
--   field_actions      — append-only action/feedback log (done/snooze/dismiss/
--                        rated) used to suppress repeat Telegram alerts
--
-- Depends on: fields, profiles, alerts_log (baseline), field-photos bucket.
-- RLS is owner-only and mirrors the existing fields/alerts_log pattern.
-- Safe to re-run.
-- ============================================================================

-- ── field_observations: what the farmer actually saw ────────────────────────
create table if not exists public.field_observations (
  id           uuid primary key default gen_random_uuid(),
  field_id     uuid not null references public.fields(id) on delete cascade,
  owner_id     uuid not null references public.profiles(id) on delete cascade,
  observed_on  date not null default current_date,
  -- What was seen. 'none' means "checked, nothing unusual".
  tags         text[] not null default '{}'
               check (tags <@ array['water','weed','pest','disease','nutrient','other','none']::text[]),
  outcome      text not null default 'unknown'
               check (outcome in ('improved','same','worse','unknown')),
  notes        text,
  -- Optional photo in the existing private `field-photos` bucket, path
  -- convention {owner_id}/{timestamp}.jpg (same as the Telegram photo flow).
  photo_path   text,
  source       text not null default 'app' check (source in ('app','telegram')),
  created_at   timestamptz not null default now()
);

create index if not exists idx_field_observations_field
  on public.field_observations (field_id, created_at desc);
create index if not exists idx_field_observations_owner
  on public.field_observations (owner_id);

alter table public.field_observations enable row level security;

drop policy if exists "field_observations_owner_select" on public.field_observations;
create policy "field_observations_owner_select" on public.field_observations
  for select using (owner_id = auth.uid());

drop policy if exists "field_observations_owner_insert" on public.field_observations;
create policy "field_observations_owner_insert" on public.field_observations
  for insert with check (
    owner_id = auth.uid()
    and exists (
      select 1 from public.fields f
      where f.id = field_id and f.owner_id = auth.uid()
    )
  );

drop policy if exists "field_observations_owner_update" on public.field_observations;
create policy "field_observations_owner_update" on public.field_observations
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "field_observations_owner_delete" on public.field_observations;
create policy "field_observations_owner_delete" on public.field_observations
  for delete using (owner_id = auth.uid());

-- ── field_actions: append-only action + feedback log ────────────────────────
-- The alerts worker reads the most recent row per field to decide whether a
-- repeat Telegram message would just be nagging:
--   snoozed   -> skip until snooze_until
--   dismissed -> skip for 7 days
--   done      -> skip for 3 days
--   rated     -> feedback only, never suppresses
create table if not exists public.field_actions (
  id             uuid primary key default gen_random_uuid(),
  field_id       uuid not null references public.fields(id) on delete cascade,
  owner_id       uuid not null references public.profiles(id) on delete cascade,
  alert_id       uuid references public.alerts_log(id) on delete set null,
  decision_tier  text check (decision_tier in ('monitor','scout','act')),
  action_key     text,
  status         text not null default 'done'
                 check (status in ('done','snoozed','dismissed','rated')),
  useful         boolean,       -- alert usefulness (thumbs up/down), null if unrated
  reason         text,          -- why it was not useful / free note
  snooze_until   timestamptz,
  notes          text,
  created_at     timestamptz not null default now()
);

create index if not exists idx_field_actions_field
  on public.field_actions (field_id, created_at desc);
create index if not exists idx_field_actions_owner
  on public.field_actions (owner_id);

alter table public.field_actions enable row level security;

drop policy if exists "field_actions_owner_select" on public.field_actions;
create policy "field_actions_owner_select" on public.field_actions
  for select using (owner_id = auth.uid());

drop policy if exists "field_actions_owner_insert" on public.field_actions;
create policy "field_actions_owner_insert" on public.field_actions
  for insert with check (
    owner_id = auth.uid()
    and exists (
      select 1 from public.fields f
      where f.id = field_id and f.owner_id = auth.uid()
    )
    and (
      alert_id is null
      or exists (
        select 1 from public.alerts_log a
        join public.fields f2 on f2.id = a.field_id
        where a.id = alert_id and f2.owner_id = auth.uid()
      )
    )
  );

-- Append-only: no update/delete policies for authenticated users.

notify pgrst, 'reload schema';
