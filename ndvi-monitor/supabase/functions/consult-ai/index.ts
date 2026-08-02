import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY") || "";
const DEEPSEEK_KEY = Deno.env.get("DEEPSEEK_API_KEY") || "";
const QWEN_KEY = Deno.env.get("QWEN_API_KEY") || "";
const APP_URL = Deno.env.get("APP_URL") || "*";
const DAILY_CAP = 20;
const PROVIDER_TIMEOUT_MS = 20_000;

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

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  ms: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Provider callers — each returns the explanation text on success or null on
// any failure (bad shape, HTTP error, timeout). Never throw, so the fallback
// chain below can move on cleanly.
// ---------------------------------------------------------------------------

async function callGemini(prompt: string): Promise<string | null> {
  if (!GEMINI_KEY) return null;
  try {
    const res = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            thinkingConfig: { thinkingLevel: "low" },
            maxOutputTokens: 500,
          },
        }),
      },
      PROVIDER_TIMEOUT_MS,
    );
    console.log("Gemini response status:", res.status);
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) {
      console.error(
        "Gemini returned no usable text. Full response:",
        JSON.stringify(data),
      );
    }
    return text || null;
  } catch (e) {
    console.error("Gemini call failed:", e);
    return null;
  }
}

async function callDeepSeek(prompt: string): Promise<string | null> {
  if (!DEEPSEEK_KEY) return null;
  try {
    const res = await fetchWithTimeout(
      "https://api.deepseek.com/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${DEEPSEEK_KEY}`,
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 500,
          temperature: 0.4,
        }),
      },
      PROVIDER_TIMEOUT_MS,
    );
    console.log("DeepSeek response status:", res.status);
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!text) {
      console.error(
        "DeepSeek returned no usable text. Full response:",
        JSON.stringify(data),
      );
    }
    return text || null;
  } catch (e) {
    console.error("DeepSeek call failed:", e);
    return null;
  }
}

async function callQwen(prompt: string): Promise<string | null> {
  if (!QWEN_KEY) return null;
  try {
    const res = await fetchWithTimeout(
      "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${QWEN_KEY}`,
        },
        body: JSON.stringify({
          model: "qwen3-max",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 500,
          temperature: 0.4,
        }),
      },
      PROVIDER_TIMEOUT_MS,
    );
    console.log("Qwen response status:", res.status);
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!text) {
      console.error(
        "Qwen returned no usable text. Full response:",
        JSON.stringify(data),
      );
    }
    return text || null;
  } catch (e) {
    console.error("Qwen call failed:", e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Orchestrator — tries providers in order, returns the first usable answer.
// The model label is only for our logs/cache, never shown to the farmer.
// ---------------------------------------------------------------------------

async function generateExplanation(
  prompt: string,
): Promise<{ text: string; model: string } | null> {
  const providers: [string, (p: string) => Promise<string | null>][] = [
    ["gemini-3.5-flash", callGemini],
    ["deepseek-chat", callDeepSeek],
    ["qwen3-max", callQwen],
  ];
  for (const [name, fn] of providers) {
    try {
      const text = await fn(prompt);
      if (text) return { text, model: name };
    } catch (e) {
      console.error(`Provider ${name} threw:`, e);
    }
  }
  return null;
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

    // 3. Generate the explanation (Gemini -> DeepSeek -> Qwen)
    const langLine =
      lang === "km"
        ? "Reply in plain, simple Khmer a rural farmer would understand."
        : "Reply in plain, simple English.";

    const prompt = `You are explaining satellite crop health data to a rice farmer in Battambang, Cambodia.
Data: NDVI ${ndviValue.toFixed(2)}, LSWI (moisture) ${lswiValue?.toFixed(2) ?? "n/a"}, rainfall (21d) ${rainfallMm != null ? rainfallMm.toFixed(0) : "n/a"}mm, status: ${status}, growth stage: ${growthStage ?? "unknown"}, day ${dayCount ?? "?"} since planting.
${langLine}
In 2-3 short sentences: describe what the numbers suggest, and name 1-2 possible causes as possibilities to check — never state a single cause as certain. End with one practical next step. Do not use technical jargon like "NDVI" or "LSWI" in the reply itself.`;

    const result = await generateExplanation(prompt);
    const explanation =
      result?.text ||
      "Could not generate an explanation right now — please try again.";
    const modelUsed = result?.model || "none";
    console.log("AI explanation served by:", modelUsed);

    // 4. Cache it (model_used is for our own auditing only)
    await supabase.from("ai_explanations").upsert({
      field_id: fieldId,
      ndvi_value: ndviValue,
      status,
      explanation,
      model_used: modelUsed,
      created_at: new Date().toISOString(),
    });

    return jsonResponse({ ok: true, explanation, cached: false });
  } catch (e) {
    console.error(e);
    return jsonResponse({ ok: false, error: String(e) }, 500);
  }
});
