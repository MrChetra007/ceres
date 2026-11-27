// ---------------------------------------------------------------------------
// Recent-trend change (shared by export, field panel, triage, consult-ai and
// the alerts worker — keep supabase/functions/_shared/trend.ts in sync).
// ---------------------------------------------------------------------------
// "14-day change" means: compare the latest CLEAN point with the clean point
// CLOSEST to 14 days earlier, but only when that gap is 10–24 days. This avoids
// the old bug where a 3-day-old neighbour was skipped and an 85-day-old point
// was used as if it were a two-week comparison.
//
// Cloud-blocked rows (cloudCct >= 40 or status 'blocked') are dropped first, so
// every caller applies the same cloud filter. A point with an unknown cloud
// percentage is kept (it is not known to be blocked).

export const TREND_CLOUD_BLOCKED_PCT = 40
export const TREND_TARGET_DAYS = 14
export const TREND_MIN_GAP_DAYS = 10
export const TREND_MAX_GAP_DAYS = 24

function dateKey(date) {
  if (date instanceof Date) {
    return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10)
  }
  return String(date || '').slice(0, 10)
}

function dateMs(date) {
  const key = dateKey(date)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null
  const t = Date.parse(key + 'T00:00:00Z')
  return Number.isFinite(t) ? t : null
}

function isCloudBlocked(point) {
  const status = String(point && point.status ? point.status : '').toLowerCase()
  if (status === 'blocked') return true
  if (point && point.cloudPct != null) {
    const cloud = Number(point.cloudPct)
    if (Number.isFinite(cloud) && cloud >= TREND_CLOUD_BLOCKED_PCT) return true
  }
  return false
}

// One point per date (lowest cloud wins), ascending, cloud-blocked dropped.
function cleanSeries(points) {
  const byDate = new Map()
  for (const p of Array.isArray(points) ? points : []) {
    if (!p || !p.date) continue
    const value = p.value == null ? NaN : Number(p.value)
    if (!Number.isFinite(value)) continue
    if (isCloudBlocked(p)) continue
    const key = dateKey(p.date)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue
    const cloud = p.cloudPct == null ? null : Number(p.cloudPct)
    const cloudPct = Number.isFinite(cloud) ? cloud : null
    const prev = byDate.get(key)
    // Keep the least-cloudy row for a duplicated date; a known-cloud row is
    // never replaced by one with an unknown cloud percentage.
    if (!prev || (cloudPct != null && (prev.cloudPct == null || cloudPct < prev.cloudPct))) {
      byDate.set(key, { date: key, value, cloudPct })
    }
  }
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * @param {Array<{date?: string, value?: number, cloudPct?: number|null, status?: string|null}>} points
 * @returns {{pct: number, comparedFrom: string, comparedTo: string, gapDays: number}|null}
 *   pct is signed: negative = greenness declining.
 */
export function calcTrendChange(points) {
  const pts = cleanSeries(points)
  if (pts.length < 2) return null

  const recent = pts[pts.length - 1]
  const recentMs = dateMs(recent.date)
  if (recentMs == null) return null

  let best = null // the candidate in the 10–24 day window closest to 14
  for (let i = pts.length - 2; i >= 0; i--) {
    const ms = dateMs(pts[i].date)
    if (ms == null) continue
    const gap = (recentMs - ms) / 86400000
    if (gap < TREND_MIN_GAP_DAYS) continue
    if (gap > TREND_MAX_GAP_DAYS) break // earlier points are even farther away
    const score = Math.abs(gap - TREND_TARGET_DAYS)
    if (!best || score < best.score) {
      best = { point: pts[i], gapDays: Math.round(gap), score }
    }
  }
  if (!best) return null

  const earlier = best.point
  if (!earlier.value) return null // zero/NaN baseline cannot produce a %
  const pct = ((recent.value - earlier.value) / earlier.value) * 100
  if (!Number.isFinite(pct)) return null

  return {
    pct,
    comparedFrom: earlier.date,
    comparedTo: recent.date,
    gapDays: best.gapDays,
  }
}
