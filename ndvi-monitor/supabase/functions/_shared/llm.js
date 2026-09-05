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
const PROVIDER_TIMEOUT_MS = 20_000;
async function fetchWithTimeout(url, options, ms) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    }
    finally {
        clearTimeout(timer);
    }
}
async function callGemini(prompt) {
    if (!GEMINI_KEY)
        return null;
    try {
        const res = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${GEMINI_KEY}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    thinkingConfig: { thinkingLevel: "low" },
                    maxOutputTokens: 800,
                },
            }),
        }, PROVIDER_TIMEOUT_MS);
        console.log("Gemini response status:", res.status);
        const data = await res.json();
        const candidate = data?.candidates?.[0];
        const text = candidate?.content?.parts?.[0]?.text?.trim();
        const finishReason = candidate?.finishReason || null;
        if (!text) {
            console.error("Gemini returned no usable text. Full response:", JSON.stringify(data));
        }
        // Gemini API surface: MAX_TOKENS / STOP / BLOCKED / SAFETY / RECITATION.
        const truncated = text
            ? finishReason === "MAX_TOKENS" || finishReason === "RECITATION"
            : false;
        return text ? { text, truncated, finishReason } : null;
    }
    catch (e) {
        console.error("Gemini call failed:", e);
        return null;
    }
}
async function callDeepSeek(prompt) {
    if (!DEEPSEEK_KEY)
        return null;
    try {
        const res = await fetchWithTimeout("https://api.deepseek.com/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${DEEPSEEK_KEY}`,
            },
            body: JSON.stringify({
                model: "deepseek-v4-flash",
                messages: [{ role: "user", content: prompt }],
                max_tokens: 800,
                temperature: 0.4,
            }),
        }, PROVIDER_TIMEOUT_MS);
        console.log("DeepSeek response status:", res.status);
        const data = await res.json();
        const choice = data?.choices?.[0];
        const text = choice?.message?.content?.trim();
        const finishReason = choice?.finish_reason || null;
        if (!text) {
            console.error("DeepSeek returned no usable text. Full response:", JSON.stringify(data));
        }
        const truncated = text ? finishReason === "length" : false;
        return { text, truncated, finishReason };
    }
    catch (e) {
        console.error("DeepSeek call failed:", e);
        return null;
    }
}
async function callQwen(prompt) {
    if (!QWEN_KEY)
        return null;
    try {
        const res = await fetchWithTimeout("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${QWEN_KEY}`,
            },
            body: JSON.stringify({
                model: "qwen3-max",
                messages: [{ role: "user", content: prompt }],
                max_tokens: 800,
                temperature: 0.4,
            }),
        }, PROVIDER_TIMEOUT_MS);
        console.log("Qwen response status:", res.status);
        const data = await res.json();
        const choice = data?.choices?.[0];
        const text = choice?.message?.content?.trim();
        const finishReason = choice?.finish_reason || null;
        if (!text) {
            console.error("Qwen returned no usable text. Full response:", JSON.stringify(data));
        }
        const truncated = text ? finishReason === "length" : false;
        return { text, truncated, finishReason };
    }
    catch (e) {
        console.error("Qwen call failed:", e);
        return null;
    }
}
// ---------------------------------------------------------------------------
// Orchestrator — tries providers in order, returns the first usable answer.
// The model label is for internal auditing only, never shown to the farmer.
// ---------------------------------------------------------------------------
export async function generateExplanation(prompt, concisePrompt) {
    const providers = [
        ["gemini-3.5-flash", callGemini],
        ["deepseek-v4-flash", callDeepSeek],
        ["qwen3-max", callQwen],
    ];
    for (const [name, fn] of providers) {
        try {
            const first = await fn(prompt);
            if (!first?.text)
                continue;
            // If the first pass hit the output token ceiling, retry the SAME provider
            // with a hard-trimmed "just be short" prompt (cheaper + faster than
            // bouncing to the next provider, and usually lands under budget).
            if (first.truncated && concisePrompt) {
                console.log(`AI provider ${name} truncated (${first.finishReason}) — retrying with concise prompt`);
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
        }
        catch (e) {
            console.error(`Provider ${name} threw:`, e);
        }
    }
    return null;
}
// A language-targeting helper so callers don't hand-roll the same two lines.
export function languageLine(lang) {
    return lang === "km"
        ? "Reply entirely in plain, simple Khmer (the language of Cambodia) that a rural farmer would understand. Do not mix in English words except essential place names."
        : "Reply entirely in plain, simple English.";
}
