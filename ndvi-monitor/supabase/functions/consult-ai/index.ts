import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY") || "";
const APP_URL = Deno.env.get("APP_URL") || "*";
const DAILY_CAP = 20;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

const corsHeaders = {
  "Access-Control-Allow-Origin": APP_URL,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const {
      data: { user },
    } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) return jsonResponse({ ok: false, error: "Not signed in" }, 401);

    const {
      fieldId,
      ndviValue,
      lswiValue,
      rainfallMm,
      status,
      growthStage,
      dayCount,
      lang,
    } = await req.json();

    // There's nothing meaningful to explain without NDVI.
    if (ndviValue == null) {
      return jsonResponse({ ok: false, error: "missing_data" }, 400);
    }

    // 1. Check cache — only reuse if NDVI + status haven't moved
    const { data: cached } = await supabase
      .from("ai_explanations")
      .select("explanation, ndvi_value, status")
      .eq("field_id", fieldId)
      .maybeSingle();

    if (
      cached &&
      Math.abs(cached.ndvi_value - ndviValue) < 0.02 &&
      cached.status === status
    ) {
      return jsonResponse({
        ok: true,
        explanation: cached.explanation,
        cached: true,
      });
    }

    // 2. Check + increment daily usage
    const { data: usage } = await supabase
      .from("ai_usage")
      .select("calls_today")
      .eq("user_id", user.id)
      .maybeSingle();
    const callsToday = usage?.calls_today ?? 0;
    if (callsToday >= DAILY_CAP) {
      return jsonResponse({ ok: false, error: "daily_limit_reached" }, 429);
    }
    await supabase
      .from("ai_usage")
      .upsert({ user_id: user.id, calls_today: callsToday + 1 });

    // 3. Call Gemini
    const langLine =
      lang === "km"
        ? "Reply in plain, simple Khmer a rural farmer would understand."
        : "Reply in plain, simple English.";

    const prompt = `You are explaining satellite crop health data to a rice farmer in Battambang, Cambodia.
Data: NDVI ${ndviValue.toFixed(2)}, LSWI (moisture) ${lswiValue?.toFixed(2) ?? "n/a"}, rainfall (21d) ${rainfallMm != null ? rainfallMm.toFixed(0) : "n/a"}mm, status: ${status}, growth stage: ${growthStage ?? "unknown"}, day ${dayCount ?? "?"} since planting.
${langLine}
In 2-3 short sentences: describe what the numbers suggest, and name 1-2 possible causes as possibilities to check — never state a single cause as certain. End with one practical next step. Do not use technical jargon like "NDVI" or "LSWI" in the reply itself.`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 200, temperature: 0.4 },
        }),
      },
    );
    console.log("Gemini response status:", geminiRes.status);
    const geminiData = await geminiRes.json();
    const explanation = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!explanation) {
      console.error(
        "Gemini returned no usable text. Full response:",
        JSON.stringify(geminiData),
      );
    }
    const finalExplanation =
      explanation || "Could not generate an explanation right now — please try again.";

    // 4. Cache it
    await supabase.from("ai_explanations").upsert({
      field_id: fieldId,
      ndvi_value: ndviValue,
      status,
      explanation: finalExplanation,
      created_at: new Date().toISOString(),
    });

    return jsonResponse({ ok: true, explanation: finalExplanation, cached: false });
  } catch (e) {
    console.error(e);
    return jsonResponse({ ok: false, error: String(e) }, 500);
  }
});
