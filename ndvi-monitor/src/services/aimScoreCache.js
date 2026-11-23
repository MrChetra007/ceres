// Client-side cache for the AIM composite health score.
//
// Closing/reopening a field should NOT re-run Earth Engine compute — the score
// blends 2-3 indices, each a monthly median composite, and only changes as new
// Sentinel-2 passes arrive (a few days apart). TTL is therefore a 5-day
// revisit window (the intended cadence for "current status" results — the
// frontend trend chart already caches on a 15-min window for contrast, this
// one is intentionally much longer because EE cost is the concern here).
//
// Cache key = field id + planting date + SCRUBBED MONTH: the stage-aware
// weights depend on days since planting, and the score itself is now scoped to
// a specific calendar month (the slider position). Users who edit the planting
// date OR scrub to a different month must get a fresh score, not a stale
// weighted blend computed for a different era.

export const AIM_CACHE_TTL_MS = 5 * 24 * 60 * 60 * 1000 // 5 days

// Enabled. The cache key includes a hash of the field geometry, so a boundary
// edit reliably produces a new key and can never read a score computed for the
// old polygon.
const USE_AIM_CACHE = true

const aimCache = new Map()

export function getAimCache(field, month) {
  if (!field || !field.id) return null
  const hit = USE_AIM_CACHE ? aimCache.get(cacheKey(field, month)) : null
  if (hit && Date.now() - hit.fetchedAt < AIM_CACHE_TTL_MS) return hit.snapshot
  return null
}

export function setAimCache(field, snapshot, month) {
  if (!field || !field.id) return
  if (USE_AIM_CACHE) aimCache.set(cacheKey(field, month), { snapshot, fetchedAt: Date.now() })
}

// FNV-1a hash of the field geometry so any boundary change yields a new key.
function geometrySignature(field) {
  const g = field.geojson && (field.geojson.geometry || field.geojson)
  if (!g) return ''
  const s = JSON.stringify(g)
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16)
}

function cacheKey(field, month) {
  const mKey =
    month && month.year != null && month.month != null
      ? month.year + '-' + month.month
      : ''
  return field.id + '|' + (field.plantingDate || '') + '|' + geometrySignature(field) + '|' + mKey
}