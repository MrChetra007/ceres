// initiate-payment — server-side ABA PayWay Purchase with KHQR + deeplink.
//
// Runs with the user's JWT to identify who's paying, then uses service_role
// internally to write the pending row and call ABA. The amount NEVER comes
// from the client — it's looked up from subscription_prices, the only source
// of truth.
//
// Flow: the browser calls this with `{ tier }`. This function records a
// `pending` row in payment_transactions, builds the ABA Purchase payload with
// payment_option "abapay_khqr" (which asks ABA for a scan-to-pay QR + ABA
// Mobile deeplink instead of an HTML checkout page), signs it, POSTs directly
// to ABA's Purchase endpoint server-side, and returns the QR/deeplink for the
// frontend to display while it polls payment_transactions for the result.
//
// Secrets (set via `supabase secrets set`, never in code):
//   ABA_MERCHANT_ID, ABA_API_KEY, ABA_API_BASE_URL (sandbox/prod host only),
//   APP_URL (the frontend's base URL, used to build cancel/success links).

import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const MERCHANT_ID = Deno.env.get("ABA_MERCHANT_ID") || "";
const API_KEY = Deno.env.get("ABA_API_KEY") || "";
// Trim any stray trailing slash from the configured base so the paths we
// concatenate below never produce a double slash.
const ABA_API_BASE_URL = (
  Deno.env.get("ABA_API_BASE_URL") || "https://checkout-sandbox.payway.com.kh"
).replace(/\/+$/, "");
// FIX: the secret is actually named APP_URL (singular) in `supabase secrets
// list` — this previously read APP_URLS (plural), which always returned "",
// silently leaving cancel_url/continue_success_url blank on every request.
const APP_URL = (Deno.env.get("APP_URL") || "").split(",")[0].trim() || "";

// The billing page is where ABA's (never-visited in this flow) cancel/success
// URLs point — the customer stays in-app, but the fields are still hashed.
const BILLING_URL = APP_URL ? `${APP_URL}/billing` : "";

// Functions live on the `.functions.supabase.co` subdomain of the same project.
function functionsBase(): string {
  const u = SUPABASE_URL.replace(/^https?:\/\//, "").split(".")[0];
  return `https://${u}.functions.supabase.co`;
}

// "purchase" only — this map doubles as the allowed-tiers guard.
// FIX: plain hyphens instead of an em dash. btoa() (used below) only accepts
// Latin1 input and throws InvalidCharacterError on "—", which was the actual
// cause of the 500 — it happens inside the try block, so it surfaced to the
// client as the generic {"ok":false,"error":"internal_error"}. Fixed properly
// via utf8ToBase64() below as well, so non-Latin1 text (e.g. Khmer item
// names) won't hit this same wall later.
const TIERS: Record<string, { itemsLabel: string }> = {
  individual: { itemsLabel: "Ceres - Individual plan" },
  coop: { itemsLabel: "Ceres - Co-op plan" },
};

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

function jsonResponse(
  body: unknown,
  status = 200,
  corsHeaders: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function yyyyMMddHHmmss(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`
  );
}

// FIX: UTF-8-safe base64 encoding. Plain btoa() throws
// "InvalidCharacterError: The string contains characters outside of the
// Latin1 range" on any non-Latin1 character (em dashes, Khmer script,
// accented letters, etc.) — this was the root cause of the 500. Encode to
// UTF-8 bytes first, then base64 those bytes, same result as btoa() for
// plain ASCII but safe for everything else too.
function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

// base64(HMAC-SHA512(message, API_KEY)) — the exact signature scheme ABA uses
// to verify both the purchase request and the webhook callback. Uses
// crypto.subtle directly; no external signing library.
async function sign(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Identify the payer from the JWT (platform gateway verifies it).
    const authHeader = req.headers.get("Authorization") || "";
    const {
      data: { user },
    } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user)
      return jsonResponse(
        { ok: false, error: "Not signed in" },
        401,
        corsHeaders,
      );

    // 2. Read + validate tier. The amount NEVER comes from the client.
    const body = await req.json().catch(() => ({}));
    const tier = String(body.tier || "").toLowerCase();
    if (!TIERS[tier]) {
      return jsonResponse(
        { ok: false, error: "invalid_tier" },
        400,
        corsHeaders,
      );
    }

    // 3. Look up the amount from subscription_prices — sole source of truth.
    const { data: price, error: priceErr } = await supabase
      .from("subscription_prices")
      .select("amount, currency")
      .eq("tier", tier)
      .maybeSingle();
    if (priceErr || !price) {
      return jsonResponse(
        { ok: false, error: "price_not_found" },
        500,
        corsHeaders,
      );
    }
    const amount = String(price.amount);
    const currency = price.currency || "USD";
    const firstName =
      user.user_metadata?.first_name || user.user_metadata?.full_name || "";
    const lastName = user.user_metadata?.last_name || "";
    const email = user.email || "";

    // 4-5. Unique tran_id + req_time. tran_id is opaque to ABA; req_time is the
    // UTC yyyyMMddHHmmss sent to ABA and stored so the callback hash can be
    // rebuilt if we ever need to re-verify / reconcile.
    const tranId = `${user.id.slice(0, 8)}-${Date.now()}`;
    const reqTime = yyyyMMddHHmmss(new Date());

    // 6. Build the payload. The ORDER below is exactly what gets hashed —
    // each field must be present in this position, even when empty.
    const items = utf8ToBase64(
      JSON.stringify([
        { name: TIERS[tier].itemsLabel, quantity: 1, price: Number(amount) },
      ]),
    );
    const shipping = "0"; // must be a numeric string — ABA rejects "" (code 10)
    const phone = "";
    const type = "purchase";
    // THIS is the key field: it makes ABA respond with a scan-to-pay QR +
    // ABA Mobile deeplink instead of an HTML hosted-checkout page.
    const paymentOption = "abapay_khqr";
    const returnDeeplink = "";
    const customFields = "";
    const returnParams = JSON.stringify({ profile_id: user.id, tier });
    const payout = "";
    const lifetime = "20"; // minutes — QR validity window (15-30 recommended)
    const additionalParams = "";
    const googlePayToken = "";
    const skipSuccessPage = "0"; // irrelevant to KHQR (no page shown), keep hash consistent

    const returnUrl = `${functionsBase()}/aba-payway-webhook`;
    const cancelUrl = BILLING_URL;
    const continueSuccessUrl = BILLING_URL;

    const b4hash =
      reqTime +
      MERCHANT_ID +
      tranId +
      amount +
      items +
      shipping +
      firstName +
      lastName +
      email +
      phone +
      type +
      paymentOption +
      returnUrl +
      cancelUrl +
      continueSuccessUrl +
      returnDeeplink +
      currency +
      customFields +
      returnParams +
      payout +
      lifetime +
      additionalParams +
      googlePayToken +
      skipSuccessPage;

    // 7. Sign, then insert the pending row BEFORE calling ABA (so a partially
    // failed attempt still leaves an auditable record).
    const hash = await sign(b4hash, API_KEY);

    const { error: insertErr } = await supabase
      .from("payment_transactions")
      .insert({
        profile_id: user.id,
        tier,
        tran_id: tranId,
        amount: Number(amount),
        currency,
        status: "pending",
        req_time: reqTime,
      });
    if (insertErr) {
      console.error("[initiate-payment] insert failed", insertErr);
      return jsonResponse(
        { ok: false, error: "transaction_create_failed" },
        500,
        corsHeaders,
      );
    }

    // 8. Call ABA's Purchase endpoint directly from the Edge Function (server
    // role, not the browser). With payment_option "abapay_khqr" the response is
    // JSON containing the QR + deeplink.
    const formBody = new URLSearchParams({
      req_time: reqTime,
      merchant_id: MERCHANT_ID,
      tran_id: tranId,
      amount,
      items,
      shipping,
      firstname: firstName,
      lastname: lastName,
      email,
      phone,
      type,
      payment_option: paymentOption,
      return_url: returnUrl,
      cancel_url: cancelUrl,
      continue_success_url: continueSuccessUrl,
      return_deeplink: returnDeeplink,
      currency,
      custom_fields: customFields,
      return_params: returnParams,
      payout,
      lifetime,
      additional_params: additionalParams,
      google_pay_token: googlePayToken,
      skip_success_page: skipSuccessPage,
      hash,
    });

    let aba;
    try {
      const res = await fetch(
        `${ABA_API_BASE_URL}/api/payment-gateway/v1/payments/purchase`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: formBody.toString(),
        },
      );
      // KHQR flow returns JSON (unlike the card/Hosted flow which returns HTML).
      aba = await res.json();
    } catch (err) {
      console.error("[initiate-payment] ABA request failed", err);
      return jsonResponse(
        { ok: false, error: "aba_unreachable" },
        502,
        corsHeaders,
      );
    }

    // A successful KHQR response has status.code "00". Mirror ABA's own
    // status fields whether or not it succeeded, so the client can show a
    // useful message on failure.
    const code = aba?.status?.code;
    if (code !== "00") {
      console.error(
        "[initiate-payment] ABA rejected",
        code,
        aba?.status?.message || aba,
      );
      return jsonResponse(
        {
          ok: false,
          error: "aba_rejected",
          code,
          message: aba?.status?.message || "ABA rejected the request",
        },
        502,
        corsHeaders,
      );
    }

    // 9. Return only the fields the frontend needs: QR + deeplink store links.
    // Note the camelCase qrString/qrImage in ABA's response (inconsistent with
    // the snake_case used elsewhere) — preserve it here.
    return jsonResponse(
      {
        ok: true,
        tran_id: tranId,
        qrImage: aba.qrImage || "",
        qrString: aba.qrString || "",
        abapay_deeplink: aba.abapay_deeplink || "",
        app_store: aba.app_store || "",
        play_store: aba.play_store || "",
      },
      200,
      corsHeaders,
    );
  } catch (err) {
    console.error("[initiate-payment]", err);
    return jsonResponse(
      { ok: false, error: "internal_error" },
      500,
      corsHeaders,
    );
  }
});
