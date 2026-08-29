-- ============================================================================
-- Migration: Subscription self-service RPCs (UI layer for placeholder billing)
-- Depends on migration add_subscription_tiers.sql (set_subscription_tier(),
-- profiles.subscription_* columns, billing_events table).
--
-- Why these exist: regular users only have SELECT on billing_events (no
-- insert/update policies), so the app can't write tier changes itself. These
-- security-definer RPCs are the narrow, safe channel the frontend uses:
--   1. upgrade_my_subscription()  — the PLACEHOLDER checkout gate. Grants a
--      higher tier WITHOUT any payment until ABA PayWay is wired in. Anyone
--      signed in can call it, which is intentionally permissive *only* while
--      billing is fake. Delete this function the day real ABA checkout ships.
--   2. cancel_my_subscription()   — sets status='canceled' and logs a cancel
--      event. Keeps the user's tier until subscription_renews_at passes (the
--      actual downgrade-to-free still needs the pg_cron job flagged as a
--      follow-up; not built here).
-- ============================================================================

-- ── upgrade_my_subscription: TEMPORARY placeholder checkout ────────────────
-- Grants 'individual' or 'coop' directly, logging a manual_grant billing
-- event, so the UI is end-to-end testable today. When ABA PayWay is unblocked,
-- this whole function is replaced by a webhook handler — the UI's
-- initiatePayment() destination swaps, nothing else changes.
create or replace function public.upgrade_my_subscription(p_tier text) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  if p_tier not in ('individual', 'coop') then
    raise exception 'invalid tier: %', p_tier;
  end if;

  -- TEMPORARY: grants a paid tier with no payment while ABA PayWay is blocked.
  -- MUST be removed/replaced when the real ABA Purchase API is wired in.
  perform public.set_subscription_tier(
    auth.uid(),
    p_tier,
    'manual_grant',
    'placeholder checkout — no real payment (ABA PayWay not wired yet)'
  );
end;
$$;

grant execute on function public.upgrade_my_subscription(text) to authenticated;

-- ── cancel_my_subscription ─────────────────────────────────────────────────
-- Standard SaaS behavior: marks the subscription canceled but keeps the tier
-- active until subscription_renews_at passes, then the (not-yet-built) pg_cron
-- job drops them to Free. Logs a 'cancel' billing_events row.
create or replace function public.cancel_my_subscription() returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tier text;
  v_status text;
  v_source text;
  v_notes text;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;

  select subscription_tier, subscription_status, subscription_source
  into v_tier, v_status, v_source
  from profiles
  where id = auth.uid();

  if v_tier is null then
    raise exception 'nothing to cancel';
  end if;
  if v_tier = 'free' then
    raise exception 'the free plan has nothing to cancel';
  end if;
  if v_status = 'canceled' then
    raise exception 'already canceled';
  end if;

  update profiles
  set subscription_status = 'canceled'
  where id = auth.uid();

  insert into billing_events (profile_id, event_type, tier, source, notes)
  values (
    auth.uid(),
    'cancel',
    v_tier,
    coalesce(nullif(v_source, 'none'), 'manual_grant'),
    'user canceled — keeps ' || v_tier || ' access until renewal, then drops to free'
  );
end;
$$;

grant execute on function public.cancel_my_subscription() to authenticated;