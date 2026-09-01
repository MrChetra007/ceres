// simulate-payment — DEV/TESTING ONLY.
//
// Fakes an "approved" ABA callback for a pending transaction by calling the
// exact same finalize_aba_payment() RPC the real aba-payway-webhook uses.
// This means the downstream path you're actually testing (tier flip,
// billing_events logging, the payment_transactions row the frontend is
// watching) is IDENTICAL to what a real payment triggers — only the ABA
// round-trip itself is skipped.
//
// GUARDRAIL: refuses to run unless ABA_API_BASE_URL still points at
// "sandbox". This is the only thing standing between this function and
// silently approving real production payments for free — do not remove
// this check, and delete this whole function before going live.
//
// DELETE THIS FUNCTION before production launch. It has no auth beyond
// "is this tran_id yours" — anyone with a valid session could grant
// themselves any tier while this exists.

import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ABA_API_BASE_URL = Deno.env.get("ABA_API_BASE_URL") || "";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

function jsonResponse(
  body: unknown,
  status: number,
  cors: Record<string, string>,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  // GUARDRAIL — refuse outright unless this is clearly a sandbox project.
  if (!ABA_API_BASE_URL.includes("sandbox")) {
    return jsonResponse(
      { ok: false, error: "simulation_disabled_outside_sandbox" },
      403,
      corsHeaders,
    );
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const {
      data: { user },
    } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user)
      return jsonResponse(
        { ok: false, error: "not_signed_in" },
        401,
        corsHeaders,
      );

    const { tran_id } = await req.json().catch(() => ({}));
    if (!tran_id)
      return jsonResponse(
        { ok: false, error: "missing_tran_id" },
        400,
        corsHeaders,
      );

    // Confirm this transaction actually belongs to the caller before
    // simulating anything — same trust boundary a real callback respects
    // via return_params, just checked directly against the row here.
    const { data: txn } = await supabase
      .from("payment_transactions")
      .select("profile_id, status")
      .eq("tran_id", tran_id)
      .maybeSingle();

    if (!txn || txn.profile_id !== user.id) {
      return jsonResponse(
        { ok: false, error: "not_your_transaction" },
        403,
        corsHeaders,
      );
    }
    if (txn.status !== "pending") {
      return jsonResponse(
        { ok: false, error: "already_finalized" },
        409,
        corsHeaders,
      );
    }

    const { error } = await supabase.rpc("finalize_aba_payment", {
      p_tran_id: tran_id,
      p_payway_status_code: "0", // "0" = approved, same as a real ABA callback
      p_apv: "SIMULATED",
      p_raw_callback: {
        simulated: true,
        note: "dev-only simulate-payment call",
      },
    });

    if (error) {
      console.error("[simulate-payment] finalize_aba_payment failed", error);
      return jsonResponse(
        { ok: false, error: "finalize_failed" },
        500,
        corsHeaders,
      );
    }

    return jsonResponse({ ok: true }, 200, corsHeaders);
  } catch (err) {
    console.error("[simulate-payment]", err);
    return jsonResponse(
      { ok: false, error: "internal_error" },
      500,
      corsHeaders,
    );
  }
});
