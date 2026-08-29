-- ============================================================================
-- Migration: Subscription tiers, usage limits, and placeholder billing
-- Adds to the existing schema (profiles, fields, aois, link_codes, alerts_log)
--
-- Scope decision (per discussion): MINIMAL multi-tenancy now.
--   - Free / Individual tiers work fully today, single-user, no org needed.
--   - `organizations` is a bare-bones forward-compat hook for the co-op tier —
--     just enough to attach a paying "co-op owner" account to, WITHOUT
--     building full staff/member roles yet. That gets designed later, after
--     a real co-op conversation, as an additive migration on top of this one.
--
-- Billing is PLACEHOLDER: ABA PayWay isn't wired up yet (sandbox blocked).
-- `set_subscription_tier()` below is the manual lever you use today (via
-- Supabase SQL editor, or wrapped in an admin-only RPC call from the app) to
-- grant/change a user's tier. When ABA is unblocked, the same function gets
-- called from your PayWay webhook handler instead of by hand — nothing else
-- in the schema needs to change.
-- ============================================================================

-- ── organizations (minimal, forward-compat only) ───────────────────────────
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table organizations enable row level security;

create policy "Owners can view own organization" on organizations
  for select using (auth.uid() = owner_id);
create policy "Owners can update own organization" on organizations
  for update using (auth.uid() = owner_id);
create policy "Owners can insert own organization" on organizations
  for insert with check (auth.uid() = owner_id);

-- ── profiles: subscription/tier columns ─────────────────────────────────────
-- Nullable FK now — most profiles will have organization_id = null (individual
-- users). Only a co-op's OWNER profile gets linked to an organizations row for
-- now; member/staff linking is deliberately deferred.
alter table profiles add column organization_id uuid references organizations(id) on delete set null;

alter table profiles add column subscription_tier text not null default 'free'
  check (subscription_tier in ('free', 'individual', 'coop'));

alter table profiles add column subscription_status text not null default 'active'
  check (subscription_status in ('active', 'trialing', 'past_due', 'canceled'));

-- How the current tier was granted. 'manual_grant' = you set it by hand while
-- ABA PayWay is blocked. 'aba_payway' = set by a real verified payment once
-- that's wired in. Keeping this distinct from the start means you can always
-- tell which active subscriptions were real payments vs. placeholder testing.
alter table profiles add column subscription_source text not null default 'none'
  check (subscription_source in ('none', 'manual_grant', 'aba_payway'));

alter table profiles add column subscription_renews_at timestamptz;

-- Usage limits live as real columns (not just derived from tier in app code)
-- so a single price/limit change never requires a migration — you update
-- these via set_subscription_tier()'s defaults below, or override a single
-- user's limits directly if you ever need a one-off exception.
alter table profiles add column max_aois integer not null default 1;
alter table profiles add column max_hectares numeric not null default 10;
alter table profiles add column consult_ai_enabled boolean not null default false;

-- ── billing_events: audit trail, placeholder-aware from day one ───────────
-- Every tier change — manual or (later) real ABA payment — gets logged here.
-- This is what lets you answer "how many of our 'paying' users are actually
-- real ABA transactions vs. placeholder grants" at any point, which matters
-- both for your own sanity and for an investor/AIM conversation about
-- traction.
create table billing_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  event_type text not null
    check (event_type in ('grant', 'renewal', 'downgrade', 'cancel', 'payment_received', 'payment_failed')),
  tier text not null check (tier in ('free', 'individual', 'coop')),
  source text not null default 'manual_grant'
    check (source in ('manual_grant', 'aba_payway')),
  aba_transaction_id text,           -- populated once ABA is wired in; null for placeholder grants
  amount numeric,
  currency text default 'USD',
  notes text,
  created_at timestamptz not null default now()
);

alter table billing_events enable row level security;

create policy "Users can view own billing events" on billing_events
  for select using (auth.uid() = profile_id);

-- No insert/update/delete policies for regular users — billing_events is
-- written only via set_subscription_tier() (security definer) or, later, your
-- ABA webhook handler using the service_role key. Regular users can read
-- their own history but never write it directly.

-- ── set_subscription_tier(): the placeholder billing lever ────────────────
-- Call this by hand today (Supabase SQL editor or an admin-only RPC wrapper)
-- to grant/change a tier. Applies the tier's default limits automatically —
-- edit the numbers in the `case` block below as your pricing evolves; that's
-- the ONE place tier defaults live, so a pricing change is a one-line edit
-- here, not a hunt through application code.
create or replace function public.set_subscription_tier(
  p_profile_id uuid,
  p_tier text,
  p_source text default 'manual_grant',
  p_notes text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max_aois integer;
  v_max_hectares numeric;
  v_consult_ai boolean;
begin
  if p_tier not in ('free', 'individual', 'coop') then
    raise exception 'invalid tier: %', p_tier;
  end if;

  -- Tier defaults — the single source of truth for current pricing limits.
  case p_tier
    when 'free' then
      v_max_aois := 1;
      v_max_hectares := 10;
      v_consult_ai := false;
    when 'individual' then
      v_max_aois := 5;
      v_max_hectares := 100;
      v_consult_ai := true;
    when 'coop' then
      v_max_aois := 20;       -- base co-op allotment; raise manually for larger co-ops for now
      v_max_hectares := 1000; -- effectively "no practical cap" at MVP stage
      v_consult_ai := true;
  end case;

  update profiles
  set
    subscription_tier = p_tier,
    subscription_status = 'active',
    subscription_source = p_source,
    subscription_renews_at = now() + interval '30 days',
    max_aois = v_max_aois,
    max_hectares = v_max_hectares,
    consult_ai_enabled = v_consult_ai
  where id = p_profile_id;

  insert into billing_events (profile_id, event_type, tier, source, notes)
  values (p_profile_id, 'grant', p_tier, p_source, p_notes);
end;
$$;

-- Example (run by hand today, e.g. to grant yourself/a test user 'individual'):
--   select public.set_subscription_tier(
--     '00000000-0000-0000-0000-000000000000'::uuid, -- profile id
--     'individual',
--     'manual_grant',
--     'testing phase — granted manually while ABA PayWay sandbox is blocked'
--   );

-- ── AOI limit: now tier-aware instead of a hardcoded 5 ─────────────────────
-- Replaces the fixed "max 5" check from the AOI migration with a per-user
-- limit read from profiles.max_aois, so free/individual/co-op each get their
-- own cap without touching this trigger again when pricing changes.
create or replace function public.enforce_aoi_limit() returns trigger as $$
declare
  v_limit integer;
begin
  select max_aois into v_limit from profiles where id = new.owner_id;
  if (select count(*) from aois where owner_id = new.owner_id) >= coalesce(v_limit, 1) then
    raise exception 'AOI limit reached for your current plan (max %)', v_limit;
  end if;
  return new;
end;
$$ language plpgsql;

-- Trigger already exists from the AOI migration and points at this same
-- function name, so no re-creation needed — this CREATE OR REPLACE is enough
-- to swap its behavior in place.

-- ============================================================================
-- NOT covered by this migration (see companion .md for why + what's next):
--   - Hectare-cap ENFORCEMENT (max_hectares is stored, but nothing currently
--     blocks a user from exceeding it — needs an application-layer check,
--     not a DB trigger, since hectares are derived from geojson polygon area)
--   - Co-op multi-member/staff roles (organizations table is intentionally
--     bare — no member list, no roles yet)
--   - Real ABA PayWay webhook handler calling set_subscription_tier()
--   - Downgrade/cancellation flow beyond the 'downgrade'/'cancel' event_type
--     enum values already reserved in billing_events
-- ============================================================================
