import { createClient } from '@supabase/supabase-js'
import turfCentroid from '@turf/centroid'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config'

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})

export function mapRowToField(row) {
  return {
    id: row.id,
    name: row.name,
    geojson: row.geojson,
    areaHectares: row.area_ha,
    plantingDate: row.planting_date,
    plantingDateSource: row.planting_date_source || 'manual',
    cropName: row.crop_name ?? null,
    cropEnglish: row.crop_english ?? null,
    provinceCode: row.province_code ?? null,
    districtCode: row.district_code ?? null,
    communeCode: row.commune_code ?? null,
    villageCode: row.village_code ?? null,
    shareWithAuthorities: !!row.share_with_authorities,
    centroidLat: row.centroid_lat ?? null,
    centroidLng: row.centroid_lng ?? null,
    notes: row.notes,
    createdAt: row.created_at,
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// A session is only usable if it carries a real access token. Right after
// sign-in (email/password submit or OAuth redirect back) supabase-js can emit
// SIGNED_IN while the session object is still settling — getSession() may
// return null or an access_token of '' for a tick. Sending that empty Bearer
// header makes the server answer 401, producing exactly the "auth only works
// after a page refresh" symptom.
function tokenUsable(session) {
  return !!(session && typeof session.access_token === 'string' && session.access_token.length > 0)
}

// Force an access-token refresh with the stored refresh token. Exportable so
// callers with a bare fetch (services/earthEngine.js) can also retry a
// rejected request with a guaranteed-fresh token instead of erroring the load.
export async function refreshSession() {
  const { data, error } = await sb.auth.refreshSession()
  if (error || !data || !data.session || !tokenUsable(data.session)) {
    await sb.auth.signOut().catch(() => {})
    throw new Error('Session expired \u2014 please sign in again')
  }
  return data.session
}

async function readSession() {
  const { data, error } = await sb.auth.getSession()
  if (error) throw error
  return data && data.session ? data.session : null
}

// Returns a valid session, refreshing the access token if it's stale/expired or
// missing. Throws a clear message if there is genuinely no active session —
// callers can surface that as "please sign in again" instead of a confusing RLS
// error.
export async function requireSession() {
  let session = await readSession()

  // The sign-in race: SUPABASE auth emits SIGNED_IN before getSession() is
  // guaranteed to return the finished session. Give a null/empty session two
  // short retries before deciding the user is signed out.
  if (!tokenUsable(session)) {
    await sleep(100)
    session = await readSession()
    if (!tokenUsable(session)) {
      await sleep(200)
      session = await readSession()
    }
  }

  if (!session) throw new Error('Please sign in to continue')

  if (!tokenUsable(session)) {
    // A session handle exists but carries no access token. Refresh it rather
    // than sending an empty Authorization header; if there is no refresh token
    // at all there is nothing to refresh with, so treat it as signed out.
    if (!session.refresh_token) throw new Error('Please sign in to continue')
    session = await refreshSession()
  }

  // expires_at of 0/undefined means we can't trust the expiry — refresh instead
  // of shipping a possibly-dead token to the server.
  const expMs = session.expires_at ? session.expires_at * 1000 : 0
  if (expMs < Date.now() + 60000) {
    session = await refreshSession()
  }
  return session
}

export async function loadFields() {
  const { data, error } = await sb
    .from('fields')
    .select('*')
    .order('created_at')
  if (error) throw error
  return (data || []).map(mapRowToField)
}

// Compute a single lat/lng point for a field's stored GeoJSON (Feature or bare
// geometry), used for weather lookups. Returns { centroid_lat, centroid_lng }
// or {} if the geometry can't be reduced to a centroid. Coordinate order is
// GeoJSON [longitude, latitude] — Turf handles that for us.
export function fieldCentroid(geojson) {
  try {
    const geom = geojson && (geojson.geometry || geojson)
    if (!geom || !geom.coordinates) return {}
    const c = turfCentroid(geom)
    const coord = c && c.geometry && c.geometry.coordinates
    if (!coord || !isFinite(coord[0]) || !isFinite(coord[1])) return {}
    return { centroid_lng: coord[0], centroid_lat: coord[1] }
  } catch {
    return {}
  }
}

export async function insertField({
  name, geojson, area_ha, planting_date, planting_date_source, crop_name, crop_english,
  province_code, district_code, commune_code, village_code, share_with_authorities,
}) {
  const session = await requireSession()
  const centroid = fieldCentroid(geojson)
  const { data, error } = await sb
    .from('fields')
    .insert({
      name, geojson, area_ha, planting_date,
      planting_date_source: planting_date_source || 'manual',
      crop_name: crop_name || null,
      crop_english: crop_english || null,
      province_code: province_code || null,
      district_code: district_code || null,
      commune_code: commune_code || null,
      village_code: village_code || null,
      share_with_authorities: !!share_with_authorities,
      owner_id: session.user.id,
      ...centroid,
    })
    .select()
    .single()
  if (error) throw error
  return mapRowToField(data)
}

export async function updateField(id, patch) {
  const { error } = await sb.from('fields').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteField(id) {
  const { error } = await sb.from('fields').delete().eq('id', id)
  if (error) throw error
}

export function mapRowToAoi(row) {
  return {
    id: row.id,
    name: row.name,
    bounds: row.bounds,
    createdAt: row.created_at,
  }
}

export async function loadAois() {
  const { data, error } = await sb
    .from('aois')
    .select('*')
    .order('created_at')
  if (error) throw error
  return (data || []).map(mapRowToAoi)
}

export async function insertAoi({ name, bounds }) {
  const session = await requireSession()
  const { data, error } = await sb
    .from('aois')
    .insert({ name, bounds, owner_id: session.user.id })
    .select()
    .single()
  if (error) throw error
  return mapRowToAoi(data)
}

export async function updateAoi(id, patch) {
  const { error } = await sb.from('aois').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteAoi(id) {
  const { error } = await sb.from('aois').delete().eq('id', id)
  if (error) throw error
}

// Google OAuth sign-in is disabled until the provider is configured (see the
// commented-out button in AuthOverlay.vue). Re-enable by restoring this.
// export async function signInWithGoogle() {
//   return sb.auth.signInWithOAuth({ provider: 'google' })
// }

export async function signInWithEmailPassword(email, password) {
  return sb.auth.signInWithPassword({ email, password })
}

export async function signUpWithEmail(email, password) {
  return sb.auth.signUp({ email, password })
}

export async function signOut() {
  return sb.auth.signOut()
}

// ---------------------------------------------------------------------------
// Telegram linking (Phase 8.3)
// ---------------------------------------------------------------------------
export async function getMyProfile() {
  // Filter by the signed-in user explicitly instead of relying on RLS alone;
  // a filterless .maybeSingle() breaks (multiple rows) if the profiles RLS
  // policy is ever loosened.
  const session = await requireSession()
  const { data, error } = await sb
    .from('profiles')
    .select(
      'telegram_chat_id, preferred_language, role, subscription_tier, subscription_status, subscription_source, subscription_renews_at, max_aois, max_hectares, consult_ai_enabled'
    )
    .eq('id', session.user.id)
    .maybeSingle()
  if (error) throw error
  return data || {
    telegram_chat_id: null,
    preferred_language: 'en',
    role: 'farmer',
    subscription_tier: 'free',
    subscription_status: 'active',
    subscription_source: 'none',
    subscription_renews_at: null,
    max_aois: 1,
    max_hectares: 10,
    consult_ai_enabled: false,
  }
}

// ---------------------------------------------------------------------------
// Subscription / billing (ABA PayWay)
// ---------------------------------------------------------------------------
// Real checkout: calls the initiate-payment Edge Function, which performs the
// ABA Purchase server-side and returns a scan-to-pay QR + ABA Mobile deeplink
// for display. Replaces the old upgrade_my_subscription() placeholder, which
// migration 014 locked to service_role (that RPC now fails for signed-in users
// — intended). The amount is never trusted from the client — it's looked up
// from subscription_prices on the server.
export async function startAbaCheckout(tier) {
  const { data, error } = await sb.functions.invoke('initiate-payment', {
    body: { tier },
  })
  if (error) throw new Error(error.message || 'Could not start checkout')
  if (!data || data.ok === false) {
    throw new Error((data && data.message) || (data && data.error) || 'Could not start checkout')
  }
  return data
}

// Wait for the payment_transactions row for a given tran_id to leave 'pending'.
// Polls every {intervalMs} until the status becomes 'approved' or 'failed', or
// until {timeoutMs} elapses (matching the ABA QR lifetime) — resolves with the
// final status ('pending' if it timed out). The authoritative status flip is
// written by finalize_aba_payment via the webhook; RLS lets the owner select
// their own rows.
export async function waitForPayment(tranId, { intervalMs = 3000, timeoutMs = 120000 } = {}) {
  const start = Date.now()
  let lastStatus = 'pending'
  for (;;) {
    if (Date.now() - start >= timeoutMs) return lastStatus
    try {
      const { data, error } = await sb
        .from('payment_transactions')
        .select('status')
        .eq('tran_id', tranId)
        .maybeSingle()
      if (!error && data) {
        lastStatus = data.status
        if (data.status === 'approved' || data.status === 'failed') return data.status
      }
    } catch (e) {
      // transient — keep polling
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }
}

export async function cancelSubscription() {
  const { error } = await sb.rpc('cancel_my_subscription')
  if (error) throw error
}

export async function loadBillingEvents() {
  const { data, error } = await sb
    .from('billing_events')
    .select('event_type, tier, source, notes, created_at')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function insertLinkCode(code, userId, expiresAt) {
  const { data, error } = await sb
    .from('link_codes')
    .insert({ code, user_id: userId, expires_at: expiresAt })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function clearTelegramChatId() {
  const session = await requireSession()
  const { error } = await sb.from('profiles').update({ telegram_chat_id: null }).eq('id', session.user.id)
  if (error) throw error
}

export async function setPreferredLanguage(lang) {
  const session = await requireSession()
  const { error } = await sb.from('profiles').update({ preferred_language: lang }).eq('id', session.user.id)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Ground-truth field photos (Phase 13 Feature 2)
// ---------------------------------------------------------------------------
export async function loadFieldPhotos(fieldId) {
  const { data, error } = await sb
    .from('field_photos')
    .select('id, storage_path, caption, created_at')
    .eq('field_id', fieldId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function createSignedPhotoUrl(storagePath, expiresIn = 3600) {
  const { data, error } = await sb.storage
    .from('field-photos')
    .createSignedUrl(storagePath, expiresIn)
  if (error) throw error
  return data ? data.signedUrl : null
}

// ---------------------------------------------------------------------------
// Phase 2 feedback loop — field checks + action/feedback log
// ---------------------------------------------------------------------------
export async function loadFieldObservations(fieldId, limit = 20) {
  const { data, error } = await sb
    .from('field_observations')
    .select('id, observed_on, tags, outcome, notes, photo_path, source, created_at')
    .eq('field_id', fieldId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data || []
}

function fileExtension(file) {
  const name = (file && file.name) || ''
  const m = /\.([a-z0-9]+)$/i.exec(name)
  if (m) return m[1].toLowerCase()
  const type = (file && file.type) || ''
  if (type.includes('png')) return 'png'
  if (type.includes('webp')) return 'webp'
  return 'jpg'
}

// Save an "I checked my field" observation. The optional photo goes into the
// same private field-photos bucket (path {owner_id}/{ts}.jpg), so the signed-URL
// helper used by the photo strip works unchanged.
export async function saveFieldObservation({ fieldId, tags, outcome, notes, photoFile }) {
  const session = await requireSession()
  let photoPath = null
  if (photoFile) {
    photoPath = `${session.user.id}/${Date.now()}.${fileExtension(photoFile)}`
    const { error: upErr } = await sb.storage
      .from('field-photos')
      .upload(photoPath, photoFile, {
        contentType: photoFile.type || 'image/jpeg',
        upsert: false,
      })
    if (upErr) throw upErr
  }
  const { data, error } = await sb
    .from('field_observations')
    .insert({
      field_id: fieldId,
      owner_id: session.user.id,
      tags: Array.isArray(tags) ? tags : [],
      outcome: outcome || 'unknown',
      notes: notes && notes.trim() ? notes.trim() : null,
      photo_path: photoPath,
      source: 'app',
    })
    .select('id, observed_on, tags, outcome, notes, photo_path, source, created_at')
    .single()
  if (error) throw error
  return data
}

export async function getLatestAlertId(fieldId) {
  const { data, error } = await sb
    .from('alerts_log')
    .select('id')
    .eq('field_id', fieldId)
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data ? data.id : null
}

export async function loadLatestFieldAction(fieldId) {
  const { data, error } = await sb
    .from('field_actions')
    .select('id, status, useful, reason, snooze_until, created_at')
    .eq('field_id', fieldId)
    // Ratings do not affect "acknowledged" state — only these three do.
    .in('status', ['done', 'snoozed', 'dismissed'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data || null
}

export async function logFieldAction({
  fieldId,
  alertId = null,
  decisionTier = null,
  actionKey = null,
  status = 'done',
  useful = null,
  reason = null,
  snoozeUntil = null,
  notes = null,
}) {
  const session = await requireSession()
  const { error } = await sb.from('field_actions').insert({
    field_id: fieldId,
    owner_id: session.user.id,
    alert_id: alertId || null,
    decision_tier: decisionTier || null,
    action_key: actionKey || null,
    status,
    useful: useful === null || useful === undefined ? null : !!useful,
    reason: reason && String(reason).trim() ? String(reason).trim() : null,
    snooze_until: snoozeUntil || null,
    notes: notes || null,
  })
  if (error) throw error
}
