import { createClient } from '@supabase/supabase-js'
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
    notes: row.notes,
    createdAt: row.created_at,
  }
}

// Returns a valid session, refreshing the access token if it's stale/expired.
// Throws a clear message if there is genuinely no active session — callers can
// surface that as "please sign in again" instead of a confusing RLS error.
export async function requireSession() {
  const { data, error } = await sb.auth.getSession()
  if (error) throw error
  let session = data && data.session ? data.session : null
  if (session) {
    const expMs = session.expires_at ? session.expires_at * 1000 : Infinity
    if (expMs < Date.now() + 60000) {
      const { data: refreshed, error: refreshErr } = await sb.auth.refreshSession()
      if (refreshErr || !refreshed.session) {
        await sb.auth.signOut().catch(() => {})
        throw new Error('Session expired \u2014 please sign in again')
      }
      session = refreshed.session
    }
  }
  if (!session) throw new Error('Please sign in to continue')
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

export async function insertField({ name, geojson, area_ha, planting_date, planting_date_source }) {
  const session = await requireSession()
  const { data, error } = await sb
    .from('fields')
    .insert({
      name, geojson, area_ha, planting_date,
      planting_date_source: planting_date_source || 'manual',
      owner_id: session.user.id,
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

export async function signInWithGoogle() {
  return sb.auth.signInWithOAuth({ provider: 'google' })
}

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
  const { data, error } = await sb.from('profiles').select('telegram_chat_id, preferred_language').maybeSingle()
  if (error) throw error
  return data || { telegram_chat_id: null, preferred_language: 'en' }
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
