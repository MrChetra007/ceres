-- ============================================================================
-- Migration: Guarantee fields/aois RLS policies exist (incl. INSERT)
-- Fixes: "new row violates row-level security policy for table \"fields\"" on
-- insert, in case the live database is missing the insert policy (e.g. the
-- table was created via the dashboard, which only auto-generates SELECT).
-- Safe to re-run: drops and recreates the policies idempotently.
-- Run ONLY if the client-side auth fix does not resolve the error.
-- ============================================================================

alter table fields enable row level security;

drop policy if exists "Users can insert own fields" on fields;
create policy "Users can insert own fields" on fields
  for insert with check (auth.uid() = owner_id);

drop policy if exists "Users can view own fields" on fields;
create policy "Users can view own fields" on fields
  for select using (auth.uid() = owner_id);

drop policy if exists "Users can update own fields" on fields;
create policy "Users can update own fields" on fields
  for update using (auth.uid() = owner_id);

drop policy if exists "Users can delete own fields" on fields;
create policy "Users can delete own fields" on fields
  for delete using (auth.uid() = owner_id);

alter table aois enable row level security;

drop policy if exists "Users can insert own aois" on aois;
create policy "Users can insert own aois" on aois
  for insert with check (auth.uid() = owner_id);

drop policy if exists "Users can view own aois" on aois;
create policy "Users can view own aois" on aois
  for select using (auth.uid() = owner_id);

drop policy if exists "Users can update own aois" on aois;
create policy "Users can update own aois" on aois
  for update using (auth.uid() = owner_id);

drop policy if exists "Users can delete own aois" on aois;
create policy "Users can delete own aois" on aois
  for delete using (auth.uid() = owner_id);

-- Verify the policies on the live DB:
select tablename, policyname, cmd, qual, with_check
from pg_policies
where tablename in ('fields', 'aois')
order by tablename, cmd;
