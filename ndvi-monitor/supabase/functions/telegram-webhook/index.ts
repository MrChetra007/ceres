import { createClient } from "npm:@supabase/supabase-js@2"

// Edge Function: Telegram bot webhook.
//  - Phase 8.3: /start <code> account linking.
//  - Phase 13 Feature 2: ground-truth photo attachments. A farmer replies to an
//    alert with a phone photo; we store it in the private `field-photos`
//    bucket, link it to the right field (+ alert that prompted it), and confirm
//    back. When the field can't be inferred unambiguously we reply with an
//    inline keyboard and resolve it on the callback_query.
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

async function tg(method: string, payload: Record<string, unknown>) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) console.error(`Telegram ${method} failed:`, res.status, await res.text())
  return res
}

async function replyToChat(chatId: number, text: string, extra: Record<string, unknown> = {}) {
  try {
    await tg("sendMessage", { chat_id: chatId, text, ...extra })
  } catch (e) {
    console.error("sendMessage failed:", e)
  }
}

// ---------------------------------------------------------------------------
// Photo handling
// ---------------------------------------------------------------------------

async function getFile(fileId: string): Promise<string | null> {
  const res = await tg("getFile", { file_id: fileId })
  if (!res.ok) return null
  const data = await res.json()
  return data?.result?.file_path || null
}

async function downloadFileBytes(filePath: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`)
    if (!res.ok) return null
    return new Uint8Array(await res.arrayBuffer())
  } catch (e) {
    console.error("downloadFileBytes failed:", e)
    return null
  }
}

// Resolve the owner (and their fields) for a Telegram chat. Returns null if the
// chat isn't linked — caller should reply asking to link via /start.
async function ownerForChat(chatId: number): Promise<any | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, preferred_language")
    .eq("telegram_chat_id", String(chatId))
    .maybeSingle()
  if (error) {
    console.error("ownerForChat error:", error)
    return null
  }
  return data || null
}

const langIsKhmer = (owner: any) => (owner?.preferred_language || "en") === "km"

// Fields that belong to this owner and had an alert in the last 48h, most
// recent first (deduped per field).
async function recentlyAlertedFields(owner: any, fields: any[]): Promise<any[]> {
  if (!owner || fields.length === 0) return []
  const fieldIds = fields.map((f: any) => f.id)
  const { data, error } = await supabase
    .from("alerts_log")
    .select("id, field_id, sent_at")
    .in("field_id", fieldIds)
    .gte("sent_at", new Date(Date.now() - 48 * 3600_000).toISOString())
    .order("sent_at", { ascending: false })
  if (error) {
    console.error("alert query error:", error)
    return []
  }
  const seen = new Set<string>()
  const recent: any[] = []
  for (const a of data || []) {
    if (!a.field_id || seen.has(a.field_id)) continue
    seen.add(a.field_id)
    recent.push(a)
  }
  return recent
}

async function handlePhoto(update: any): Promise<Response> {
  const message = update.message
  const chatId = message.chat.id
  const photo = message.photo
  const owner = await ownerForChat(chatId)

  if (!owner) {
    await replyToChat(
      chatId,
      "I don't recognize your chat yet. Open the app, tap Telegram, and send /start with the code shown to link first.",
    )
    return new Response("ok")
  }

  const largest = photo[photo.length - 1]
  const fileId = largest.file_id
  const filePath = await getFile(fileId)
  if (!filePath) {
    await replyToChat(chatId, "I couldn't retrieve that photo. Please try again.")
    return new Response("ok")
  }
  const bytes = await downloadFileBytes(filePath)
  if (!bytes) {
    await replyToChat(chatId, "I couldn't download that photo. Please try again.")
    return new Response("ok")
  }

  const storagePath = `${owner.id}/${Date.now()}.jpg`
  const { error: upErr } = await supabase.storage
    .from("field-photos")
    .upload(storagePath, bytes, { contentType: "image/jpeg", upsert: false })
  if (upErr) {
    console.error("storage upload failed:", upErr)
    await replyToChat(chatId, "Something went wrong saving your photo. Please try again.")
    return new Response("ok")
  }

  // Figure out which field the photo belongs to.
  // 1. Owner's fields that had an alert in the last 48h, most recent first.
  const { data: ownerFields, error: fieldErr } = await supabase
    .from("fields")
    .select("id, name")
    .eq("owner_id", owner.id)
    .order("created_at", { ascending: true })
  if (fieldErr) console.error("fields query error:", fieldErr)
  const fields = ownerFields || []

  const recent = await recentlyAlertedFields(owner, fields)

  let targetFieldId: string | null = null
  let alertLogId: string | null = null

  if (recent.length === 1) {
    targetFieldId = recent[0].field_id
    alertLogId = recent[0].id
  } else if (recent.length === 0 && fields.length === 1) {
    targetFieldId = fields[0].id
  }

  if (targetFieldId) {
    await insertPhoto(owner.id, targetFieldId, alertLogId, storagePath)
    const field = fields.find((f: any) => f.id === targetFieldId) ||
      (recent.find((r: any) => r.field_id === targetFieldId) as any)
    const name = field?.name || "your field"
    await replyToChat(
      chatId,
      langIsKhmer(owner)
        ? `📸 បានទទួលរូបថតសម្រាប់ ${name} — សូមអរគុណ នេះជួយយើងយល់ពីស្ថានភាពកើតឡើង។`
        : `📸 Photo received for ${name} — thanks, this helps us understand what's happening.`,
    )
    return new Response("ok")
  }

  // Ambiguous: ask which field. Park the photo so the callback can resolve it.
  if (fields.length === 0) {
    await replyToChat(chatId, "You don't have any saved fields to attach this photo to yet.")
    return new Response("ok")
  }

  const fieldIds = fields.map((f: any) => f.id)
  const { error: pendingErr } = await supabase.from("pending_photo").insert({
    owner_id: owner.id,
    chat_id: String(chatId),
    telegram_file_id: fileId,
    telegram_file_path: filePath,
    storage_path: storagePath,
    field_ids: fieldIds,
  })
  if (pendingErr) console.error("pending insert error:", pendingErr)

  const keyboard = fields.map((f: any) => [
    { text: f.name, callback_data: `photo:${f.id}` },
  ])
  await replyToChat(
    chatId,
    langIsKhmer(owner)
      ? "រកឃើញវាលច្រើន។ តើរូបថតនេះមកពីវាលមួយណា?"
      : "I found a few fields. Which field is this photo from?",
    { reply_markup: { inline_keyboard: keyboard } },
  )
  return new Response("ok")
}

async function insertPhoto(
  ownerId: string,
  fieldId: string,
  alertLogId: string | null,
  storagePath: string,
) {
  const { error } = await supabase.from("field_photos").insert({
    field_id: fieldId,
    owner_id: ownerId,
    storage_path: storagePath,
    alert_log_id: alertLogId || null,
  })
  if (error) console.error("field_photos insert error:", error)
}

async function handleCallbackQuery(update: any): Promise<Response> {
  const cb = update.callback_query
  const chatId = cb.message.chat.id
  const data: string = cb.data || ""
  if (!data.startsWith("photo:")) return new Response("ok")

  const fieldId = data.slice("photo:".length)
  const owner = await ownerForChat(chatId)
  if (!owner) {
    await tg("answerCallbackQuery", { callback_query_id: cb.id, text: "Not linked. Open the app to link first." })
    return new Response("ok")
  }

  const { data: pending, error } = await supabase
    .from("pending_photo")
    .select("id, storage_path")
    .eq("chat_id", String(chatId))
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) console.error("pending lookup error:", error)

  const { data: fieldNameRow } = await supabase
    .from("fields")
    .select("name")
    .eq("id", fieldId)
    .eq("owner_id", owner.id)
    .maybeSingle()

  if (pending) {
    await insertPhoto(owner.id, fieldId, null, pending.storage_path)
    await supabase.from("pending_photo").delete().eq("id", pending.id)
  } else {
    // No pending row (user answered a stale keyboard). Nothing to resolve.
    await tg("answerCallbackQuery", { callback_query_id: cb.id, text: "That link has expired." })
    return new Response("ok")
  }

  await tg("answerCallbackQuery", { callback_query_id: cb.id })
  const name = fieldNameRow?.name || "your field"
  await replyToChat(
    chatId,
    langIsKhmer(owner)
      ? `📸 បានទទួលរូបថតសម្រាប់ ${name} — សូមអរគុណ នេះជួយយើងយល់ពីស្ថានភាពកើតឡើង។`
      : `📸 Photo received for ${name} — thanks, this helps us understand what's happening.`,
  )
  return new Response("ok")
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

  // Callback query (inline-keyboard response) takes priority.
  if (update?.callback_query) return handleCallbackQuery(update)

  const message = update?.message
  const chatId = message?.chat?.id
  if (chatId == null) return new Response("ok")

  // Photo message → ground-truth attachment.
  if (message?.photo && message.photo.length > 0) return handlePhoto(update)

  const text = message?.text?.trim()
  if (typeof text !== "string") return new Response("ok")

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
    "Linked! You will now receive field stress alerts here. You can disconnect from the app's menu anytime.",
  )
  return new Response("ok")
})
