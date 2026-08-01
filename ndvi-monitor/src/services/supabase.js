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

export async function signInWithOtp(email, redirectTo) {
  return sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo },
  })
}

export async function signOut() {
  return sb.auth.signOut()
}
