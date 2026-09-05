import { createClient } from "npm:@supabase/supabase-js@2";
import { generateExplanation, languageLine } from "../_shared/llm.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const DAILY_CAP = 20;
// TEST FLAG: the ai_explanations cache might be serving stale/confusing
// explanations instead of helping. Set false to bypass BOTH the cache read and
// the cache write so every call generates a fresh explanation; flip back to
// true to restore caching when the test is done.
const USE_EXPLANATION_CACHE = false;

// Stage-aware water need, keyed by the exact growthStage strings the client
// sends (src/config.js RICE_GROWTH_STAGES). Lets the model connect the rainfall
// PATTERN to what the crop actually needs right now — the most honest signal
// available when optical imagery is cloud-blocked.
const WATER_NEED_BY_STAGE: Record<string, string> = {
  "Transplanting": "seedlings are still establishing roots — keep the soil moist but avoid deep water over young plants.",
  "Tillering": "the crop is building tillers and roots — steady, shallow moisture suits it; brief dry spells are tolerated but the field should not crack.",
  "Stem Elongation / Booting": "entering the most water-hungry weeks — the canopy grows fast and booting needs good moisture; a dry phase now directly cuts tiller survival and grain count.",
  "Flowering / Heading": "the most moisture-sensitive stage — stress or heat around flowering reduces pollination and grain set; keep shallow water if possible.",
  "Grain Filling / Maturity": "the grains are filling and pump the most water of the season — avoid letting the field dry out until the final ~2 weeks before harvest.",
  "Harvest / Senescence": "the crop is maturing naturally for harvest — time to drain the field down; it needs little standing water.",
  // Generic vegetative cycle — used for any crop that isn't rice (mango,
  // cassava, banana, ...). Stage strings are keyed to GENERIC_GROWTH_STAGES in
  // the client config so rice and non-rice can never collide.
  "Vegetative": "the plant is young and building roots and leaves — keep the soil consistently moist; a newly planted tree or seedling has no deep root system yet.",
  "Flowering / Fruiting": "the plant is in its most sensitive fortnight — water stress around flowering or fruit set directly cuts yield; keep the soil from drying out.",
  "Mature": "the crop is approaching harvest — ease off watering and watch for ripeness; low greenness is natural here as growth slows.",
};

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
      rainfallBuckets,
      lastClearReading,
      status,
      growthStage,
      dayCount,
      confidenceTier,
      confidenceReason,
      lang,
      observationHistory,
      cropEnglish,
      locationName,
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
    if (USE_EXPLANATION_CACHE) {
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

    // Raw per-scene observation history (date, NDVI, cloud cover, status) sent
    // by the client so the AI can reason about TREND and cloud gaps instead of
    // only today's snapshot. Sanitized + capped: 10 scenes max, only valid
    // dates, numbers coerced — garbage in is dropped, never injected.
    const rawHistory = Array.isArray(observationHistory) ? observationHistory : [];
    const historyRows = rawHistory
      .filter((h: any) => h && typeof h.date === "string")
      .slice(0, 10)
      .reverse() // client sends newest-first; prompt reads oldest-to-newest
      .map((h: any) => {
        const ndvi =
          typeof h.ndvi === "number" && isFinite(h.ndvi) ? h.ndvi.toFixed(2) : null;
        const cloud = typeof h.cloudPct === "number" ? Math.round(h.cloudPct) : null;
        const valuePart = ndvi != null ? `NDVI ${ndvi}` : "optically blocked (no NDVI)";
        const qualifiers: string[] = [];
        if (cloud != null) qualifiers.push(`${cloud}% cloud`);
        if (typeof h.status === "string" && h.status) qualifiers.push(h.status);
        return `  ${h.date}: ${valuePart}${qualifiers.length ? ", " + qualifiers.join(", ") : ""}`;
      });
    const historySection = historyRows.length
      ? `Satellite observation history (per scene, oldest to newest):
${historyRows.join("\n")}
Use this history for TREND context only: you may describe direction (e.g. "your greenness has been falling since <date>") and cloud gaps, citing only these exact dates. NEVER invent values, dates or numbers that are not listed.`
      : "";

    // Rainfall PATTERN (3 weekly buckets, oldest -> newest) + what the crop
    // needs at this stage, so the model reads the pattern, not just the total —
    // the most honest signal available while optical imagery is blocked.
    const rawBuckets = Array.isArray(rainfallBuckets) ? rainfallBuckets : [];
    const bucketsRows = rawBuckets
      .filter((b: any) => b && typeof b.start === "string" && typeof b.mm === "number" && isFinite(b.mm))
      .slice(0, 3)
      .map((b: any) => `  ${b.start}: ${b.mm.toFixed(0)}mm`);
    const rainfallTotal =
      rainfallMm != null && isFinite(rainfallMm) ? rainfallMm.toFixed(0) + "mm" : "n/a";
    const waterNeed =
      typeof growthStage === "string" && WATER_NEED_BY_STAGE[growthStage]
        ? WATER_NEED_BY_STAGE[growthStage]
        : "keep the soil from drying out unless the crop is within ~2 weeks of harvest.";
    const rainfallSection =
      `Rainfall (last 21 days): ${rainfallTotal}${bucketsRows.length ? ` — weekly breakdown (oldest to most recent):\n${bucketsRows.join("\n")}` : "."}
Water need at this stage (${growthStage ?? "unknown"}): ${waterNeed}
Read the PATTERN of rain, not just the total — e.g. "most of the rain fell 2+ weeks ago and the last week has been dry" — and connect it to the crop's water need above. Never invent rainfall amounts or dates.`;

    // Last clearly-viewed optical reading: an honest anchor so the radar proxy
    // (or a blocked month) is never presented as a number floating in a vacuum.
    const lastClearSection =
      lastClearReading &&
      typeof lastClearReading.date === "string" &&
      typeof lastClearReading.ndvi === "number" &&
      isFinite(lastClearReading.ndvi)
        ? `Last clearly-viewed optical reading of this field: NDVI ${lastClearReading.ndvi.toFixed(2)} on ${lastClearReading.date}.
If the current reading is the radar proxy (or the month is cloud-blocked), say in words whether the radar reading and that last clear view point the same direction (e.g. "consistent with your last clear reading"), but NEVER present the two numbers as directly comparable. Be honest that the view has been blocked.`
        : "";

    const placeText = typeof locationName === "string" && locationName.trim() ? locationName.trim() : "Cambodia";
    const cropText =
      typeof cropEnglish === "string" && cropEnglish.trim() && cropEnglish.trim() !== "rice"
        ? `a farmer growing ${cropEnglish.trim()}`
        : "a rice farmer";
    // When the crop isn't rice, the client's growth-stage string comes from the
    // generic vegetative cycle (Vegetative / Flowering-Fruiting / Mature) —
    // remind the model not to read rice assumptions into it.
    const cropNote =
      typeof cropEnglish === "string" && cropEnglish.trim() && cropEnglish.trim() !== "rice"
        ? `\nCrop note: the plant here is ${cropEnglish.trim()}, not rice. Growth stage refers to a simple vegetative cycle (Vegetative / Flowering / Fruiting / Mature) — do not assume flooding, tillering or paddy management.`
        : "";

    const prompt = `You are explaining satellite crop health data to ${cropText} in ${placeText}.
Data: ${readingLine} LSWI (moisture) ${lswiValue?.toFixed(2) ?? "n/a"}, status: ${status}, growth stage: ${growthStage ?? "unknown"}, day ${dayCount ?? "?"} since planting.
${rainfallSection}
${historySection}
${lastClearSection}
${cropNote}
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
Data: ${readingLine} rainfall (21d) ${rainfallTotal}, status: ${status}, growth stage: ${growthStage ?? "unknown"}.
Water need at this stage: ${waterNeed}
${lastClearSection === "" ? "" : `Note: ${lastClearSection}`}
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

    // 4. Cache it (model_used is for our own auditing only) — skipped while the
    //    USE_EXPLANATION_CACHE test flag is off.
    if (USE_EXPLANATION_CACHE) {
      await supabase.from("ai_explanations").upsert({
        field_id: fieldId,
        ndvi_value: readingValue,
        status,
        explanation,
        model_used: modelUsed,
        truncated,
        created_at: new Date().toISOString(),
      });
    }

    return jsonResponse({ ok: true, explanation, truncated, cached: false }, 200, corsHeaders);
  } catch (e) {
    console.error(e);
    return jsonResponse({ ok: false, error: String(e) }, 500, corsHeaders);
  }
});
