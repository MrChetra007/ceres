-- ============================================================================
-- 019_roles_and_commune_summary.sql
-- CamDX Phase 4: extension-viewer role + privacy-safe commune summary.
--
-- Grant the role manually (SQL editor, as postgres). There is no self-serve
-- upgrade path:
--   update public.profiles
--   set role = 'extension_viewer'
--   where id = '<user-uuid>';
-- ============================================================================

-- 1. Role on profiles
alter table public.profiles
  add column if not exists role text not null default 'farmer'
  check (role in ('farmer', 'extension_viewer'));

-- 2. Users must NOT be able to change their own role. The existing "update own
--    profile" policy still lets them edit other profile columns; the trigger
--    blocks a role change made by an authenticated user.
create or replace function public.protect_profile_role() returns trigger
language plpgsql as $$
begin
  if new.role is distinct from old.role and auth.role() = 'authenticated' then
    raise exception 'role cannot be changed by the user';
  end if;
  return new;
end $$;

drop trigger if exists profiles_protect_role on public.profiles;
create trigger profiles_protect_role
  before update on public.profiles
  for each row execute function public.protect_profile_role();

-- 3. Commune-level summary. Only extension_viewer can call it. It reads ONLY
--    fields whose owner opted in (share_with_authorities = true) and returns no
--    field names, owner ids, geometry, or coordinates.
--
--    Groups with fewer than 3 fields are suppressed (counts null). The
--    includes_demo flag lets the UI show a demo-data notice without exposing
--    the underlying [DEMO] field names.
create or replace function public.get_commune_stress_summary(p_province_code text default null)
returns table (
  commune_code text,
  commune_name_en text,
  commune_name_kh text,
  district_code text,
  province_code text,
  field_count integer,
  healthy_count integer,
  below_expected_count integer,
  stressed_count integer,
  radar_flag_count integer,
  no_data_count integer,
  last_alert_at timestamptz,
  suppressed boolean,
  includes_demo boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from profiles p where p.id = auth.uid() and p.role = 'extension_viewer'
  ) then
    raise exception 'not authorized';
  end if;

  return query
  with latest as (
    select distinct on (a.field_id) a.field_id, a.status, a.sent_at
    from alerts_log a
    order by a.field_id, a.sent_at desc
  ),
  shared as (
    select f.commune_code as ccode,
           f.name as field_name,
           l.status,
           l.sent_at
    from fields f
    left join latest l on l.field_id = f.id
    where f.share_with_authorities = true
      and f.commune_code is not null
      and (p_province_code is null or f.province_code = p_province_code)
  ),
  agg as (
    select s.ccode,
           count(*)::int as n,
           count(*) filter (where s.status = 'healthy')::int as healthy,
           count(*) filter (where s.status = 'below_expected')::int as below_expected,
           count(*) filter (where s.status = 'stressed')::int as stressed,
           count(*) filter (where s.status = 'radar_flag')::int as radar_flag,
           count(*) filter (where s.status is null or s.status = 'no_data')::int as no_data,
           max(s.sent_at) as last_alert,
           bool_or(s.field_name like '[DEMO]%') as includes_demo
    from shared s
    group by s.ccode
  )
  select c.code, c.name_en, c.name_kh, c.district_code, c.province_code,
         case when a.n >= 3 then a.n end,
         case when a.n >= 3 then a.healthy end,
         case when a.n >= 3 then a.below_expected end,
         case when a.n >= 3 then a.stressed end,
         case when a.n >= 3 then a.radar_flag end,
         case when a.n >= 3 then a.no_data end,
         case when a.n >= 3 then a.last_alert end,
         (a.n < 3),
         coalesce(a.includes_demo, false)
  from agg a
  join admin_communes c on c.code = a.ccode
  order by c.province_code, c.district_code, c.code;
end;
$$;

revoke all on function public.get_commune_stress_summary(text) from public, anon;
grant execute on function public.get_commune_stress_summary(text) to authenticated;

-- Verify:
-- select * from public.get_commune_stress_summary();
