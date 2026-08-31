// initiate-payment — generates a server-side-computed ABA PayWay Purchase
// payload + HMAC-SHA512 signature for the Hosted Checkout flow.
//
// This replaces the old placeholder which granted tiers for free via
// upgrade_my_subscription() (now locked to service_role in migration 014).
//
// Flow: the browser calls this with `{ tier }` using the user's JWT. This
// function looks up the ONLY source of truth for the amount (subscription_prices),
// records a `pending` row in payment_transactions, builds the ABA payload with
// every field position in the exact order the hash covers, signs it, and returns
// the full field set + hash to the browser. The BROWSER then posts directly to
// ABA's hosted checkout — this function never calls ABA itself.
//
// Secrets (set via `supabase secrets set`, never in code):
//   ABA_MERCHANT_ID, ABA_API_KEY, ABA_API_BASE_URL (sandbox/prod host only).

import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const MERCHANT_ID = Deno.env.get("ABA_MERCHANT_ID") || "";
const API_KEY = Deno.env.get("ABA_API_KEY") || "";
const ABA_API_BASE_URL =
  Deno.env.get("ABA_API_BASE_URL") || "https://checkout-sandbox.payway.com.kh";
const APP_URL = (Deno.env.get("APP_URLS") || "").split(",")[0].trim() || "";

// Functions live on the `.functions.supabase.co` subdomain of the same project.
function functionsBase(): string {
  const u = SUPABASE_URL.replace(/^https?:\/\//, "").split(".")[0];
  return `https://${u}.functions.supabase.co`;
}

// "purchase" only — this map doubles as the allowed-tiers guard.
const TIERS: Record<string, { itemsLabel: string }> = {
  individual: { itemsLabel: "Ceres - Individual plan" },
  coop: { itemsLabel: "Ceres - Co-op plan" },
};

// ABA's own docs pin the checkout plugin script to this single URL for BOTH
// sandbox and production, so the frontend should hardcode this, not the API base.
export const ABA_CHECKOUT_SCRIPT = "https://checkout.payway.com.kh/plugins/checkout2-0.js";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

function jsonResponse(body: unknown, status = 200, corsHeaders: Record<string, string>): Response {
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
    if (!user) return jsonResponse({ ok: false, error: "Not signed in" }, 401, corsHeaders);

    // 2. Read + validate tier. The amount NEVER comes from the client.
    const body = await req.json().catch(() => ({}));
    const tier = String(body.tier || "").toLowerCase();
    if (!TIERS[tier]) {
      return jsonResponse({ ok: false, error: "invalid_tier" }, 400, corsHeaders);
    }

    // 3. Look up the amount from subscription_prices — sole source of truth.
    const { data: price, error: priceErr } = await supabase
      .from("subscription_prices")
      .select("amount, currency")
      .eq("tier", tier)
      .maybeSingle();
    if (priceErr || !price) {
      return jsonResponse({ ok: false, error: "price_not_found" }, 500, corsHeaders);
    }
    const amount = String(price.amount);
    const currency = price.currency || "USD";
    const firstName = user.user_metadata?.first_name || user.user_metadata?.full_name || "";
    const lastName = user.user_metadata?.last_name || "";
    const email = user.email || "";

    // 4-5. Unique tran_id + req_time. tran_id is opaque to ABA; req_time is the
    // UTC yyyyMMddHHmmss sent to ABA and stored so the callback hash can be
    // rebuilt if we ever need to re-verify / reconcile.
    const tranId = `${user.id.slice(0, 8)}-${Date.now()}`;
    const reqTime = yyyyMMddHHmmss(new Date());

    // 6. Build the payload. The ORDER below is exactly what gets hashed —
    // each field must be present in this position, even when empty.
    const items = btoa(
      JSON.stringify([
        { name: TIERS[tier].itemsLabel, quantity: 1, price: Number(amount) },
      ]),
    );
    const shipping = "";
    const phone = "";
    const type = "purchase"; // never "subscription" — ABA Product API plans use
    // a different flow; this integration uses plain purchase.
    const paymentOption = "";
    const returnDeeplink = "";
    const customFields = "";
    const returnParams = btoa(
      JSON.stringify({ profile_id: user.id, tier }),
    );
    const payout = "";
    const lifetime = "60"; // minutes — 30-60 is recommended for a subscription
    const additionalParams = "";
    const googlePayToken = "";
    const skipSuccessPage = "1"; // redirect straight into the app on success

    const returnUrl = `${functionsBase()}/aba-payway-webhook`;
    const cancelUrl = APP_URL ? `${APP_URL}/billing?status=cancelled` : "";
    const continueSuccessUrl = APP_URL ? `${APP_URL}/billing?status=success` : "";

    const b4hash =
      reqTime + MERCHANT_ID + tranId + amount + items + shipping +
      firstName + lastName + email + phone + type + paymentOption +
      returnUrl + cancelUrl + continueSuccessUrl + returnDeeplink +
      currency + customFields + returnParams + payout + lifetime +
      additionalParams + googlePayToken + skipSuccessPage;

    // 7. Sign, insert pending row, and return everything the browser needs to
    // POST the form to ABA directly.
    const hash = await sign(b4hash, API_KEY);

    // Insert the pending transaction using service_role (the user-JWT client
    // has no write policy on payment_transactions).
    const { error: insertErr } = await supabase.from("payment_transactions").insert({
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
      return jsonResponse({ ok: false, error: "transaction_create_failed" }, 500, corsHeaders);
    }

    return jsonResponse(
      {
        ok: true,
        // The full ordered field set the form must POST + the computed hash.
        fields: {
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
        },
        hash,
        // Informational (frontend already knows); handy for debugging.
        checkout_url: `${ABA_API_BASE_URL}/api/payment-gateway/v1/payments/purchase`,
        checkout_script: ABA_CHECKOUT_SCRIPT,
      },
      200,
      corsHeaders,
    );
  } catch (err) {
    console.error("[initiate-payment]", err);
    return jsonResponse({ ok: false, error: "internal_error" }, 500, corsHeaders);
  }
});
