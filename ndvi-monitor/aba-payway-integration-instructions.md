# ABA PayWay Sandbox Integration — Implementation Instructions

Run `014_aba_payway_integration.sql` first (Supabase SQL editor, in order after 013).
This document covers everything outside the schema: two new Edge Functions and
the frontend `initiatePayment()` swap.

## 0. Before you start

Sandbox credentials are already issued. **Credential mapping** — ABA's sandbox
email issues five items, but only two are used by this integration:

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

- Currency is fixed at USD (matches the $5 / $39 pricing already in
  `subscription_prices`).

## 1. Edge Function: `initiate-payment`

Replaces the body of the current placeholder `initiatePayment()` call target.
Runs with the user's JWT (not service_role) to identify who's paying, then
uses service_role internally to write the pending row.

**Steps the function performs:**

1. Read `p_tier` from the request body (`'individual'` or `'coop'`). Reject
   anything else with a 400 — never trust a client-supplied amount.
2. Look up the price from `subscription_prices` server-side:
   `select amount, currency from subscription_prices where tier = p_tier`.
   This is the only source of truth for `amount` — the amount ABA charges
   must come from here, not from the request body.
3. Generate `tran_id` — must be unique per attempt. Use something like
   `${auth.uid().slice(0,8)}-${Date.now()}` or `crypto.randomUUID()`.
   ABA's own examples use numeric timestamps; anything unique and URL-safe
   works since it's opaque to ABA.
4. Generate `req_time` in `yyyyMMddHHmmss` format (UTC), e.g. `20260831143000`.
5. Insert a `pending` row into `payment_transactions` using the service-role
   client (`profile_id = auth.uid()`, `tier`, `tran_id`, `amount`, `currency`,
   `req_time`).
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
   - `payment_option` = `""` (empty — let ABA's checkout UI show all options:
     card, ABA Pay, KHQR, WeChat, Alipay)
   - `items` = base64-encoded JSON, e.g.
     `base64(JSON.stringify([{ name: "Ceres — " + tier + " plan", quantity: 1, price: amount }]))`
   - `return_url` = your `aba-payway-webhook` Edge Function URL (server-to-server pushback)
   - `cancel_url` / `continue_success_url` = frontend routes, e.g.
     `https://<domain>/billing?status=cancelled` / `.../billing?status=success`
   - `return_params` = base64 or plain JSON string containing at least
     `{"profile_id": "<uuid>", "tier": "<tier>"}` — ABA echoes this back
     verbatim in the callback, giving you a second, independent cross-check
     against the `payment_transactions` row you already have keyed by `tran_id`.
   - Leave `shipping`, `custom_fields`, `payout`, `additional_params`,
     `google_pay_token` as empty strings `""` if unused — **do not omit them
     from the concatenation**, the hash must include every field position
     even when empty.
   - `lifetime` — transaction validity window in minutes; 30–60 is reasonable
     for a subscription checkout (default is 30 days if unset, unnecessarily long).
   - `skip_success_page` — `"0"` to show ABA's built-in success page, or `"1"`
     to skip straight to `continue_success_url`. Use `"1"` for a smoother
     redirect back into the app.

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

8. Return the full field set + hash to the frontend. Do **not** call ABA's
   endpoint from the Edge Function itself for the Hosted Checkout flow — the
   _browser_ posts this form directly to
   `${ABA_API_BASE_URL}/api/payment-gateway/v1/payments/purchase`, exactly
   like the `<form>` sample in ABA's docs, so the customer lands on ABA's
   hosted page. The Edge Function's job is only to generate a trustworthy,
   server-computed payload + hash.

## 2. Frontend: swap `initiatePayment()`

Current placeholder calls `upgrade_my_subscription()` directly (now locked to
service_role — this call will start failing with a permissions error, which is
intentional and confirms the lockdown worked).

Replace with:

1. Call the `initiate-payment` Edge Function with `{ tier }`.
2. Take the returned field set + hash and populate a hidden form (mirror
   ABA's sample exactly — same field names, same order isn't required in the
   HTML form itself, only in the hash string).
3. Load `https://checkout.payway.com.kh/plugins/checkout2-0.js` (this single
   URL works for both sandbox and production — it's the same script, don't
   swap it with the API base URL) and call `AbaPayway.checkout()` on submit
   for the bottom-sheet/modal experience, matching the existing dark
   "satellite dashboard" design rather than a full-page redirect. Fall back to
   plain `form.submit()` if the plugin script fails to load.
4. On return, the `/billing?status=success` or `?status=cancelled` route
   should re-fetch the user's profile/tier — the actual tier flip already
   happened server-side via the webhook by the time the user's browser
   redirects back, so this is just a UI refresh, not a trust boundary.

## 3. Edge Function: `aba-payway-webhook`

This is the `return_url` target from step 1 — server-to-server, no user JWT
involved. Runs with service_role.

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

## 4. Testing checklist (sandbox)

- [ ] Register / confirm sandbox account at https://sandbox.payway.com.kh — merchant ID + API key already in hand per Sozin
- [ ] Trigger `initiate-payment` for `individual` tier, confirm a `pending` row lands in `payment_transactions` with `amount = 5.00`
- [ ] Complete a sandbox payment (ABA sandbox provides test card/KHQR flows) and confirm the webhook fires
- [ ] Confirm `payment_transactions.status` flips to `approved`, `profiles.subscription_tier` updates, and a `billing_events` row appears with `source = 'aba_payway'`
- [ ] Send the same callback payload twice (replay) — confirm `finalize_aba_payment` no-ops the second time instead of double-granting
- [ ] Tamper with one field of a callback payload and confirm the webhook returns 401 and does **not** call `finalize_aba_payment`
- [ ] Confirm `upgrade_my_subscription()` now fails when called with the user's JWT (permission denied) — this proves the placeholder gate is closed
- [ ] Cancel flow (`cancel_my_subscription`) still works unchanged — this migration doesn't touch it

## 5. Explicitly not covered here (follow-ups already flagged in the brief)

- Auto-downgrade-on-cancel pg_cron job — still not built, unrelated to ABA wiring
- Hectare-cap server-side enforcement — unrelated
- Going from sandbox to production is a config change only (`ABA_API_BASE_URL`
  - new merchant credentials) — no schema or code changes needed if this is
    implemented as written
