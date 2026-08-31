// aba-payway-webhook — server-to-server callback target from ABA PayWay.
//
// ABA POSTs the transaction result here (our `return_url` from initiate-payment).
// There is NO user JWT involved — the request is authenticated purely by the
// X-PAYWAY-HMAC-SHA512 signature. Configured with verify_jwt = false in
// config.toml.
//
// Steps:
//   1. Read the raw body BYTES before any JSON parsing (so key order is never
//      normalized before signing).
//   2. Recompute the expected signature over the sorted keys.
//   3. Constant-time compare against the header. On mismatch -> 401, and the
//      payment MUST NOT be processed.
//   4. On success call finalize_aba_payment (service_role) — idempotent, so ABA
//      retries are safe.
//   5. Respond 200 fast so ABA doesn't retry.

import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const API_KEY = Deno.env.get("ABA_API_KEY") || "";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

function textResponse(body: string, status = 200, corsHeaders: Record<string, string>): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/plain", ...corsHeaders },
  });
}

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

// Constant-time comparison — never short-circuit on a length/byte mismatch that
// could leak timing information.
function safeEqual(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let rawBody = "";
  try {
    // 1. Read raw bytes FIRST — verification happens on the untouched body.
    rawBody = await req.text();
  } catch {
    return textResponse("bad request", 400, corsHeaders);
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return textResponse("invalid json", 400, corsHeaders);
  }

  // 2. Recompute the signature: ABA sorts the payload keys lexically, then
  // concats the values (JSON-stringifying nested objects) with no separator.
  const sorted = Object.keys(payload).sort();
  const b4hash = sorted
    .map((k) =>
      typeof payload[k] === "object" && payload[k] !== null
        ? JSON.stringify(payload[k])
        : String(payload[k] ?? ""),
    )
    .join("");
  const expected = await sign(b4hash, API_KEY);

  // 3. Constant-time compare against the header. Reject hard on mismatch.
  const provided = req.headers.get("X-PAYWAY-HMAC-SHA512") || "";
  if (!provided || !safeEqual(expected, provided)) {
    console.error("[aba-payway-webhook] signature mismatch — rejecting");
    return textResponse("unauthorized", 401, corsHeaders);
  }

  try {
    // 4. Finalize. finalize_aba_payment is idempotent + validates the stored
    //    tran_id, so a replayed/retried callback is a safe no-op.
    const tranId = String(payload.tran_id || payload.tranId || "");
    const statusCode = String(payload.status ?? "");
    const apv = payload.apv ? String(payload.apv) : null;

    const { error: rpcErr } = await supabase.rpc("finalize_aba_payment", {
      p_tran_id: tranId,
      p_payway_status_code: statusCode,
      p_apv: apv,
      p_raw_callback: payload,
    });
    if (rpcErr) {
      // Unknown tran_id, or a hard DB error. Log it — ABA may retry, and the
      // row might be from a genuine out-of-band attempt.
      console.error("[aba-payway-webhook] finalize_aba_payment failed", {
        tranId,
        error: rpcErr,
      });
      return textResponse("internal error", 500, corsHeaders);
    }

    // 5. Fast 200 so ABA doesn't retry.
    return textResponse("ok", 200, corsHeaders);
  } catch (err) {
    console.error("[aba-payway-webhook]", err);
    return textResponse("internal error", 500, corsHeaders);
  }
});
