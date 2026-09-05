// Shared Open-Meteo weather-forecast access — the single source of truth for
// the backend (ee-alerts-worker) to pull a short precipitation/temperature
// forecast for a field's centroid. Mirrors the same forecast window the
// frontend uses, so the panel display and the Telegram advisories never drift
// apart on the underlying data.
//
// It never throws: on any failure it returns null and logs a one-line warning,
// so a weather-API hiccup degrades the advisory to stress-data-only instead of
// blocking the whole worker run. Results are cached per rounded location for a
// short TTL so several fields sharing a centroid — or repeated worker runs —
// don't hammer the API redundantly.
//
// Coordinate order note (Ceres rule 3): Open-Meteo takes latitude and longitude
// as *separate* query params, so there is no [lng,lat] swap hazard here as long
// as the caller passes centroid_lat → latitude and centroid_lng → longitude.
const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";
const FORECAST_DAYS = 5;
const CACHE_TTL_MS = 15 * 60 * 1000;
const cache = new Map();
function cacheKey(lat, lng) {
    return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}
function buildContext(raw) {
    const times = (raw?.daily?.time || []);
    const days = times.map((date, i) => ({
        date,
        rainPct: raw.daily.precipitation_probability_max != null
            ? (raw.daily.precipitation_probability_max[i] ?? null)
            : null,
        tMax: raw.daily.temperature_2m_max != null
            ? (raw.daily.temperature_2m_max[i] ?? null)
            : null,
        tMin: raw.daily.temperature_2m_min != null
            ? (raw.daily.temperature_2m_min[i] ?? null)
            : null,
    }));
    const maxRain = days
        .map((d) => d.rainPct)
        .filter((v) => v != null);
    const maxT = days
        .map((d) => d.tMax)
        .filter((v) => v != null);
    const minT = days
        .map((d) => d.tMin)
        .filter((v) => v != null);
    return {
        updatedAt: new Date().toISOString(),
        forecast_days: days,
        precipitation_probability: maxRain.length > 0 ? Math.max(...maxRain) : null,
        precipitation_mm: null,
        temp_min: minT.length > 0 ? Math.min(...minT) : null,
        temp_max: maxT.length > 0 ? Math.max(...maxT) : null,
    };
}
// Returns a WeatherContext, or null if the forecast could not be fetched or
// parsed (e.g. bad coords, network failure, empty response). Never throws.
export async function getWeatherContext(lat, lng) {
    const key = cacheKey(lat, lng);
    const hit = cache.get(key);
    if (hit && Date.now() - hit.ts < CACHE_TTL_MS)
        return hit.data;
    try {
        const params = new URLSearchParams({
            latitude: String(lat),
            longitude: String(lng),
            daily: "temperature_2m_max,temperature_2m_min,precipitation_probability_max",
            timezone: "auto",
            forecast_days: String(FORECAST_DAYS),
        });
        const res = await fetch(`${OPEN_METEO_URL}?${params.toString()}`, { headers: { Accept: "application/json" } });
        if (!res.ok) {
            console.warn(`[weather] Open-Meteo HTTP ${res.status} for ${key}`);
            return null;
        }
        const raw = await res.json();
        if (!raw?.daily?.time?.length) {
            console.warn(`[weather] no forecast data returned for ${key}`);
            return null;
        }
        const ctx = buildContext(raw);
        cache.set(key, { ts: Date.now(), data: ctx });
        return ctx;
    }
    catch (e) {
        console.warn(`[weather] failed to fetch forecast for ${key}: ${e instanceof Error ? e.message : String(e)}`);
        return null;
    }
}
export function clearWeatherCache() {
    cache.clear();
}
