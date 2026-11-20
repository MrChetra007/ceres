// ============================================================================
// Phase 8.6 - Test trigger for ee-alerts-worker.
//
// Relays a request to the scheduled worker using the service_role key that
// Supabase injects into this function's own environment - no key handling in
// the caller. Lets you collect dedup data points on demand without waiting
// for the daily 23:00 UTC cron run, and without ever exposing the key.
//
// SECURITY: service-role only. The platform gateway verifies the JWT, and this
// function additionally requires the caller's bearer token to match the
// service-role key. A normal signed-in user must NOT be able to fire a
// cross-user alert run by invoking this endpoint with their user JWT.
//
// Invoke:  POST https://wopwwtnvqyomiwbsxiks.functions.supabase.co/trigger-alerts-worker
//          Authorization: Bearer <service-role key>
// ============================================================================

import { getCorsHeaders } from "../_shared/cors.ts";

const WORKER_URL =
  Deno.env.get("EE_WORKER_URL") ||
  "https://wopwwtnvqyomiwbsxiks.functions.supabase.co/ee-alerts-worker";

function jsonResponse(
  body: unknown,
  status: number,
  corsHeaders: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function bearerToken(req: Request): string {
  const auth = req.headers.get("Authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(auth);
  return match ? match[1].trim() : "";
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceRole) {
    return jsonResponse(
      { ok: false, error: "SUPABASE_SERVICE_ROLE_KEY not set" },
      500,
      corsHeaders,
    );
  }

  const token = bearerToken(req);
  if (!constantTimeEqual(token, serviceRole)) {
    return jsonResponse(
      { ok: false, error: "forbidden" },
      403,
      corsHeaders,
    );
  }

  const body = await req.text().catch(() => "{}");

  const resp = await fetch(WORKER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceRole}`,
    },
    body: body || "{}",
  });

  const text = await resp.text();
  return new Response(text, {
    status: resp.status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
});
