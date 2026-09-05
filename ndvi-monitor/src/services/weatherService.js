// weatherService — isolated Open-Meteo forecast access.
//
// Returns a clean `weatherContext` object (see getWeatherContext) so a future
// pass can wire the same data into Consult AI / Telegram advisory text by
// calling this one function instead of re-deriving the forecast inline.
// Display-only for now: nothing downstream (stress alerts, AI prompts, the
// Telegram worker) consumes it yet.

const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast'
const FORECAST_DAYS = 5
const CACHE_TTL_MS = 15 * 60 * 1000
// TEST FLAG: cache disabled globally — every field open refetches the forecast.
const USE_CACHE = false
const cache = new Map()

function cacheKey(lat, lng) {
  return lat.toFixed(4) + ',' + lng.toFixed(4)
}

// Build the flat shape components render. `days` is always 5 entries,
// each with a nullable rain probability and temperature; callers decide how
// to display unavailable values.
function buildWeatherContext(raw) {
  const times = (raw.daily && raw.daily.time) || []
  const days = times.map((date, i) => ({
    date,
    rainPct:
      raw.daily && raw.daily.precipitation_probability_max
        ? raw.daily.precipitation_probability_max[i] ?? null
        : null,
    tMax:
      raw.daily && raw.daily.temperature_2m_max
        ? raw.daily.temperature_2m_max[i] ?? null
        : null,
    tMin:
      raw.daily && raw.daily.temperature_2m_min
        ? raw.daily.temperature_2m_min[i] ?? null
        : null,
  }))
  return { updatedAt: new Date().toISOString(), days }
}

// lat/lng are the field centroid coordinates (Open-Meteo resolves the nearest
// grid point automatically). Then the result is cached per location briefly to
// avoid redundant calls if the user reopens the same field repeatedly.
export async function getWeatherContext(lat, lng) {
  const key = cacheKey(lat, lng)
  const hit = USE_CACHE ? cache.get(key) : null
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.data

  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    timezone: 'auto',
    forecast_days: String(FORECAST_DAYS),
  })
  const res = await fetch(OPEN_METEO_URL + '?' + params.toString())
  if (!res.ok) throw new Error('weather_unavailable')
  const raw = await res.json()
  const ctx = buildWeatherContext(raw)
  if (USE_CACHE) cache.set(key, { ts: Date.now(), data: ctx })
  return ctx
}

export function clearWeatherCache() {
  cache.clear()
}
