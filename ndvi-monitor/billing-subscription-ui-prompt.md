# Task: Billing & subscription UI — tier display, settings, pricing page, paywalls, checkout, cancel

## Context
Ceres now has a subscription-tier schema in Supabase (`profiles.subscription_tier`,
`max_aois`, `max_hectares`, `consult_ai_enabled`, `subscription_status`,
`subscription_renews_at`, `subscription_source`, plus a `billing_events` audit table and a
`set_subscription_tier()` function). Real ABA PayWay billing is NOT wired up yet (their
sandbox signup is currently broken on their end) — tiers are being granted manually via
`set_subscription_tier()` in the meantime. Everything in this task should work fully against
that placeholder mechanism now, and swap to a real ABA PayWay checkout later without needing
a UI rewrite — only the "pay" button's destination changes.

Three tiers: **Free** (1 AOI, 10ha, no Consult AI), **Individual** ($5/mo — 5 AOIs, 100ha,
Consult AI), **Co-op** (from $39/mo — 20+ AOIs, ~1000ha, Consult AI, per-farmer pricing above
20). Exact copy/numbers may already exist elsewhere in the codebase (check before
hardcoding new ones — use whatever the current source of truth is).

## Scope — seven pieces, listed by rough priority

### 1. Current tier display (do this first — simplest, unblocks everything else)
Somewhere persistent and visible (settings page at minimum; a small badge in the main
app header/nav is a nice-to-have) show:
- Current tier name (Free / Individual / Co-op)
- Usage against limits, e.g. "3 / 5 AOIs used", "42 / 100 ha used"
- Read from `profiles.subscription_tier`, `max_aois`, `max_hectares` — actual AOI count and
  hectare usage need to be computed (AOI count = simple query; hectare usage needs summing
  actual field areas, which is NOT yet enforced anywhere in the backend — check whether a
  hectare-total helper already exists before writing a new one)

### 2. Billing section in Settings
A dedicated settings panel showing:
- Current plan name + price
- `subscription_status` (active / trialing / past_due / canceled) — shown in plain language,
  not the raw enum value
- `subscription_renews_at`, formatted as a real date
- Payment history: query `billing_events` for this user, show a simple list (date, event
  type, tier, source). Note `source` will show `manual_grant` for everyone right now — that's
  expected and fine, don't hide it, but don't need to expose the raw enum value to the user
  either (translate to something like "Granted for testing" vs "Payment received")
- An "Upgrade" or "Change plan" button that routes to the pricing page (see #3)
- A "Cancel subscription" action (see #7) — only shown for Individual/Co-op tiers, not Free

### 3. Pricing page (public-facing, on the landing page)
Three-column tier comparison card layout: Free / Individual / Co-op, with the actual
features and limits listed per tier (pull from the same source of truth as #1 — don't
duplicate numbers that could drift out of sync). Each card has a CTA button:
- Free → "Get started" (routes to signup)
- Individual → "Subscribe" (routes to checkout, see #5)
- Co-op → "Subscribe" or "Contact us" (co-op pricing is per-farmer above the 20-farmer base,
  so this may need a "starting at $39/mo" framing with a contact/inquiry path rather than a
  one-click checkout, at least for now)

If the user is already logged in and already on a tier, the pricing page should reflect that
(e.g. grey out / show "Current plan" on their existing tier's card instead of a generic CTA).

### 4. Paywall / upgrade prompts (the trickiest UX piece — spec this carefully)
When a user hits a limit or tries a gated feature, they should get a clear, non-punitive
prompt — never a silent failure, never a raw error message. Specific cases:

- **AOI limit reached** (backend already enforces this via the `enforce_aoi_limit` trigger,
  which raises a Postgres exception) — the frontend needs to catch this specific error and
  show a friendly modal/toast: "You've reached your plan's limit of N AOIs. Upgrade to
  [next tier] for more." with a button to the pricing page. Don't just surface the raw
  Postgres error text to the user.
- **Hectare limit** — not yet enforced anywhere (flagged as an open backend gap). If you
  build the frontend paywall for this before the backend check exists, make sad clearly
  marked as UI-only for now (e.g. a TODO comment) so it's not mistaken for a real limit once
  hectare enforcement actually ships.
- **Consult AI blocked** (`consult_ai_enabled = false`) — the Consult AI button/panel should
  show a locked state (not just hide the feature entirely — a visible-but-locked state
  communicates the value exists and drives upgrades) with an "Unlock with Individual or Co-op"
  prompt routing to pricing.

Keep the tone encouraging, not restrictive — this is a farmer/co-op trying to do something
useful, not a user being blocked for bad behavior.

### 5. Checkout flow
The actual "click to pay" screen/flow reached from Individual's pricing-page CTA. Since ABA
PayWay's sandbox is currently blocked, build this against a **placeholder checkout** for now:
- A simple confirmation screen showing what they're subscribing to and the price
- A "Confirm" button that, for now, can either (a) be disabled with a "Payments coming soon"
  note, or (b) if you want it testable end-to-end today, call an admin-gated version of
  `set_subscription_tier()` directly as a stand-in — but if you do this, make it VERY clearly
  marked in code/UI as temporary, since it must be removed/replaced the moment real ABA
  PayWay checkout is wired in. Don't let a placeholder "pay button" that doesn't actually
  charge anyone survive into production.
- Structure the component so the actual payment call is isolated in one clearly-named
  function/module (e.g. `initiatePayment()`) that's trivial to swap for a real ABA PayWay
  Purchase API call later without restructuring the surrounding UI.

### 6. Next payment / renewal display
Covered by #2 (settings billing section) — just make sure `subscription_renews_at` is shown
in a human-readable format ("Renews on March 15, 2027", not a raw ISO timestamp), and handle
the case where it's null gracefully (Free tier has no renewal date).

### 7. Cancel flow
Standard SaaS behavior: canceling should NOT immediately revoke access. The user keeps their
current tier's features until `subscription_renews_at` passes, then drops to Free
automatically. For now (no real billing), implement this as:
- A "Cancel subscription" button in settings billing section, with a confirmation step
  ("You'll keep [tier] access until [renewal date], then move to Free. Continue?")
- On confirm: set `subscription_status = 'canceled'` (do NOT change `subscription_tier` yet —
  they keep it until renewal), and log a `cancel` event to `billing_events`
- Note: there's currently no scheduled job that actually downgrades a canceled subscription
  once `subscription_renews_at` passes — flag this as a follow-up (likely a small pg_cron job
  similar to the existing alerts-worker cron, checking for `subscription_status = 'canceled'
  AND subscription_renews_at < now()` and calling `set_subscription_tier(..., 'free', ...)`).
  Don't build that cron job as part of this task unless asked — just leave the hook obvious.

## Out of scope for this task
- Do NOT build the real ABA PayWay Purchase API integration yet (their sandbox is blocked —
  separate task once that's unblocked)
- Do NOT build the hectare-cap backend enforcement (separate, already-flagged backend task)
- Do NOT build the co-op multi-member/staff invite flow (co-op checkout for now should be
  treated as "one paying owner account," consistent with the current minimal organizations
  schema)
- Do NOT build the pg_cron auto-downgrade-on-cancel job (flag it, don't build it, per #7)

## Deliverables
- Tier display component (settings + optional header badge)
- Settings billing section (plan, status, renewal date, payment history, upgrade/cancel
  buttons)
- Public pricing page/section on the landing page
- Paywall/upgrade prompt handling for AOI-limit and Consult-AI-locked cases (hectare-limit UI
  optional/marked TODO per above)
- Placeholder checkout flow, structured for an easy swap to real ABA PayWay later
- Cancel flow (status change only, no auto-downgrade job)
