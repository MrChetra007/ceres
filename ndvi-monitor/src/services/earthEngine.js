// Earth Engine data access — now a thin client for the `ee-data` Supabase
// Edge Function. The browser never authenticates with Earth Engine directly
// (the old OAuth popup only worked for EE-registered Google accounts); this
// module forwards every request to the service-account-backed Edge Function
// with the caller's Supabase JWT and keeps the SAME exported names/callback
// signatures as before, so callers (store.js, FieldDetailPanel.vue) are
// untouched apart from geometry construction.
//
// Geometries are plain GeoJSON objects now — build them with rectGeometry(),
// polygonGeometry() or pointGeometry() instead of window.ee.Geometry.*.

import { requireSession } from './supabase'
import { EE_DATA_URL, INDICES } from '../config'

export function rectGeometry(coords) {
  const [w, s, e, n] = coords
  return { type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] }
}

export function polygonGeometry(coordinates) {
  return { type: 'Polygon', coordinates }
}

export function pointGeometry(lng, lat) {
  return { type: 'Point', coordinates: [lng, lat] }
}

async function callEE(action, payload) {
  const session = await requireSession()
  const res = await fetch(EE_DATA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
    body: JSON.stringify({ action, ...payload }),
  })
  let body = null
  try { body = await res.json() } catch (e) { /* non-JSON error body */ }
  if (!res.ok || !body || body.ok === false) {
    const msg = body && body.error ? String(body.error) : 'ee-data request failed (' + res.status + ')'
    throw new Error(msg)
  }
  return body
}

function fail(err) {
  console.error('[ee-data]', err && err.message ? err.message : err)
}

// Sentinel-2 sometimes has overlapping orbital passes on the SAME day, producing
// 2+ scenes for one date with different cloud percentages. "The scene for date
// X" must ALWAYS resolve to the LEAST-cloudy of those duplicates — Earth Engine
// returns rows in arbitrary order, so without this a cloudier twin orbit could
// win and skew the NDVI value, the cloud-blocked/confidence status, or the scene
// picker. Callers that resolve a single scene per date must funnel through this.
function dedupeLowestCloud(points) {
  const byDate = new Map()
  for (const p of points) {
    if (p.date == null) continue
    const prev = byDate.get(p.date)
    // Keep the best (lowest cloudPct) scene seen for this date; never replace a
    // known-cloud value with an unknown one.
    if (
      !prev ||
      (p.cloudPct != null && (prev.cloudPct == null || p.cloudPct < prev.cloudPct))
    ) {
      byDate.set(p.date, p)
    }
  }
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date))
}

export function loadIndexTile(month, index, geometry, cb) {
  const cfg = INDICES[index] || INDICES.ndvi
  callEE('getIndexTile', { index, year: month.year, month: month.month, geometry })
    .then((body) => {
      if (body.mode === 'index') {
        // Each index uses its OWN band combination server-side (NDVI = B8/B4,
        // NDWI = B3/B8, LSWI = B8/B11), so the computed image genuinely
        // differs per tab. Log the expression for per-tab verification.
        console.log(`[loadIndexTile] ${cfg.name} → normalizedDifference(${cfg.bands.join(', ')}) via ee-data`)
      }
      cb(body)
    })
    .catch((err) => {
      fail(err)
      cb({ mode: 'error', count: 0, url: null, err: err.message })
    })
}

// True Color photo mode — a single Sentinel-2 RGB scene (B4·B3·B2), NOT an
// index or a monthly mosaic. Deliberately no cloud masking: clouds/haze stay
// visible because on a cloudy scene that IS the demo signal showing why the
// index values for that date are unreliable. `sceneDate` (YYYY-MM-DD) picks an
// exact capture; when omitted/null the least-cloudy scene of the month wins.
// Returns the full scene list too, so the UI can offer a date picker.
export function loadTrueColor(month, geometry, sceneDate, cb) {
  callEE('getTrueColorScene', { year: month.year, month: month.month, geometry, sceneDate: sceneDate || null })
    .then((body) => {
      if (body.mode === 'photo') {
        console.log(`[loadTrueColor] chosen=${body.chosen && body.chosen.date} → url=${String(body.url).slice(0, 90)}…`)
      }
      cb(body)
    })
    .catch((err) => {
      fail(err)
      cb({ mode: 'error', count: 0, scenes: [], chosen: null, url: null, err: err.message })
    })
}

// "Latest Satellite View" — the single most-recent Sentinel-2 pass over the
// area within the lookback window, regardless of month or cloud cover. Rendered
// as an un-masked True Color photo (the newest scene overall, not a monthly
// composite and not a cloud-filtered one). Used by the standalone map shortcut
// that deliberately ignores the time slider's month.
export function loadLatestTrueColor(geometry, cb, lookbackDays = 90) {
  callEE('getLatestTrueColor', { geometry, lookbackDays })
    .then(cb)
    .catch((err) => {
      fail(err)
      cb({ mode: 'error', count: 0, date: null, cloudPct: null, url: null, err: err.message })
    })
}

// Health Zone Breakdown — bucket every pixel of the currently-viewed month's
// index composite (NDVI or the Sentinel-1 radar RVI fallback) into 10 ranges,
// returning the AREA in each bucket. Batched server-side in a single
// reduceRegion. `index`: 'ndvi' | 'rvi'.
//   cb(res|null): { buckets: [{lo, hi, areaSqm}], totalAreaSqm }
//                 null when no usable scenes for that month (cloud-blocked/no-data).
export function getZoneBreakdown(geometry, month, index, cb) {
  callEE('getZoneBreakdown', { index, year: month.year, month: month.month, geometry })
    .then((body) => cb(body.breakdown || null))
    .catch((err) => {
      fail(err)
      cb(null)
    })
}

export function getIndexTimeSeries(lat, lng, index, months, cb) {
  callEE('getIndexTimeSeries', { lat, lng, index, months })
    .then((body) => cb(dedupeLowestCloud(body.points || [])))
    .catch((err) => {
      fail(err)
      cb([])
    })
}

export function getIndexTimeSeriesForGeometry(geometry, index, months, cb) {
  callEE('getIndexTimeSeries', { geometry, index, months })
    .then((body) => {
      // Same-day duplicate S2 orbits: collapse to one entry per date, keeping
      // the LOWEST-cloud scene (see dedupeLowestCloud). This is the SHARED
      // source of truth for the hero NDVI panel, growth-stage box and
      // pre-planting badge.
      cb(dedupeLowestCloud(body.points || []))
    })
    .catch((err) => {
      fail(err)
      cb([])
    })
}

// Feature 3 — Auto-planting-date detection (LSWI spike).
// A transplant floods the field: LSWI jumps from dry soil (~0.0–0.2) toward
// flooded (~0.4+). The trailing ~90 days of cloud-free LSWI at the given field
// geometry are scanned server-side for the steepest positive scene-to-scene
// jump that starts dry and lands flooded. Returns null (never guesses) when
// data is too sparse or no spike is found.
export function detectPlantingDate(geometry, cb) {
  callEE('detectPlantingDate', { geometry })
    .then((body) => cb(body.result || null))
    .catch((err) => {
      fail(err)
      cb(null)
    })
}

export function getDryMonths(months, geometry, cb) {
  callEE('getDryMonths', { months, geometry })
    .then((body) => {
      const drySet = new Set()
      ;(body.dryMonths || []).forEach((idx) => drySet.add(idx))
      cb(drySet)
    })
    .catch((err) => {
      fail(err)
      cb(new Set())
    })
}

export function getRecentIndexValue(geometry, index, cb) {
  callEE('getRecentIndexValue', { geometry, index })
    .then((body) => cb({
      count: body.count || 0,
      value: body.value == null ? null : body.value,
      date: body.date || null,
      cloudBlocked: !!body.cloudBlocked,
    }))
    .catch((err) => {
      fail(err)
      cb({ count: 0, value: null, date: null, cloudBlocked: false })
    })
}

export function getRainfallMm(geometry, daysBack, cb) {
  callEE('getRainfall', { geometry, daysBack: daysBack || 21 })
    .then((body) => cb(body.mm == null ? null : body.mm))
    .catch((err) => {
      fail(err)
      cb(null)
    })
}

// Browse Observations — one batched server-side query over the whole S2
// collection. Status derivation happens on the server with the app's existing
// decision rules:
//   - cloudCover >= 40  -> 'blocked'   (the cloud-mask gate that marks a month
//                                       Cloud-blocked / LOW CONFIDENCE)
//   - < 40 but older than 21 days (CONFIDENCE_STALE_DAYS) → 'low'
//   - otherwise                        → 'clear'
export function getObservations(geometry, startISO, endISO, cb) {
  callEE('getObservations', { geometry, startISO: startISO || null, endISO: endISO || null })
    .then((body) => {
      // Same-day duplicate S2 orbits produce 2+ rows for one date; collapse
      // them to the LEAST-cloudy row (via dedupeLowestCloud) so the
      // Observations log, hero panel and true-color picker always agree on
      // "the scene for that date".
      const rows = dedupeLowestCloud(
        (body.rows || [])
          .map((r) => ({ ...r, cloudPct: r.cloudCover })) // key dedupeLowestCloud compares on
          .filter((r) => r.date != null),
      )
        .map(({ cloudPct, ...r }) => r) // drop the temporary alias
        .sort((a, b) => b.date.localeCompare(a.date)) // newest first
      cb(rows)
    })
    .catch((err) => {
      fail(err)
      cb([])
    })
}
