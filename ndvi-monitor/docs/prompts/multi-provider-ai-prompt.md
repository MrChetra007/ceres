# Multi-provider AI fallback for Consult AI (Gemini → DeepSeek → Qwen)

## Goal

Wrap the LLM call behind one internal function that tries providers in order
and returns a normalized result, so the rest of the app never needs to know
which provider actually answered. Log which model responded (for our own
debugging) but never show the provider name in the farmer-facing UI — keep
the "AI-generated interpretation..." framing identical regardless of backend.

## Secrets needed

```
supabase secrets set GEMINI_API_KEY="..."
supabase secrets set DEEPSEEK_API_KEY="..."
supabase secrets set QWEN_API_KEY="..."
```

(Get DeepSeek and Qwen keys from their respective platforms — DeepSeek via
platform.deepseek.com, Qwen via Alibaba Cloud Model Studio / DashScope, or
via OpenRouter if that's simpler for a single unified key across multiple
open models — your choice, just confirm which route before wiring secrets.)

## Changes to `supabase/functions/consult-ai/index.ts`

1. **Extract a normalized caller function per provider.** Each should take
   `(prompt: string)` and return `Promise<string | null>` — the explanation
   text on success, or `null` on any failure (bad response shape, HTTP error,
   timeout). Never throw out of these — catch internally and return `null` so
   the fallback chain can proceed cleanly.
   - `callGemini(prompt)` — existing logic, using `gemini-3.5-flash` with
     `generationConfig: { thinkingConfig: { thinkingLevel: "low" }, maxOutputTokens: 500 }`
   - `callDeepSeek(prompt)` — DeepSeek's API is OpenAI-compatible
     (`https://api.deepseek.com/chat/completions`), so this can reuse a
     standard OpenAI-shaped request/response parser. Use `deepseek-chat`
     as the model. Cap `max_tokens` similarly (~400-500).
   - `callQwen(prompt)` — also OpenAI-compatible if going through
     DashScope's compatible-mode endpoint or OpenRouter. Use whichever
     current Qwen chat model string is documented for text (not image/audio)
     tasks.

2. **Add a top-level orchestrator:**

   ```ts
   async function generateExplanation(
     prompt: string,
   ): Promise<{ text: string; model: string } | null> {
     const providers: [string, (p: string) => Promise<string | null>][] = [
       ["gemini-3.5-flash", callGemini],
       ["deepseek-v4-flash", callDeepSeek],
       ["qwen3-max", callQwen], // use the real model string you pick
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
   ```

3. **In the main handler**, replace the direct Gemini call with:

   ```ts
   const result = await generateExplanation(prompt);
   const explanation =
     result?.text ||
     "Could not generate an explanation right now — please try again.";
   const modelUsed = result?.model || "none";
   console.log("AI explanation served by:", modelUsed);
   ```

4. **Update the `ai_explanations` cache table and insert** to also store which
   model answered:

   ```sql
   alter table ai_explanations add column model_used text;
   ```

   ```ts
   await supabase.from("ai_explanations").upsert({
     field_id: fieldId,
     ndvi_value: ndviValue,
     status,
     explanation,
     model_used: modelUsed,
     created_at: new Date().toISOString(),
   });
   ```

   This is purely for our own debugging/auditing later — never surfaced in
   the frontend response or UI.

5. **Do not change the response shape sent back to the frontend** — still
   just `{ ok: true, explanation, cached }`. `modelUsed` stays server-side
   only, in logs and the cache table, not in the API response.

## Testing

- Temporarily use an invalid Gemini key (or a wrong model name) to force a
  failure, and confirm the request falls through to DeepSeek and still
  returns a usable explanation.
- Check `supabase functions logs consult-ai` after a real call — confirm
  "AI explanation served by: ..." shows the expected provider.
- Confirm Khmer output quality from whichever provider actually answers in a
  forced-fallback test — this is the thing worth eyeballing personally, not
  just checking that it returns _something_.

Show me the diff for the full file, plus the SQL migration for the new column.
