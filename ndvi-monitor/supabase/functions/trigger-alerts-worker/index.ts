// ============================================================================
// Phase 8.6 — Test trigger for ee-alerts-worker.
//
// Relays a request to the scheduled worker using the service_role key that
// Supabase injects into this function's own environment — no key handling in
// the caller. Lets you collect dedup data points on demand without waiting
// for the daily 23:00 UTC cron run, and without ever exposing the key.
//
// Invoke:  POST https://wopwwtnvqyomiwbsxiks.functions.supabase.co/trigger-alerts-worker
//          (JWT-required; the Supabase dashboard's "Invoke" button works as-is)
// ============================================================================

const WORKER_URL =
  Deno.env.get("EE_WORKER_URL") ||
  "https://wopwwtnvqyomiwbsxiks.functions.supabase.co/ee-alerts-worker";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceRole) {
    return new Response(
      JSON.stringify({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY not set" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
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
    headers: { "Content-Type": "application/json" },
  });
});
