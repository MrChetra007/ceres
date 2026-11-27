-- 024_harvest_date.sql
-- Adds an optional harvest date to a field. Once today is on/after this date the
-- app shows "Harvested", suppresses the health/action UI, and the alerts worker
-- and Today triage skip the field. Earlier readings remain visible.
-- Safe to re-run.

alter table public.fields
  add column if not exists harvest_date date;

-- A harvest cannot precede planting. Both sides are nullable: a field may have
-- no planting date yet, and a harvest date is optional.
alter table public.fields
  drop constraint if exists fields_harvest_date_after_planting;
alter table public.fields
  add constraint fields_harvest_date_after_planting
  check (
    harvest_date is null
    or planting_date is null
    or harvest_date >= planting_date
  );

comment on column public.fields.harvest_date is
  'Optional harvest date. On/after this date the field is treated as harvested: no health status/action tier, and skipped by alerts and triage.';

notify pgrst, 'reload schema';
