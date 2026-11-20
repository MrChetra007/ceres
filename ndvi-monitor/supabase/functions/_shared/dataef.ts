// DataEF realtime weather — official current province conditions.
//
// Unlike the admin lists (yearly, seeded into Supabase), weather is live data.
// It is current conditions only: no forecast, no rain probability. Open-Meteo
// remains the 5-day field-level forecast.
//
// API: GET https://data.mef.gov.kh/api/v1/realtime-api/weather?province=<name>
// Response shape: { data: { name, last_updated, temp_c, feelslike_c,
//   humidity, precip_mm, wind_kph, cloud, condition: { text, code } } }
//
// Never throws: returns null when there is no data and no last-good cache.
// On a fetch failure it returns the last good response with `stale: true`.

const DATAEF_BASE = "https://data.mef.gov.kh/api/v1";
const CACHE_TTL_MS = 30 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;

// DataEF's province spellings are not guaranteed to match every 2025 admin
// list spelling. Add aliases here if a province returns 400/404.
export const PROVINCE_WEATHER_ALIASES: Record<string, string> = {};

export interface DataefWeather {
  name: string;
  lastUpdated: string | null;
  tempC: number | null;
  feelsLikeC: number | null;
  humidity: number | null;
  precipMm: number | null;
  windKph: number | null;
  cloud: number | null;
  condition: string | null;
  conditionCode: number | null;
  stale: boolean;
}

interface CacheEntry {
  ts: number;
  data: DataefWeather;
}

const cache = new Map<string, CacheEntry>();
const lastGood = new Map<string, DataefWeather>();

function cacheKey(provinceEn: string): string {
  return provinceEn.trim().toLowerCase();
}

function resolveProvinceName(provinceEn: string): string {
  const raw = provinceEn.trim();
  return PROVINCE_WEATHER_ALIASES[raw] || raw;
}

function numberOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeWeather(raw: any): DataefWeather | null {
  if (!raw || typeof raw !== "object") return null;
  const name = textOrNull(raw.name);
  if (!name) return null;
  return {
    name,
    lastUpdated: textOrNull(raw.last_updated),
    tempC: numberOrNull(raw.temp_c),
    feelsLikeC: numberOrNull(raw.feelslike_c),
    humidity: numberOrNull(raw.humidity),
    precipMm: numberOrNull(raw.precip_mm),
    windKph: numberOrNull(raw.wind_kph),
    cloud: numberOrNull(raw.cloud),
    condition: textOrNull(raw.condition?.text),
    conditionCode: numberOrNull(raw.condition?.code),
    stale: false,
  };
}

// Returns current DataEF conditions for a province, or null. Never throws.
export async function getProvinceWeather(
  provinceEn: string,
): Promise<DataefWeather | null> {
  if (!provinceEn || !provinceEn.trim()) return null;

  const key = cacheKey(provinceEn);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) {
    return { ...hit.data, stale: false };
  }

  const province = resolveProvinceName(provinceEn);
  const url = `${DATAEF_BASE}/realtime-api/weather?province=${encodeURIComponent(province)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`[dataef] weather HTTP ${res.status} for ${province}`);
      const fallback = lastGood.get(key);
      return fallback ? { ...fallback, stale: true } : null;
    }
    const body = await res.json();
    const weather = normalizeWeather(body?.data);
    if (!weather) {
      console.warn(`[dataef] no weather data for ${province}`);
      const fallback = lastGood.get(key);
      return fallback ? { ...fallback, stale: true } : null;
    }
    cache.set(key, { ts: Date.now(), data: weather });
    lastGood.set(key, weather);
    return weather;
  } catch (e) {
    console.warn(
      `[dataef] weather fetch failed for ${province}: ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
    const fallback = lastGood.get(key);
    return fallback ? { ...fallback, stale: true } : null;
  } finally {
    clearTimeout(timer);
  }
}

// One line for the LLM advisory prompt. Empty string when no weather.
export function provinceWeatherLine(weather: DataefWeather | null): string {
  if (!weather) return "";
  const bits: string[] = [];
  if (weather.condition) bits.push(weather.condition);
  if (weather.tempC != null) bits.push(`${Math.round(weather.tempC)}°C`);
  if (weather.humidity != null) bits.push(`${Math.round(weather.humidity)}% humidity`);
  if (weather.precipMm != null) bits.push(`${weather.precipMm}mm rain now`);
  if (weather.windKph != null) bits.push(`${Math.round(weather.windKph)}km/h wind`);
  const observed = bits.length ? bits.join(", ") : "no details";
  const updated = weather.lastUpdated
    ? weather.lastUpdated.replace("T", " ").slice(0, 16)
    : "unknown time";
  const prefix = weather.stale ? "last known " : "";
  return `official ${prefix}current conditions (DataEF, ${weather.name}, updated ${updated}): ${observed}.`;
}

export function clearDataefWeatherCache() {
  cache.clear();
  lastGood.clear();
}
