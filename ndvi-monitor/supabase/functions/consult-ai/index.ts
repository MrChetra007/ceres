import { createClient } from "npm:@supabase/supabase-js@2";
import { generateExplanation, languageLine } from "../_shared/llm.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const DAILY_CAP = 20;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

function jsonResponse(body: unknown, status = 200, corsHeaders: Record<string, string>): Response {
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

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const {
      data: { user },
    } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) return jsonResponse({ ok: false, error: "Not signed in" }, 401, corsHeaders);

    const {
      fieldId,
      ndviValue,
      rviValue,
      lswiValue,
      rainfallMm,
      status,
      growthStage,
      dayCount,
      confidenceTier,
      confidenceReason,
      lang,
    } = await req.json();

    // The farmer's own profile language wins; fall back to what the client
    // sent (Feature 1b — Khmer localization).
    const { data: profile } = await supabase
      .from("profiles")
      .select("preferred_language")
      .eq("id", user.id)
      .maybeSingle();
    const langOut = profile?.preferred_language || lang || "en";

    // The reading we explain is whichever sensor the client actually read.
    // Radar (RVI) is a Sentinel-1 proxy used when optical NDVI is cloud-blocked.
    const readingKind = rviValue != null ? "rvi" : "ndvi";
    const readingValue = rviValue != null ? rviValue : ndviValue;

    // There's nothing meaningful to explain without any reading at all.
    if (readingValue == null) {
      return jsonResponse({ ok: false, error: "missing_data" }, 400, corsHeaders);
    }

    // 1. Check cache — only reuse if the reading + status haven't moved. The
    //    legacy ai_explanations.ndvi_value column stores whichever reading was
    //    used (NDVI or RVI); the status string sent for radar reads is
    //    "Radar (RVI) reading", which partitions the cache from optical reads.
    const { data: cached } = await supabase
      .from("ai_explanations")
      .select("explanation, ndvi_value, status, truncated")
      .eq("field_id", fieldId)
      .maybeSingle();

    if (
      cached &&
      Math.abs(cached.ndvi_value - readingValue) < 0.02 &&
      cached.status === status
    ) {
      return jsonResponse({
        ok: true,
        explanation: cached.explanation,
        // Pre-migration rows have truncated = null; treat that as untruncated
        // so old cached answers still render cleanly. New rows always have a
        // real boolean written at cache time.
        truncated: cached.truncated ?? false,
        cached: true,
      }, 200, corsHeaders);
    }

    // 2. Check + increment daily usage
    const { data: usage } = await supabase
      .from("ai_usage")
      .select("calls_today")
      .eq("user_id", user.id)
      .maybeSingle();
    const callsToday = usage?.calls_today ?? 0;
    if (callsToday >= DAILY_CAP) {
      return jsonResponse({ ok: false, error: "daily_limit_reached" }, 429, corsHeaders);
    }
    await supabase
      .from("ai_usage")
      .upsert({ user_id: user.id, calls_today: callsToday + 1 });

    // 3. Generate the explanation (Gemini -> DeepSeek -> Qwen)
    const langLine = languageLine(langOut);

    const confidenceLine =
      confidenceTier === "low"
        ? `Data confidence is LOW (${confidenceReason || "stale or cloud-covered data"}). Be explicit that the satellite data is stale or uncertain and you cannot confirm current field health — frame everything as best-effort with low certainty.`
        : confidenceTier === "medium"
          ? `Data confidence is MEDIUM (${confidenceReason || "limited cloud-free imagery"}). Hedge your advice — note the uncertainty and avoid over-confident statements.`
          : "";

    const readingLine =
    readingKind === "rvi"
      ? `Radar Canopy-Vigor Index (RVI) ${readingValue.toFixed(2)} (Sentinel-1 radar, used because optical NDVI was cloud-blocked),`
      : `NDVI ${readingValue.toFixed(2)},`;
    const sensorNote =
      readingKind === "rvi"
        ? "IMPORTANT: the main value is a RADAR measurement of crop vigor taken under cloud cover \u2014 it is a proxy estimate, not the usual optical greenness reading. Explain it as such, never call it \"NDVI\", and suggest a field check."
        : "";

    const prompt = `You are explaining satellite crop health data to a rice farmer in Battambang, Cambodia.
Data: ${readingLine} LSWI (moisture) ${lswiValue?.toFixed(2) ?? "n/a"}, rainfall (21d) ${rainfallMm != null ? rainfallMm.toFixed(0) : "n/a"}mm, status: ${status}, growth stage: ${growthStage ?? "unknown"}, day ${dayCount ?? "?"} since planting.
${sensorNote}
${confidenceLine}
${langLine}
In plain, easy-to-understand language (a short paragraph is fine, longer if needed): describe what the numbers suggest, name 1-2 possible causes as possibilities to check — never state a single cause as certain — and explain enough that the farmer understands the situation. End with one practical next step. Write the reply directly: never restate these instructions, never list evaluation criteria, never write a checklist or plan. Do not use technical jargon like "NDVI" or "LSWI" in the reply itself.`;

    // If the model hits its output token ceiling (finish_reason "length" /
    // "MAX_TOKENS") and trails off mid-sentence, retry the same provider with a
    // hard-trimmed "keep it minimal" prompt. The user gets a complete short
    // answer instead of a truncated one, and if it STILL gets cut we flag it so
    // the UI can tell the user rather than silently showing a dangling sentence.
    const concisePrompt = `Keep it clear and complete in a few sentences: what the field's satellite data suggests and ONE practical next step.
${confidenceLine === "" ? "" : `Remember: ${confidenceLine}`}
${langLine}
Write the reply directly — no checklist, no plan, no restating these instructions. Do not mention "NDVI", "LSWI" or any index name.`;

    const result = await generateExplanation(prompt, concisePrompt);
    const explanation =
      result?.text ||
      "Could not generate an explanation right now — please try again.";
    const modelUsed = result?.model || "none";
    const truncated = result?.truncated ?? false;
    // Attribution + truncation audit trail. finish_reason is logged by llm.ts.
    console.log(
      "AI explanation served by:",
      modelUsed,
      "truncated:",
      truncated,
    );

    // 4. Cache it (model_used is for our own auditing only)
    await supabase.from("ai_explanations").upsert({
      field_id: fieldId,
      ndvi_value: readingValue,
      status,
      explanation,
      model_used: modelUsed,
      truncated,
      created_at: new Date().toISOString(),
    });

    return jsonResponse({ ok: true, explanation, truncated, cached: false }, 200, corsHeaders);
  } catch (e) {
    console.error(e);
    return jsonResponse({ ok: false, error: String(e) }, 500, corsHeaders);
  }
});
