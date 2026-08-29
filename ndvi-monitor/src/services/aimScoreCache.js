// Client-side cache for the AIM composite health score.
//
// Closing/reopening a field should NOT re-run Earth Engine compute — the score
// blends 2-3 indices, each a 14/90-day median, and only changes as new
// Sentinel-2 passes arrive (a few days apart). TTL is therefore a 5-day
// revisit window (the intended cadence for "current status" results — the
// frontend trend chart already caches on a 15-min window for contrast, this
// one is intentionally much longer because EE cost is the concern here).
//
// Cache key = field id + planting date: the stage-aware WEIGHTS depend on days
// since planting, so users who edit the planting date get a fresh score
// instead of a stale weighted blend.

export const AIM_CACHE_TTL_MS = 5 * 24 * 60 * 60 * 1000 // 5 days

const aimCache = new Map()

export function getAimCache(field) {
  if (!field || !field.id) return null
  const hit = aimCache.get(cacheKey(field))
  if (hit && Date.now() - hit.fetchedAt < AIM_CACHE_TTL_MS) return hit.snapshot
  return null
}

export function setAimCache(field, snapshot) {
  if (!field || !field.id) return
  aimCache.set(cacheKey(field), { snapshot, fetchedAt: Date.now() })
}

function cacheKey(field) {
  return field.id + '|' + (field.plantingDate || '')
}