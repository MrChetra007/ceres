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
    notes: row.notes,
    createdAt: row.created_at,
  }
}

export async function loadFields() {
  const { data, error } = await sb
    .from('fields')
    .select('*')
    .order('created_at')
  if (error) throw error
  return (data || []).map(mapRowToField)
}

export async function insertField({ name, geojson, area_ha, planting_date }) {
  const { data, error } = await sb
    .from('fields')
    .insert({ name, geojson, area_ha, planting_date })
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
  const { data, error } = await sb
    .from('aois')
    .insert({ name, bounds })
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

export async function signOut() {
  return sb.auth.signOut()
}

// ---------------------------------------------------------------------------
// Telegram linking (Phase 8.3)
// ---------------------------------------------------------------------------
export async function getMyProfile() {
  const { data, error } = await sb.from('profiles').select('telegram_chat_id').maybeSingle()
  if (error) throw error
  return data || { telegram_chat_id: null }
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
  const { error } = await sb.from('profiles').update({ telegram_chat_id: null })
  if (error) throw error
}
