// Shared CORS helper for Supabase Edge Functions.
// Reads allowed origins from APP_URLS env var (comma-separated).
// Returns headers that echo the request origin if allowed, else falls back to the first allowed origin.

const allowedOrigins = (Deno.env.get("APP_URLS") ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

// Local-dev loopback origins are always allowed so a frontend served by Vite or
// any local dev server (http://localhost:<port>, http://127.0.0.1:<port>) can
// call the deployed functions without a CORS preflight failure. This mirrors the
// official Supabase dev experience and does NOT widen production CORS — a real
// HTTP(S) origin still has to be explicitly listed in APP_URLS.
function isLoopbackOrigin(origin: string): boolean {
  return (
    origin === "http://localhost" ||
    origin === "http://127.0.0.1" ||
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
  );
}

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const isAllowed = isLoopbackOrigin(origin) || allowedOrigins.includes(origin);
  const allowOrigin = isAllowed ? origin : allowedOrigins[0] ?? "*";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
}

export { getCorsHeaders, allowedOrigins };