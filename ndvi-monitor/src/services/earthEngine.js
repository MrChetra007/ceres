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

export function loadIndexTile(month, index, geometry, cb, sceneDate) {
  callEE('getIndexTile', { index, year: month.year, month: month.month, geometry, sceneDate: sceneDate || null })
    .then((body) => {
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

// RVI (Sentinel-1 radar) time series. Deliberately does NOT run
// dedupeLowestCloud: S1 scenes have no cloud score, and ascending +
// descending passes on the same day are two legitimate observations with
// different orbitProperties_pass. The server already filters notNull values.
export function getRviTimeSeries(lat, lng, months, cb) {
  callEE('getRviTimeSeries', { lat, lng, months })
    .then((body) => cb(body.points || []))
    .catch((err) => {
      fail(err)
      cb([])
    })
}

export function getRviTimeSeriesForGeometry(geometry, months, cb) {
  callEE('getRviTimeSeries', { geometry, months })
    .then((body) => cb(body.points || []))
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
      label: body.label || null,
      phraseKey: body.phraseKey || null,
      phrase: body.phrase || null,
    }))
    .catch((err) => {
      fail(err)
      cb({ count: 0, value: null, date: null, cloudBlocked: false })
    })
}

// Scene-anchored field status (sidebar fix-fallback). Asks ee-data to grade the
// EXACT clicked observation date (including a cloud-blocked one) rather than the
// most-recent-available reading. The server answers:
//   mode 'optical' -> a clean scene that date, gradeable by its ndviValue;
//   mode 'radar'   -> no clean optical that day, but a Sentinel-1 RVI pass within
//                     ±15 days; value lives in rviValue (Sentinel-1 scale);
//   mode 'no_data' -> neither (honest — the sidebar must not silently re-anchor
//                     to a different date).
// cb(snapshot|null): resolved payload, or null on any error (meaning "no radar /
// optical certainty", which is exactly the no_data truth we want to surface).
export function getFieldStatus(geometry, plantingDate, sceneDate, cb, forceRadar) {
  callEE('getFieldStatus', {
    geometry,
    plantingDate: plantingDate || null,
    sceneDate: sceneDate || null,
    forceRadar: !!forceRadar,
  })
    .then((body) => cb({
      mode: body.mode || 'no_data',
      ndviValue: body.ndviValue == null ? null : body.ndviValue,
      rviValue: body.rviValue == null ? null : body.rviValue,
      status: body.status || 'no_data',
      stage: body.stage || null,
      confidence: body.confidence || 'low',
      clearSceneCount: body.clearSceneCount ?? null,
      validFraction: body.validFraction ?? null,
      compositeStart: body.compositeStart || null,
      compositeEnd: body.compositeEnd || null,
      observationDate: body.observationDate || null,
      daysSinceObservation: body.daysSinceObservation ?? null,
    }))
    .catch((err) => {
      fail(err)
      cb(null)
    })
}

// Bundled per-field load — combines tile + trends + rainfall + benchmark
// into ONE ee-data request instead of 5 separate ones (see
// field-bundle-fix-guide.md for why this matters: cold-isolate auth cost
// was being paid once per request instead of once per field-select).
export function getFieldBundle(geometry, year, month, months, currentIndex, cb) {
  callEE('getFieldBundle', { geometry, year, month, months, currentIndex })
    .then((body) => {
      const chartPoints = body.chartTrend?.points || []
      cb({
        tile: body.tile || { mode: 'no_data', count: 0, url: null },
        ndviTrend: dedupeLowestCloud(body.ndviTrend?.points || []),
        // RVI (radar) points are NOT collapsed by date — ascending + descending
        // passes on the same day are two legitimate observations, matching the
        // dedicated getRviTimeSeriesForGeometry path (which never dedupes).
        chartTrend: currentIndex === 'rvi'
          ? chartPoints
          : dedupeLowestCloud(chartPoints),
        rainfall: body.rainfall?.mm == null ? null : body.rainfall.mm,
        benchmark: body.benchmark?.value == null ? null : body.benchmark.value,
      })
    })
    .catch((err) => {
      fail(err)
      cb(null)
    })
}

// AIM composite health score — one 0-100 reading blending the growth-stage-
// appropriate indices into a plain-language verdict (see ee-data
// actionGetFieldHealthScore). cb(snapshot|null): the resolved payload, or null
// on any error (server unreachable / EE failure).
//
// `month` ({year, month}) scopes the score to the SAME calendar month as the
// map tile / hero NDVI badge for the scrubbed slider position. When omitted
// the server falls back to the current month.
export function getFieldHealthScore(geometry, plantingDate, cb, month) {
  callEE('getFieldHealthScore', {
    geometry,
    plantingDate: plantingDate || null,
    year: month && month.year != null ? month.year : null,
    month: month && month.month != null ? month.month : null,
  })
    .then((body) => cb({
      score: body.score == null ? null : body.score,
      noData: !!body.noData,
      stage: body.stage || null,
      dayCount: body.dayCount == null ? null : body.dayCount,
      primaryIndex: body.primaryIndex || 'ndvi',
      primaryReasonKey: body.primaryReasonKey || null,
      confidence: body.confidence || 'high',
      weights: body.weights || {},
      components: body.components || {},
      rawValues: body.rawValues || {},
      label: body.label || null,
      phraseKey: body.phraseKey || null,
      phrase: body.phrase || null,
      discrepancy: body.discrepancy || null,
    }))
    .catch((err) => {
      fail(err)
      cb(null)
    })
}

// Batched login-path variants — one ee-data request for ALL fields instead of
// one per field (see refreshAllFieldStatuses/refreshAllFieldTrends in
// store.js). Fields with invalid geometry are filtered out by the caller.
export function getAllFieldStatuses(fields, index, cb) {
  callEE('getAllFieldStatuses', { index, fields })
    .then((body) => cb(body.statuses || []))
    .catch((err) => {
      fail(err)
      cb([])
    })
}

export function getAllFieldTrends(fields, index, months, cb) {
  callEE('getAllFieldTrends', { index, months, fields })
    .then((body) => cb(
      (body.trends || []).map((t) => ({
        id: t.id,
        // Same-day duplicate S2 orbits collapse to the least-cloudy scene,
        // exactly like the single-field getIndexTimeSeriesForGeometry path.
        points: dedupeLowestCloud(t.points || []),
      })),
    ))
    .catch((err) => {
      fail(err)
      cb([])
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
// fieldId keys the server-side per-scene cache (ee_observation_cache): scenes
// already cached are served without touching Earth Engine.
export function getObservations(fieldId, geometry, startISO, endISO, cb) {
  callEE('getObservations', { fieldId: fieldId || null, geometry, startISO: startISO || null, endISO: endISO || null })
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
