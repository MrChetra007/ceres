import { createClient } from "npm:@supabase/supabase-js@2"

// Edge Function: Telegram bot webhook — Phase 8.3 account linking.
// Receives /start <code> messages from the Telegram bot, matches the one-time
// code in `link_codes`, and writes the chat id onto the user's `profiles` row.
//
// Env (set via `supabase secrets set`):
//   TELEGRAM_BOT_TOKEN            — token from @BotFather
//   SUPABASE_URL                  — auto-provided by Supabase
//   SUPABASE_SERVICE_ROLE_KEY     — auto-provided by Supabase (bypasses RLS)
//
// Register the webhook (run once after deploying):
//   curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
//     -H "Content-Type: application/json" \
//     -d '{"url":"https://wopwwtnvqyomiwbsxiks.functions.supabase.co/telegram-webhook"}'

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") || ""
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || ""
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)

async function replyToChat(chatId: number, text: string) {
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    })
  } catch (e) {
    console.error("sendMessage failed:", e)
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: { "Access-Control-Allow-Origin": "*" },
    })
  }
  if (req.method !== "POST") return new Response("ok")

  if (!BOT_TOKEN) {
    console.error("TELEGRAM_BOT_TOKEN not set")
    return new Response("ok")
  }

  let update
  try {
    update = await req.json()
  } catch (e) {
    console.error("bad json:", e)
    return new Response("ok")
  }

  const message = update?.message
  const chatId = message?.chat?.id
  const text = message?.text?.trim()
  if (chatId == null || typeof text !== "string") return new Response("ok")

  // Only handle /start <code> (ignore /start with no code, group messages, etc.)
  if (!text.startsWith("/start")) return new Response("ok")
  const code = text.split(/\s+/)[1]?.trim().toUpperCase()
  if (!code) {
    await replyToChat(chatId, "Send the code shown in the app, like /start ABC123")
    return new Response("ok")
  }

  // Look up the code. RLS is bypassed via service_role — that's required here
  // because the bot has no logged-in user; no public "select by code" policy exists.
  const { data: link, error: linkErr } = await supabase
    .from("link_codes")
    .select("code, user_id, expires_at, used")
    .eq("code", code)
    .maybeSingle()

  if (linkErr) {
    console.error("link lookup error:", linkErr)
    await replyToChat(chatId, "Something went wrong. Please try again.")
    return new Response("ok")
  }

  if (!link) {
    await replyToChat(chatId, "That code is invalid. Open the app and generate a new one.")
    return new Response("ok")
  }

  if (link.used) {
    await replyToChat(chatId, "That code was already used. Open the app and generate a new one.")
    return new Response("ok")
  }

  if (new Date(link.expires_at).getTime() < Date.now()) {
    await replyToChat(chatId, "That code has expired. Open the app and generate a new one.")
    return new Response("ok")
  }

  // Save the chat id onto the user's profile (atomic: also consumes the code).
  const { error: redeemErr } = await supabase.rpc("redeem_link_code", {
    code_input: link.code,
    chat_id_input: String(chatId),
    user_id_input: link.user_id,
  })

  if (redeemErr) {
    console.error("redeem error:", redeemErr)
    await replyToChat(chatId, "Could not link this account. It may already be linked to another user.")
    return new Response("ok")
  }

  await replyToChat(
    chatId,
    "Linked! You will now receive field stress alerts here. You can disconnect from the app's menu anytime."
  )
  return new Response("ok")
})
