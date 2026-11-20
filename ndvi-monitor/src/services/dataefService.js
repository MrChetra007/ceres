// DataEF current province conditions (official, live).
//
// The browser calls the JWT-verified `dataef-weather` Edge Function, which
// proxies data.mef.gov.kh and caches per province for 30 minutes. This service
// caches the same 30-minute window client-side so reopening a field is cheap.
//
// Current conditions only — the 5-day forecast remains Open-Meteo.

import { sb } from './supabase'

const CACHE_TTL_MS = 30 * 60 * 1000
const cache = new Map()

function keyFor(provinceNameEn) {
  return String(provinceNameEn || '').trim().toLowerCase()
}

export async function getProvinceWeather(provinceNameEn) {
  const province = String(provinceNameEn || '').trim()
  if (!province) return null
  const key = keyFor(province)
  const hit = cache.get(key)
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.data

  try {
    const { data, error } = await sb.functions.invoke('dataef-weather', {
      body: { province },
    })
    if (error) return null
    const weather = data && data.weather ? data.weather : null
    if (weather) cache.set(key, { ts: Date.now(), data: weather })
    return weather
  } catch (e) {
    return null
  }
}

export function clearDataefWeatherCache() {
  cache.clear()
}
