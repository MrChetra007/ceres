-- ============================================================================
-- NDVI Rice Crop Health Monitor — Supabase schema
-- Phase 8.1 of Backend_Telegram_Roadmap.md
-- Run this in the Supabase SQL editor on a fresh project (or via migration).
-- ============================================================================

-- profiles: one row per app user, extends Supabase auth.users
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  co_op_name text,
  telegram_chat_id text unique,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;
create policy "Users can view own profile" on profiles
  for select using (auth.uid() = id);
create policy "Users can update own profile" on profiles
  for update using (auth.uid() = id);

-- auto-create a profile row whenever someone signs up
create function public.handle_new_user() returns trigger as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- fields: replaces the localStorage field store
create table fields (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  geojson jsonb not null,
  area_ha numeric,
  planting_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table fields enable row level security;
create policy "Users can view own fields" on fields
  for select using (auth.uid() = owner_id);
create policy "Users can insert own fields" on fields
  for insert with check (auth.uid() = owner_id);
create policy "Users can update own fields" on fields
  for update using (auth.uid() = owner_id);
create policy "Users can delete own fields" on fields
  for delete using (auth.uid() = owner_id);

-- link_codes: short-lived one-time codes for the Telegram linking flow
create table link_codes (
  code text primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  expires_at timestamptz not null,
  used boolean not null default false,
  created_at timestamptz not null default now()
);

alter table link_codes enable row level security;
create policy "Users can view own link codes" on link_codes
  for select using (auth.uid() = user_id);
create policy "Users can create own link codes" on link_codes
  for insert with check (auth.uid() = user_id);
-- Note: the Telegram bot webhook that redeems a code (Phase 8.3) runs as a
-- Supabase Edge Function using the service_role key, which bypasses RLS —
-- it needs to look up a code by its value alone, without a logged-in user
-- attached to that request. No public "select by code" policy is added here
-- on purpose; that's what would let someone enumerate codes.

-- alerts_log: history + the dedup source of truth for the scheduled worker
create table alerts_log (
  id uuid primary key default gen_random_uuid(),
  field_id uuid not null references fields(id) on delete cascade,
  status text not null,        -- 'healthy' | 'below_expected' | 'stressed'
  ndvi_value numeric,
  message text,
  chat_id text,
  sent_at timestamptz not null default now()
);

alter table alerts_log enable row level security;
create policy "Users can view own field alerts" on alerts_log
  for select using (
    exists (
      select 1 from fields
      where fields.id = alerts_log.field_id
      and fields.owner_id = auth.uid()
    )
  );

-- ============================================================================
-- Note on the Python Cloud Function's access: it should use the Supabase
-- service_role key (bypasses RLS), since it needs to read every field with a
-- linked Telegram chat, not just one user's own rows. Never expose the
-- service_role key to the browser — it lives only in the Cloud Function's
-- environment.
-- ============================================================================