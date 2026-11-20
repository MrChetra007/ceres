// dataef-weather — JWT-verified proxy for DataEF current province conditions.
//
// POST { province: "Battambang" } -> { ok: true, weather: {...} | null }
//
// The browser never calls data.mef.gov.kh directly, so the API stays behind
// the platform JWT check and the shared 30-minute cache in _shared/dataef.ts.
// It is current conditions only; Open-Meteo remains the 5-day forecast.

import { getCorsHeaders } from "../_shared/cors.ts";
import { getProvinceWeather } from "../_shared/dataef.ts";

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

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse(
      { ok: false, error: "method_not_allowed" },
      405,
      corsHeaders,
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400, corsHeaders);
  }

  const province =
    typeof body?.province === "string" ? body.province.trim() : "";
  if (!province) {
    return jsonResponse(
      { ok: false, error: "province_required" },
      400,
      corsHeaders,
    );
  }

  const weather = await getProvinceWeather(province);
  return jsonResponse({ ok: true, weather }, 200, corsHeaders);
});
