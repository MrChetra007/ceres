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

const aimCache = new Map()

export function getAimCache(field, month) {
  if (!field || !field.id) return null
  const hit = aimCache.get(cacheKey(field, month))
  if (hit && Date.now() - hit.fetchedAt < AIM_CACHE_TTL_MS) return hit.snapshot
  return null
}

export function setAimCache(field, snapshot, month) {
  if (!field || !field.id) return
  aimCache.set(cacheKey(field, month), { snapshot, fetchedAt: Date.now() })
}

function cacheKey(field, month) {
  const mKey =
    month && month.year != null && month.month != null
      ? month.year + '-' + month.month
      : ''
  return field.id + '|' + (field.plantingDate || '') + '|' + mKey
}