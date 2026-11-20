// Official Cambodia administrative lists (DataEF 2025), seeded into Supabase
// by migrations/seed/*.sql. Codes are TEXT and must keep leading zeros, so
// never pass them through Number().

import { sb } from './supabase'

const COLS = 'code,name_kh,name_en'
const cache = {
  provinces: null,
  districts: new Map(),
  communes: new Map(),
  villages: new Map(),
  byCode: new Map(),
}

function cacheKey(table, code) {
  return table + ':' + code
}

async function fetchList(table, parentColumn, parentCode) {
  let query = sb.from(table).select(COLS).order('code')
  if (parentColumn) query = query.eq(parentColumn, parentCode)
  const { data, error } = await query
  if (error) throw error
  return data || []
}

export async function listProvinces() {
  if (cache.provinces) return cache.provinces
  cache.provinces = await fetchList('admin_provinces')
  return cache.provinces
}

export async function listDistricts(provinceCode) {
  if (!provinceCode) return []
  if (cache.districts.has(provinceCode)) return cache.districts.get(provinceCode)
  const rows = await fetchList('admin_districts', 'province_code', provinceCode)
  cache.districts.set(provinceCode, rows)
  return rows
}

export async function listCommunes(districtCode) {
  if (!districtCode) return []
  if (cache.communes.has(districtCode)) return cache.communes.get(districtCode)
  const rows = await fetchList('admin_communes', 'district_code', districtCode)
  cache.communes.set(districtCode, rows)
  return rows
}

export async function listVillages(communeCode) {
  if (!communeCode) return []
  if (cache.villages.has(communeCode)) return cache.villages.get(communeCode)
  const rows = await fetchList('admin_villages', 'commune_code', communeCode)
  cache.villages.set(communeCode, rows)
  return rows
}

async function getByCode(table, code) {
  if (!code) return null
  const key = cacheKey(table, code)
  if (cache.byCode.has(key)) return cache.byCode.get(key)
  const { data, error } = await sb
    .from(table)
    .select(COLS)
    .eq('code', code)
    .maybeSingle()
  if (error) throw error
  cache.byCode.set(key, data || null)
  return data || null
}

export function localizedName(row, lang) {
  if (!row) return ''
  if (lang === 'km') return row.name_kh || row.name_en || row.code || ''
  return row.name_en || row.name_kh || row.code || ''
}

// Returns localized names for a field's four admin codes. Each lookup is
// independent; a missing row simply resolves to null.
export async function resolveLocation(codes, lang = 'en') {
  const out = { province: null, district: null, commune: null, village: null }
  if (!codes) return out
  const jobs = []
  if (codes.province_code) {
    jobs.push(
      getByCode('admin_provinces', codes.province_code).then((row) => {
        out.province = localizedName(row, lang) || null
      }),
    )
  }
  if (codes.district_code) {
    jobs.push(
      getByCode('admin_districts', codes.district_code).then((row) => {
        out.district = localizedName(row, lang) || null
      }),
    )
  }
  if (codes.commune_code) {
    jobs.push(
      getByCode('admin_communes', codes.commune_code).then((row) => {
        out.commune = localizedName(row, lang) || null
      }),
    )
  }
  if (codes.village_code) {
    jobs.push(
      getByCode('admin_villages', codes.village_code).then((row) => {
        out.village = localizedName(row, lang) || null
      }),
    )
  }
  await Promise.all(jobs)
  return out
}

export async function getProvinceName(code, lang = 'en') {
  return localizedName(await getByCode('admin_provinces', code), lang)
}

export function clearAdminBoundaryCache() {
  cache.provinces = null
  cache.districts.clear()
  cache.communes.clear()
  cache.villages.clear()
  cache.byCode.clear()
}
