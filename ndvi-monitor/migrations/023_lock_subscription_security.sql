-- 023_lock_subscription_security.sql
-- 1) Users can no longer edit billing / entitlement columns on their own profile.
-- 2) Privileged functions can no longer be called by anon or signed-in users.
-- Safe to re-run.

begin;

-- 1. Column guard -------------------------------------------------------------
-- Uses current_user (not auth.role()) so that SECURITY DEFINER functions such as
-- cancel_my_subscription() can still update these columns.
-- This function must stay SECURITY INVOKER.
create or replace function public.protect_profile_billing()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated') and (
       new.subscription_tier      is distinct from old.subscription_tier
    or new.subscription_status    is distinct from old.subscription_status
    or new.subscription_source    is distinct from old.subscription_source
    or new.subscription_renews_at is distinct from old.subscription_renews_at
    or new.max_aois               is distinct from old.max_aois
    or new.max_hectares           is distinct from old.max_hectares
    or new.consult_ai_enabled     is distinct from old.consult_ai_enabled
    or new.organization_id        is distinct from old.organization_id
    or new.role                   is distinct from old.role
  ) then
    raise exception 'billing and role fields cannot be changed by the user'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_billing on public.profiles;
create trigger profiles_protect_billing
  before update on public.profiles
  for each row execute function public.protect_profile_billing();

-- 2. Service-role-only functions ---------------------------------------------
-- Revoking from "authenticated" alone is not enough: PUBLIC still grants EXECUTE.
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'set_subscription_tier',
        'upgrade_my_subscription',
        'finalize_aba_payment',
        'redeem_link_code',
        'cleanup_expired_link_codes'
      )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.signature);
    execute format('grant execute on function %s to service_role', f.signature);
  end loop;

  -- Users may still cancel their own plan, but anonymous callers may not.
  for f in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'cancel_my_subscription'
  loop
    execute format('revoke all on function %s from public, anon', f.signature);
    execute format('grant execute on function %s to authenticated, service_role', f.signature);
  end loop;
end;
$$;

commit;

-- Check 1: anon and authenticated should be false for all except
-- cancel_my_subscription (authenticated = true).
select p.proname,
       has_function_privilege('anon', p.oid, 'execute')          as anon_can,
       has_function_privilege('authenticated', p.oid, 'execute') as user_can
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('set_subscription_tier','upgrade_my_subscription','finalize_aba_payment',
                    'redeem_link_code','cleanup_expired_link_codes','cancel_my_subscription')
order by 1;

-- Check 2: look for accounts that already have a paid plan.
select id, subscription_tier, subscription_status, subscription_source, max_aois, max_hectares
from public.profiles
where subscription_tier <> 'free' or max_aois > 1 or max_hectares > 10 or consult_ai_enabled;
