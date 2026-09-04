// Shared CORS helper for Supabase Edge Functions.
// Reads allowed origins from APP_URLS env var (comma-separated).
// Returns headers that echo the request origin if allowed, else falls back to the first allowed origin.
// Local-dev loopback origins (localhost / 127.0.0.1) are always allowed so a
// Vite or local dev server can call the deployed functions without failing the
// CORS preflight. Production origins still have to be listed in APP_URLS.
function isLoopbackOrigin(origin) {
    return origin === "http://localhost" ||
        origin === "http://127.0.0.1" ||
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}
const allowedOrigins = (Deno.env.get("APP_URLS") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
function getCorsHeaders(req) {
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