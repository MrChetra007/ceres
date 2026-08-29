-- ============================================================================
-- Migration: Area of Interest (AOI) — per-user, multiple per user
-- Adds to the existing schema from Phase 8.1 (profiles, fields, link_codes, alerts_log)
-- ============================================================================

create table aois (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references profiles(id) on delete cascade,
  name text not null,
  bounds jsonb not null,   -- { west, south, east, north } — same shape as current aoiCoords
  created_at timestamptz not null default now()
);

alter table aois enable row level security;

create policy "Users can view own aois" on aois
  for select using (auth.uid() = owner_id);
create policy "Users can insert own aois" on aois
  for insert with check (auth.uid() = owner_id);
create policy "Users can update own aois" on aois
  for update using (auth.uid() = owner_id);
create policy "Users can delete own aois" on aois
  for delete using (auth.uid() = owner_id);

-- soft cap: 5 AOIs per user, enforced at the DB level so it can't be bypassed client-side
create function public.enforce_aoi_limit() returns trigger as $$
begin
  if (select count(*) from aois where owner_id = new.owner_id) >= 5 then
    raise exception 'AOI limit reached (max 5 per user)';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger aois_enforce_limit
  before insert on aois
  for each row execute procedure public.enforce_aoi_limit();

-- optional, non-destructive grouping: a field can (optionally) belong to an AOI
alter table fields add column aoi_id uuid references aois(id) on delete set null;