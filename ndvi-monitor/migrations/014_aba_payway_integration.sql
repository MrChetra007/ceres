-- ============================================================================
-- Migration: ABA PayWay integration (real checkout replaces placeholder billing)
-- Depends on migrations/012_subscription_tiers.sql (set_subscription_tier(),
-- profiles.subscription_* columns, billing_events table) and
-- migrations/013_subscription_self_service_rpc.sql (upgrade_my_subscription(),
-- cancel_my_subscription()).
--
-- What this adds:
--   1. subscription_prices  — single source of truth for tier -> amount/currency,
--      so pricing lives in data, not hardcoded in an Edge Function.
--   2. payment_transactions — one row per ABA PayWay attempt (pending -> approved
--      /failed), keyed by our own tran_id, auditable, idempotent.
--   3. finalize_aba_payment() — security-definer RPC the webhook Edge Function
--      calls (service_role only) to atomically record the ABA result and, on
--      success, call the existing set_subscription_tier() so tier-change logic
--      and billing_events logging stays in exactly one place.
--   4. Locks down upgrade_my_subscription() — the placeholder "grant tier with
--      no payment" gate from 013 — so the app can no longer call it now that
--      real checkout exists. Function is kept (not dropped) for support/manual
--      grants via service_role, per the comment in 013 that flagged this as
--      temporary.
--
-- Nothing here talks to ABA directly — all HTTP calls to PayWay live in Edge
-- Functions (initiate-payment, aba-payway-webhook), consistent with the
-- ee-data pattern of proxying external APIs server-side with secrets in Vault.
-- ============================================================================

-- ── subscription_prices: source of truth for what each tier costs ──────────
-- tier is a free-standing key (not FK'd to profiles.subscription_tier, which
-- is a plain unconstrained text column per 012/013 — confirmed: it has no
-- unique constraint, so it can't be a FK target). Validity of tier values is
-- instead enforced at the call sites (finalize_aba_payment's own p_tier check,
-- and upgrade_my_subscription's existing `p_tier not in ('individual','coop')`
-- guard), same way 013 already does it.
create table if not exists public.subscription_prices (
  tier        text primary key,
  amount      numeric(10,2) not null check (amount >= 0),
  currency    text not null default 'USD' check (currency = 'USD'), -- ABA sandbox: USD only for now
  updated_at  timestamptz not null default now()
);

insert into public.subscription_prices (tier, amount, currency) values
  ('individual', 5.00, 'USD'),
  ('coop',       39.00, 'USD')
on conflict (tier) do nothing;

alter table public.subscription_prices enable row level security;

create policy "anyone can read prices"
  on public.subscription_prices for select
  to authenticated
  using (true);
-- No insert/update/delete policy for authenticated — prices are edited by
-- service_role / SQL editor only.

-- ── payment_transactions: one row per ABA PayWay attempt ───────────────────
create table if not exists public.payment_transactions (
  id               uuid primary key default gen_random_uuid(),
  profile_id       uuid not null references public.profiles(id) on delete cascade,
  tier             text not null references public.subscription_prices(tier),
  tran_id          text not null unique,           -- our tran_id, sent to ABA
  amount           numeric(10,2) not null,
  currency         text not null default 'USD',
  status           text not null default 'pending'
                   check (status in ('pending', 'approved', 'failed', 'refunded')),
  apv              text,                            -- ABA approval code, once known
  payway_status_code text,                          -- raw ABA status field from callback
  raw_callback     jsonb,                            -- full verified pushback payload, for audits
  req_time         text not null,                    -- yyyyMMddHHmmss sent to ABA (needed to rebuild hash if re-checking status)
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_payment_transactions_profile_id
  on public.payment_transactions (profile_id);

create index if not exists idx_payment_transactions_status
  on public.payment_transactions (status)
  where status = 'pending'; -- fast lookup for a reconciliation job to sweep stale pending rows

alter table public.payment_transactions enable row level security;

create policy "users can read their own payment transactions"
  on public.payment_transactions for select
  to authenticated
  using (profile_id = auth.uid());
-- No insert/update/delete policy for authenticated: rows are only ever
-- written by Edge Functions using the service_role key (initiate-payment
-- inserts the pending row; the webhook finalizes it via the RPC below).

create trigger set_payment_transactions_updated_at
  before update on public.payment_transactions
  for each row execute function public.set_updated_at();
-- If you don't already have a generic set_updated_at() trigger function from
-- an earlier migration, replace this with an inline trigger or drop it —
-- updated_at still defaults correctly without it, this just keeps it fresh
-- on every row change.

-- ── finalize_aba_payment: the one place a callback becomes a tier change ───
-- Called by the aba-payway-webhook Edge Function AFTER it has verified the
-- X-PAYWAY-HMAC-SHA512 signature. Idempotent: calling it twice for the same
-- tran_id (ABA can retry callbacks) is a safe no-op the second time.
create or replace function public.finalize_aba_payment(
  p_tran_id            text,
  p_payway_status_code text,   -- ABA's "status" field, e.g. '0' = success
  p_apv                text,
  p_raw_callback       jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_txn record;
  v_new_status text;
begin
  select * into v_txn
  from payment_transactions
  where tran_id = p_tran_id
  for update; -- lock the row; avoids a race if ABA fires the callback twice concurrently

  if not found then
    raise exception 'unknown tran_id: %', p_tran_id;
  end if;

  if v_txn.status != 'pending' then
    -- Already finalized (duplicate callback) — no-op, not an error.
    return;
  end if;

  v_new_status := case when p_payway_status_code = '0' then 'approved' else 'failed' end;

  update payment_transactions
  set status              = v_new_status,
      apv                 = p_apv,
      payway_status_code  = p_payway_status_code,
      raw_callback        = p_raw_callback
  where tran_id = p_tran_id;

  if v_new_status = 'approved' then
    -- Reuses the exact tier-change + billing_events logging path that
    -- upgrade_my_subscription() used for placeholder grants — same function,
    -- now driven by a real payment instead of a manual grant.
    perform public.set_subscription_tier(
      v_txn.profile_id,
      v_txn.tier,
      'aba_payway',
      format('ABA PayWay purchase %s approved (apv %s, %s %s)',
             p_tran_id, p_apv, v_txn.amount, v_txn.currency)
    );
  end if;
end;
$$;

-- service_role only — this is invoked from the webhook Edge Function after
-- signature verification, never directly by a signed-in user.
revoke all on function public.finalize_aba_payment(text, text, text, jsonb) from public, authenticated;
grant execute on function public.finalize_aba_payment(text, text, text, jsonb) to service_role;

-- ── Lock down the placeholder checkout gate from 013 ────────────────────────
-- upgrade_my_subscription() granted a tier with no payment while ABA was
-- blocked. Real checkout now exists, so the app must stop calling it. Kept
-- (not dropped) for service_role / support use — e.g. comping an account —
-- per the "delete the day real ABA checkout ships" comment in 013; deleting
-- outright would break any support tooling still referencing it.
revoke execute on function public.upgrade_my_subscription(text) from authenticated;
grant execute on function public.upgrade_my_subscription(text) to service_role;

comment on function public.upgrade_my_subscription(text) is
  'LOCKED DOWN in 014: no longer callable by authenticated users now that ABA '
  'PayWay checkout is live. service_role only — for manual/support grants.';