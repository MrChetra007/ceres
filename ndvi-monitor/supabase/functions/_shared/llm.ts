// Shared LLM provider-fallback orchestrator — Phase 13 Feature 1.
//
// Extracted from supabase/functions/consult-ai/index.ts so both consult-ai and
// the ee-alerts-worker can generate LLM text with the same Gemini → DeepSeek →
// Qwen fallback chain. Each provider caller returns a ProviderResult (or null)
// and never throws, so a single provider's outage/quota/404 never blocks the
// caller. ProviderResult.truncated signals a finish_reason of "length" /
// "MAX_TOKENS" so callers never mistake a cut-off answer for a complete one.
//
// Env secrets (set once at the Supabase project level via `supabase secrets set`):
//   GEMINI_API_KEY, DEEPSEEK_API_KEY, QWEN_API_KEY

const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY") || "";
const DEEPSEEK_KEY = Deno.env.get("DEEPSEEK_API_KEY") || "";
const QWEN_KEY = Deno.env.get("QWEN_API_KEY") || "";

// TEST FLAGS: per-provider on/off switch. Set false to exclude a provider from
// the fallback chain for A/B testing.
//   3 true  -> Gemini -> DeepSeek -> Qwen (normal fallback)
//   2 true  -> only those two, in their original order
//   1 true  -> only that one model
//   0 true  -> nothing runs (generateExplanation returns null)
const USE_GEMINI = true;
const USE_DEEPSEEK = true;
const USE_QWEN = true;

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

// A provider result carries two signals separately:
//   truncated - true when the provider hit its output token ceiling
//               (finish_reason applied, not natural finish). Callers can then
//               retry with a shorter prompt or tell the user the answer is cut
//               short instead of displaying a sentence that trails off.
//   finishReason - the raw provider reason, for logging/auditing.
interface ProviderResult {
  text: string;
  truncated: boolean;
  finishReason: string | null;
}

async function callGemini(prompt: string): Promise<ProviderResult | null> {
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
            maxOutputTokens: 2048,
          },
        }),
      },
      PROVIDER_TIMEOUT_MS,
    );
    console.log("Gemini response status:", res.status);
    const data = await res.json();
    const candidate = data?.candidates?.[0];
    const text = candidate?.content?.parts?.[0]?.text?.trim();
    const finishReason = candidate?.finishReason || null;
    if (!text) {
      console.error(
        "Gemini returned no usable text. Full response:",
        JSON.stringify(data),
      );
    }
    // RECITATION means the model reproduced memorized content and cut itself off
    // before a real answer — that's never a usable explanation. Fail THIS
    // provider so the fallback chain (DeepSeek/Qwen) serves a proper answer.
    if (text && finishReason === "RECITATION") {
      console.error("Gemini flagged RECITATION \u2014 falling through to next provider");
      return null;
    }
    // Gemini API surface: MAX_TOKENS / STOP / BLOCKED / SAFETY / RECITATION.
    const truncated = text ? finishReason === "MAX_TOKENS" : false;
    return text ? { text, truncated, finishReason } : null;
  } catch (e) {
    console.error("Gemini call failed:", e);
    return null;
  }
}

async function callDeepSeek(prompt: string): Promise<ProviderResult | null> {
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
          max_tokens: 2048,
          temperature: 0.4,
        }),
      },
      PROVIDER_TIMEOUT_MS,
    );
    console.log("DeepSeek response status:", res.status);
    const data = await res.json();
    const choice = data?.choices?.[0];
    const text = choice?.message?.content?.trim();
    const finishReason = choice?.finish_reason || null;
    if (!text) {
      console.error(
        "DeepSeek returned no usable text. Full response:",
        JSON.stringify(data),
      );
    }
    const truncated = text ? finishReason === "length" : false;
    return { text, truncated, finishReason };
  } catch (e) {
    console.error("DeepSeek call failed:", e);
    return null;
  }
}

async function callQwen(prompt: string): Promise<ProviderResult | null> {
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
          max_tokens: 2048,
          temperature: 0.4,
          // Qwen3 defaults to a thinking mode that can leak its internal
          // planning checklist ("did we mention radar? Yes (...)") as the
          // answer. Turn it off — we want the plain explanation only.
          enable_thinking: false,
        }),
      },
      PROVIDER_TIMEOUT_MS,
    );
    console.log("Qwen response status:", res.status);
    const data = await res.json();
    const choice = data?.choices?.[0];
    const text = choice?.message?.content?.trim();
    const finishReason = choice?.finish_reason || null;
    if (!text) {
      console.error(
        "Qwen returned no usable text. Full response:",
        JSON.stringify(data),
      );
    }
    const truncated = text ? finishReason === "length" : false;
    return { text, truncated, finishReason };
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
  concisePrompt?: string,
): Promise<{ text: string; model: string; truncated: boolean } | null> {
  // Only enabled providers take part in the chain, in their fixed order.
  const providers: [string, (p: string) => Promise<ProviderResult | null>][] = [];
  if (USE_GEMINI) providers.push(["gemini-3.5-flash", callGemini]);
  if (USE_DEEPSEEK) providers.push(["deepseek-v4-flash", callDeepSeek]);
  if (USE_QWEN) providers.push(["qwen3-max", callQwen]);
  if (!providers.length) {
    console.error("All AI providers disabled — no provider chain to run");
    return null;
  }
  for (const [name, fn] of providers) {
    try {
      const first = await fn(prompt);
      if (!first?.text) continue;
      // A model that answers with its own planning checklist ("did we mention
      // radar? Yes (...)") instead of the explanation is a failed provider —
      // bounce to the next one rather than showing the trace to the farmer.
      if (/Yes \("|\{\*|^\s*\*[^*]?\s*\*/.test(first.text)) {
        console.error(
          `AI provider ${name} returned a plan/checklist instead of an answer — falling through`,
        );
        continue;
      }
      // If the first pass hit the output token ceiling, retry the SAME provider
      // with a hard-trimmed "just be short" prompt (cheaper + faster than
      // bouncing to the next provider, and usually lands under budget).
      if (first.truncated && concisePrompt) {
        console.log(
          `AI provider ${name} truncated (${first.finishReason}) — retrying with concise prompt`,
        );
        const second = await fn(concisePrompt);
        if (second?.text) {
          return {
            text: second.text,
            model: name,
            truncated: second.truncated,
          };
        }
      }
      return { text: first.text, model: name, truncated: first.truncated };
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