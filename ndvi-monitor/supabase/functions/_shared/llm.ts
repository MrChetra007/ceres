// Shared LLM provider-fallback orchestrator — Phase 13 Feature 1.
//
// Extracted from supabase/functions/consult-ai/index.ts so both consult-ai and
// the ee-alerts-worker can generate LLM text with the same Gemini → DeepSeek →
// Qwen fallback chain. Each provider caller returns string | null and never
// throws, so a single provider's outage/quota/404 never blocks the caller.
//
// Env secrets (set once at the Supabase project level via `supabase secrets set`):
//   GEMINI_API_KEY, DEEPSEEK_API_KEY, QWEN_API_KEY

const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY") || "";
const DEEPSEEK_KEY = Deno.env.get("DEEPSEEK_API_KEY") || "";
const QWEN_KEY = Deno.env.get("QWEN_API_KEY") || "";

const PROVIDER_TIMEOUT_MS = 20_000;

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
            maxOutputTokens: 800,
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
          model: "deepseek-v4-flash",
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
// The model label is for internal auditing only, never shown to the farmer.
// ---------------------------------------------------------------------------

export async function generateExplanation(
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

// A language-targeting helper so callers don't hand-roll the same two lines.
export function languageLine(lang: string): string {
  return lang === "km"
    ? "Reply entirely in plain, simple Khmer (the language of Cambodia) that a rural farmer would understand. Do not mix in English words except essential place names."
    : "Reply entirely in plain, simple English.";
}