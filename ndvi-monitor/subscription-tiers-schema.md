# Subscription tiers — schema & placeholder billing

## What this migration does

Adds subscription tiers, per-user usage limits, and a billing audit trail to
the existing `profiles`/`fields`/`aois` schema — without needing ABA PayWay
to actually be working yet. Everything here is designed so that when your
ABA sandbox access is finally unblocked, you plug a real webhook handler into
`set_subscription_tier()` and nothing else in the schema changes.

## The three tiers, as implemented

| | Free | Individual | Co-op |
|---|---|---|---|
| `max_aois` | 1 | 5 | 20 (raise manually for bigger co-ops) |
| `max_hectares` | 10 | 100 | 1000 (effectively uncapped at MVP stage) |
| `consult_ai_enabled` | false | true | true |
| Price | $0 | $5/mo | from $39/mo |

These live as real columns on `profiles`, not just hardcoded in app code —
so a pricing change is a one-line edit inside `set_subscription_tier()` in
the SQL, not a hunt through the frontend/Edge Functions.

## How to grant a tier RIGHT NOW (placeholder billing)

Since ABA PayWay's sandbox signup is still blocked, use this to manually
grant yourself or test users a tier — via the Supabase SQL editor, or wrap
it in a small admin-only RPC call from the app if you want a UI for it later:

```sql
select public.set_subscription_tier(
  '<profile-uuid>'::uuid,
  'individual',              -- 'free' | 'individual' | 'coop'
  'manual_grant',            -- always use 'manual_grant' until ABA is live
  'testing phase — granted manually while ABA PayWay sandbox is blocked'
);
```

This updates the profile's tier + limits AND writes a row to
`billing_events`, so you always have an audit trail of who has what and why —
including, later, being able to answer "how many of these are real ABA
payments vs. placeholder grants" at a glance:

```sql
select source, count(*) from profiles group by source;
```

## What happens when ABA PayWay is unblocked

Your future webhook handler (an Edge Function receiving ABA's payment
confirmation callback) calls the exact same `set_subscription_tier()`
function, just with `p_source := 'aba_payway'` and the real
`aba_transaction_id` recorded on the `billing_events` row instead of a null.
No schema changes needed at that point — this is the whole point of building
it this way now.

## What's deliberately NOT in this migration

**Hectare-cap enforcement.** `max_hectares` is stored on `profiles`, but
nothing currently *blocks* a user from exceeding it. Hectares are derived
from each field's `geojson` polygon area, which isn't something to compute
cleanly in plain Postgres without adding PostGIS — enforcing this belongs in
your application layer (e.g. a check in the Edge Function that handles field
creation, summing existing fields' area + the new one against
`profiles.max_hectares` before allowing the insert). Flagging this so it
doesn't silently stay unenforced — happy to write that check next.

**Co-op multi-member/staff roles.** `organizations` is intentionally bare —
just `id`, `name`, `owner_id`. There's no member list, no staff roles, no
"co-op owner invites farmers into their org" flow yet. This was a deliberate
scope call: you haven't had a real co-op conversation yet, and building a
full roles system before knowing what a co-op actually needs risks building
the wrong shape. When that conversation happens, extending this is an
additive migration on top of what's here — not a rewrite.

**Downgrade/cancellation flow.** The `event_type` enum on `billing_events`
already reserves `'downgrade'` and `'cancel'` values, but there's no
function/flow using them yet — worth building once you have your first real
paying user and need to handle what happens when they stop paying.

## Next steps, roughly in order

1. Run this migration.
2. Manually grant yourself `individual` or `coop` tier to test the app's
   entitlement gating (AOI cap, Consult AI access) works end-to-end.
3. Wire the frontend to actually *read* `profiles.subscription_tier` /
   `max_aois` / `consult_ai_enabled` and gate UI accordingly, if it doesn't
   already.
4. Add the hectare-cap enforcement check (flagged above).
5. Once ABA PayWay's sandbox works: build the webhook handler that calls
   `set_subscription_tier()` with real transaction data.
