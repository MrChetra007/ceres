# ABA PayWay Sandbox Integration — Implementation Instructions

Run `014_aba_payway_integration.sql` first (Supabase SQL editor, in order after 013).
This document covers everything outside the schema: two Edge Functions, one
optional reconciliation function, and the frontend `initiatePayment()` swap.

**Approach: server-side Purchase API with ABA KHQR + deeplink, not the
`AbaPayway.checkout()` hosted popup.** This matches how people actually pay
ABA in Cambodia (scan a QR or tap a deeplink into ABA Mobile — most users
already have the app) and avoids depending on a third-party widget script.
The trade-off is no built-in card/WeChat/Alipay support; add Hosted Checkout
later as a second `payment_option` if needed — nothing in the schema below
assumes one flow over the other.

## 0. Before you start

**Credential mapping** — ABA's sandbox email issues five items, but only two
are used by this integration:

| Emailed as      | Maps to                                                                                                                                                                                       | Used here?                           |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Merchant Id     | `ABA_MERCHANT_ID`                                                                                                                                                                             | Yes                                  |
| Public Key      | `ABA_API_KEY` — this is the HMAC-SHA512 secret. ABA's own docs confusingly name this variable `$public_key` in their PHP examples even though it's a symmetric secret, never actually public. | Yes                                  |
| API Url         | `ABA_API_BASE_URL`                                                                                                                                                                            | Yes                                  |
| RSA Public Key  | Encrypts `merchant_auth` for Refund / Pre-auth completion / Pre-auth cancellation endpoints                                                                                                   | **Not used** by anything in this doc |
| RSA Private Key | Paired with the RSA Public Key above                                                                                                                                                          | **Not used** by anything in this doc |

Store the two credentials that matter as Supabase Edge Function secrets,
never in frontend code:

```
supabase secrets set ABA_MERCHANT_ID=<Merchant Id>
supabase secrets set ABA_API_KEY=<Public Key>
supabase secrets set ABA_API_BASE_URL=https://checkout-sandbox.payway.com.kh
```

`ABA_API_BASE_URL` is the one thing that changes for production later
(`https://checkout.payway.com.kh`) — never hardcode the sandbox host.
Hold onto the RSA key pair for a future refund/pre-auth feature; nothing
here calls for it yet.

Currency is fixed at USD (matches the $5 / $39 pricing already in
`subscription_prices`).

**Whitelist your callback domain with PayWay before testing.** The
`return_url` (your `aba-payway-webhook` Edge Function URL) must be
registered against your merchant profile with PayWay's integration team, or
callbacks silently never arrive — no error, ABA just never calls it. If
you're testing locally, expose your Edge Function via a public HTTPS tunnel
(ngrok or similar) and whitelist _that_ domain. Free-tier ngrok assigns a new
random domain on every restart, so it needs re-whitelisting each time unless
you're on a paid static domain — worth requesting a static one from PayWay's
team if local testing is ongoing, rather than re-whitelisting repeatedly.

**`req_time` format is `YYYYMMDDHHmmss` (UTC) for every ABA endpoint** —
Purchase, Check Transaction, all of them. Don't use a Unix timestamp for any
of them; ABA's own samples are consistent on this even where third-party
example code sometimes gets it wrong.

## 1. Edge Function: `initiate-payment`

Replaces the body of the current placeholder `initiatePayment()` call target.
Runs with the user's JWT (not service_role) to identify who's paying, then
uses service_role internally to write the pending row and call ABA.

**Steps the function performs:**

1. Read `p_tier` from the request body (`'individual'` or `'coop'`). Reject
   anything else with a 400 — never trust a client-supplied amount.
2. Look up the price from `subscription_prices` server-side:
   `select amount, currency from subscription_prices where tier = p_tier`.
   This is the only source of truth for `amount` — the amount ABA charges
   must come from here, not from the request body.
3. Generate `tran_id` — must be unique per attempt. Use something like
   `${auth.uid().slice(0,8)}-${Date.now()}` or `crypto.randomUUID()`.
4. Generate `req_time` as `YYYYMMDDHHmmss` (UTC), e.g. `20260831143000`.
5. Insert a `pending` row into `payment_transactions` using the service-role
   client (`profile_id = auth.uid()`, `tier`, `tran_id`, `amount`, `currency`,
   `req_time`) **before** calling ABA — if the ABA call fails partway, you
   still have a record of the attempt.
6. Build the full ABA Purchase payload. Required + relevant optional fields,
   **in this exact order** — this order is what gets hashed, not just
   what gets sent:

   ```
   req_time, merchant_id, tran_id, amount, items, shipping,
   firstname, lastname, email, phone, type, payment_option,
   return_url, cancel_url, continue_success_url, return_deeplink,
   currency, custom_fields, return_params, payout, lifetime,
   additional_params, google_pay_token, skip_success_page
   ```

   For this integration:
   - `type` = `"purchase"`
   - `payment_option` = `"abapay_khqr"` — this is what makes ABA respond with
     a QR string + image + ABA Mobile deeplink instead of an HTML checkout
     page. This is the key field distinguishing this flow from Hosted
     Checkout.
   - `items` = base64-encoded JSON, e.g.
     `base64(JSON.stringify([{ name: "Ceres — " + tier + " plan", quantity: 1, price: amount }]))`
   - `return_url` = your whitelisted `aba-payway-webhook` Edge Function URL
     (server-to-server pushback — fires regardless of `payment_option`, so
     this is still your source of truth for confirming payment)
   - `cancel_url` / `continue_success_url` — still required fields in the
     hash even though the customer never leaves your app in this flow; pass
     your billing page URL for both, they just won't be visited
   - `shipping` = `"0"` — must be a numeric string, not an empty string; ABA
     rejects `""` here with `code 10, "Wrong shipping price."` even though
     most of the other unused fields accept `""` fine
   - `return_params` = a JSON string containing at least
     `{"profile_id": "<uuid>", "tier": "<tier>"}` — ABA echoes this back
     verbatim in the callback, giving you a second, independent cross-check
     against the `payment_transactions` row you already have keyed by `tran_id`
   - Leave `custom_fields`, `payout`, `additional_params`,
     `google_pay_token`, `return_deeplink` as empty strings `""` — **do not
     omit them from the concatenation**, the hash must include every field
     position even when empty
   - `lifetime` — QR validity window in minutes; 15–30 is reasonable (KHQR
     scans happen fast; default is 30 days if unset, far too long)
   - `skip_success_page` — irrelevant to this flow (no page is shown), pass
     `"0"` for consistency with the hash

7. Compute the hash:

   ```ts
   const b4hash =
     req_time +
     merchant_id +
     tran_id +
     amount +
     items +
     shipping +
     firstname +
     lastname +
     email +
     phone +
     type +
     payment_option +
     return_url +
     cancel_url +
     continue_success_url +
     return_deeplink +
     currency +
     custom_fields +
     return_params +
     payout +
     lifetime +
     additional_params +
     google_pay_token +
     skip_success_page;

   const hash = base64(hmacSha512(b4hash, ABA_API_KEY));
   ```

   Use Deno's `crypto.subtle` (HMAC key algorithm `SHA-512`) in the Edge
   Function runtime — do not shell out to an external library for this.

8. **Call ABA's Purchase endpoint directly from the Edge Function** (server
   role, not the browser):
   ```
   POST ${ABA_API_BASE_URL}/api/payment-gateway/v1/payments/purchase
   Content-Type: application/x-www-form-urlencoded
   ```
   With `payment_option: "abapay_khqr"`, the response is JSON containing
   `qrString`, `qrImage` (a base64-encoded PNG, render directly as an `<img>`
   `src`), `abapay_deeplink`, and `app_store`/`play_store` links (confirmed
   against a real sandbox response — note the camelCase on `qrString`/
   `qrImage` specifically, inconsistent with the snake_case used everywhere
   else in ABA's API). Parse as JSON — this is the one case where that's
   correct; if you ever add a second flow with `payment_option: ""` for
   card/Hosted Checkout, that response is HTML instead and must be handled
   differently. A successful response has `status.code === "00"`.
9. Return `{ tran_id, qrImage, qrString, abapay_deeplink, app_store, play_store }`
   to the frontend. Do not return the raw ABA response verbatim beyond this —
   pick the fields the frontend actually needs.

## 2. Frontend: swap `initiatePayment()`

Current placeholder calls `upgrade_my_subscription()` directly (now locked to
service_role — this call will start failing with a permissions error, which
is intentional and confirms the lockdown worked).

Replace with:

1. Call the `initiate-payment` Edge Function with `{ tier }`.
2. Show a payment sheet/modal (matching the existing dark "satellite
   dashboard" design) with:
   - The `qrImage` rendered directly as an `<img src={qrImage}>` (it's
     already a base64 data URI, no fetch needed)
   - The `abapay_deeplink` behind an "Open ABA Mobile" button, useful when
     the person is checking out on the same phone that has ABA Mobile
     installed, rather than scanning a QR shown on their own screen — fall
     back to `app_store`/`play_store` (from the same response) if the
     deeplink doesn't resolve, e.g. via a short timeout on `visibilitychange`
   - A visible "waiting for payment…" state
3. Subscribe to (or lightly poll, e.g. every 3s) the `payment_transactions`
   row for that `tran_id` via the Supabase client — RLS already allows the
   user to `select` their own rows. When `status` flips from `pending` to
   `approved` or `failed`, update the UI accordingly. This is simpler and
   more efficient than re-implementing ABA's Check Transaction hash-and-poll
   on the client, since `finalize_aba_payment` (triggered by the webhook)
   already writes the authoritative result into that row.
4. On `approved`, refresh the user's profile/tier in the UI — the actual
   tier flip already happened server-side via the webhook by the time the
   row updates, so this is just a UI refresh, not a trust boundary.
5. Add a reasonable timeout (e.g. 2–3 minutes, matching `lifetime`) — if
   still `pending` when it expires, show "payment window expired, try again"
   rather than waiting forever on a QR ABA has already invalidated.

## 3. Edge Function: `aba-payway-webhook`

This is the `return_url` target from step 1 — server-to-server, no user JWT
involved, must be publicly reachable and whitelisted (see Section 0). Runs
with service_role.

1. Read the raw JSON body (needed as raw text/bytes for signature
   verification, before any parsing that could reorder keys).
2. Recompute the signature:
   ```ts
   const sorted = Object.keys(payload).sort();
   const b4hash = sorted
     .map((k) =>
       typeof payload[k] === "object"
         ? JSON.stringify(payload[k])
         : String(payload[k]),
     )
     .join("");
   const expected = base64(hmacSha512(b4hash, ABA_API_KEY));
   ```
3. Compare `expected` against the `X-PAYWAY-HMAC-SHA512` request header using
   constant-time comparison. **Reject with 401 on any mismatch — do not
   process the payment on a failed signature check, no exceptions.**
4. On success, call the `finalize_aba_payment` RPC (service_role client) with
   `tran_id`, `status` (ABA's `status` field, `"0"` = approved), `apv`, and
   the full verified payload as `raw_callback`.
5. Cross-check (optional but recommended): parse `return_params` from the
   payload and confirm its `profile_id`/`tier` match the `payment_transactions`
   row already found by `tran_id` inside `finalize_aba_payment`. A mismatch
   here would indicate tampering upstream of the signature check — log and
   alert rather than silently trusting either source alone.
6. Respond `200 OK` quickly — ABA may retry the callback if it doesn't get a
   fast 2xx, and `finalize_aba_payment` is idempotent so retries are safe.

## 4. Optional Edge Function: `check-payment-status` (manual reconciliation)

Not part of the primary flow (the frontend watches `payment_transactions`
directly, per Section 2) — this is a small on-demand tool for when a payment
seems stuck, e.g. the webhook domain wasn't whitelisted yet during testing
and a `pending` row never resolved.

1. Accept `{ tran_id }`, with the user's JWT; confirm the row's
   `profile_id` matches `auth.uid()` before doing anything.
2. Hash: `base64(hmacSha512(req_time + merchant_id + tran_id, ABA_API_KEY))`
   (note: this hash only covers those three fields, not the full Purchase
   field list — Check Transaction uses a much shorter hash input).
3. `POST ${ABA_API_BASE_URL}/api/payment-gateway/v1/payments/check-transaction-2`
   and read back `payment_status_code` / `payment_status`.
4. If it shows a final state ABA already reached but your row is still
   `pending` (webhook never arrived), call `finalize_aba_payment` yourself
   with the result — same idempotent path the webhook uses, so this is safe
   to call speculatively.
5. Rate limit: ABA allows 600 req/s and only looks back 7 days on this
   endpoint — irrelevant at your volume, just don't build a tight polling
   loop against it from the frontend (that's what Section 2's Supabase
   subscription is for instead).

## 5. Testing checklist (sandbox)

- [ ] Confirm your webhook URL (or ngrok tunnel) is whitelisted with PayWay's integration team — test a payment end-to-end before assuming the webhook "isn't working," since a missing whitelist fails silently
- [ ] Trigger `initiate-payment` for `individual` tier, confirm a `pending` row lands in `payment_transactions` with `amount = 5.00`
- [ ] Confirm the returned `qr_image` actually renders and `abapay_deeplink` opens ABA Mobile (sandbox app or test flow, per PayWay's sandbox docs)
- [ ] Complete a sandbox KHQR payment and confirm the webhook fires and `payment_transactions.status` flips to `approved`
- [ ] Confirm `profiles.subscription_tier` updates and a `billing_events` row appears with `source = 'aba_payway'`
- [ ] Send the same callback payload twice (replay) — confirm `finalize_aba_payment` no-ops the second time instead of double-granting
- [ ] Tamper with one field of a callback payload and confirm the webhook returns 401 and does **not** call `finalize_aba_payment`
- [ ] Let a QR expire (past `lifetime`) without paying — confirm the frontend times out gracefully instead of waiting forever
- [ ] Confirm `upgrade_my_subscription()` now fails when called with the user's JWT (permission denied) — this proves the placeholder gate is closed
- [ ] Cancel flow (`cancel_my_subscription`) still works unchanged — this migration doesn't touch it

## 6. Explicitly not covered here (follow-ups already flagged in the brief)

- Auto-downgrade-on-cancel pg_cron job — still not built, unrelated to ABA wiring
- Hectare-cap server-side enforcement — unrelated
- Card/WeChat/Alipay support via Hosted Checkout — deliberately deferred; add
  as a second `payment_option` path later if needed, no schema changes required
- **Refunds** — out of scope for this migration, but the auth mechanism is
  confirmed for whenever it's built: ABA's Refund API requires a
  `merchant_auth` field (`{mc_id, tran_id, refund_amount}`, JSON-encoded then
  **RSA-encrypted** — not HMAC-hashed — with the RSA Public Key from your
  sandbox credentials, in 117-byte chunks, base64'd). This is a genuinely
  different operation from the `hash` field used everywhere else: `hash`
  proves the request wasn't tampered with, `merchant_auth` actually conceals
  the values from interception. The RSA Private Key's purpose remains
  unconfirmed — don't assume a use for it without checking current PayWay
  docs when this is actually built.
- Going from sandbox to production is a config change only (`ABA_API_BASE_URL`
  - new merchant credentials, new whitelisted domain) — no schema or code
    changes needed if this is implemented as written
