import { INDICES, DRY_MONTH_THRESHOLD, TRUE_COLOR_VIS, TRUE_COLOR, NDVI_ZONE_BUCKETS, RVI_ZONE_BUCKETS } from '../config'

function ee() {
  return window.ee
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

export function eeAvailable() {
  return typeof window !== 'undefined' && !!window.ee
}

export function authenticateViaOauth(clientId, onSuccess, onError) {
  ee().data.authenticateViaOauth(clientId, onSuccess, onError)
}

export function getAuthToken() {
  return ee().data.getAuthToken()
}

export function setAuthToken(clientId, token, expiresIn) {
  ee().data.setAuthToken(clientId, token, expiresIn)
}

export function initialize(projectId, onReady, onError) {
  ee().initialize(null, null, onReady, onError, null, projectId)
}

function s2Collection(geom, start, end) {
  return ee().ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(geom)
    .filterDate(start, end)
    .filter(ee().Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 40))
}

function getCloudPctAndTrueColor(scene, geometry, monthStart, cb) {
  const e = ee()
  scene.get('CLOUDY_PIXEL_PERCENTAGE').evaluate((cloudPct) => {
    const vis = { bands: TRUE_COLOR.bands, ...TRUE_COLOR_VIS }
    scene.getMap(vis, (mapId, err) => {
      if (err || !mapId || !mapId.urlFormat) {
        cb({ url: null, cloudPct, lastValidDate: null, err })
        return
      }
      getLastValidDate(geometry, monthStart, (lastValidDate) => {
        cb({ url: mapId.urlFormat, cloudPct, lastValidDate, err: null })
      })
    })
  })
}

function getLastValidDate(geometry, monthStart, cb) {
  const e = ee()
  const lookback = monthStart.advance(-90, 'day')
  const prior = s2Collection(geometry, lookback, monthStart).sort('system:time_start', false)
  prior.size().evaluate((n) => {
    if (n === 0) { cb(null); return }
    prior.first().get('system:time_start').evaluate((ts) => {
      if (ts == null) { cb(null); return }
      cb(new Date(ts).toISOString().slice(0, 10))
    })
  })
}

export function loadIndexTile(month, index, geometry, cb) {
  const e = ee()
  const cfg = INDICES[index] || INDICES.ndvi
  const start = e.Date.fromYMD(month.year, month.month, 1)
  const end = start.advance(1, 'month')
  const rawCollection = e.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(geometry)
    .filterDate(start, end)
  const cleanCollection = rawCollection.filter(e.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 40))
  cleanCollection.size().evaluate((count) => {
    if (count === 0) {
      // No clean scenes — check whether any scenes exist at all this month.
      rawCollection.size().evaluate((rawCount) => {
        if (rawCount === 0) { cb({ mode: 'no_data', count: 0, url: null, err: 'none' }); return }
        // Cloud-blocked — before falling back to true-color, try the Sentinel-1
        // radar fallback (RVI). Radar sees through clouds, and Sentinel-1's
        // revisit is ~6-12 days, so widen the window ±15 days around the month.
        getRadarVegetationIndex(
          geometry,
          start.advance(-15, 'day'),
          end.advance(15, 'day'),
          (radar) => {
            if (radar.count > 0 && radar.url) {
              cb({ mode: 'radar_fallback', count: radar.count, url: radar.url, indexUsed: radar.indexUsed })
              return
            }
            // No S1 coverage either — pick the least-cloudy scene for the
            // original true-color fallback.
            const bestScene = rawCollection.sort('CLOUDY_PIXEL_PERCENTAGE').first()
            getCloudPctAndTrueColor(bestScene, geometry, start, (res) => {
              cb({ mode: 'cloud_blocked', count: 0, url: res.url, cloudPct: res.cloudPct, lastValidDate: res.lastValidDate, err: res.err })
            })
          },
        )
      })
      return
    }
    // Each index uses its OWN band combination from the INDICES config, so the
    // computed image genuinely differs per tab, never reused:
    //   NDVI = NDVI(B8, B4)   NDWI = NDWI(B3, B8)   LSWI = LSWI(B8, B11)
    // They can still LOOK similar for the same flooded paddy — water loads on
    // both NDWI (green→NIR) and LSWI (NIR→SWIR) — so a near-identical visual is
    // expected for water-heavy fields, not a sign of a shared image/palette.
    // Log the exact expression below for per-tab verification.
    const composite = cleanCollection.median().clip(geometry).normalizedDifference(cfg.bands).rename(cfg.name)
    console.log(`[loadIndexTile] ${cfg.name} → normalizedDifference(${cfg.bands.join(', ')})  vis=${JSON.stringify(cfg.vis)}`)
    composite.getMap(cfg.vis, (mapId, err) => {
      if (err || !mapId || !mapId.urlFormat) { cb({ mode: 'index', count, url: null, err }); return }
      cb({ mode: 'index', count, url: mapId.urlFormat })
    })
  })
}

// True Color photo mode — a single Sentinel-2 RGB scene (B4·B3·B2), NOT an
// index or a monthly mosaic. Deliberately no cloud masking: clouds/haze stay
// visible because on a cloudy scene that IS the demo signal showing why the
// index values for that date are unreliable. `sceneDate` (YYYY-MM-DD) picks an
// exact capture; when omitted/null the least-cloudy scene of the month wins.
// Returns the full scene list too, so the UI can offer a date picker.
export function loadTrueColor(month, geometry, sceneDate, cb) {
  const e = ee()
  const start = e.Date.fromYMD(month.year, month.month, 1)
  const end = start.advance(1, 'month')
  const all = e.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(geometry)
    .filterDate(start, end)
  const list = all.map((img) => e.Feature(null, {
    date: img.date().format('YYYY-MM-dd'),
    cloudPct: e.Number(img.get('CLOUDY_PIXEL_PERCENTAGE')),
  }))
  list.evaluate((result) => {
    const scenes = ((result && result.features) || [])
      .map((f) => ({ date: f.properties.date, cloudPct: f.properties.cloudPct }))
      .sort((a, b) => a.date.localeCompare(b.date))
    if (scenes.length === 0) {
      cb({ mode: 'no_data', count: 0, scenes: [], chosen: null, url: null, err: 'none' })
      return
    }
    // Resolve "the scene for the chosen date" to the LEAST-cloudy of any
    // same-day duplicate Sentinel-2 orbits: `find` would just take whatever
    // Earth Engine returned first, but the rendered image below sorts the same
    // day by cloud, so this keeps `chosen.cloudPct` (the value shown in the
    // scene picker and used for the cloud-blocked status) in sync with what is
    // actually displayed.
    let chosen = null
    if (sceneDate) {
      const sameDate = scenes.filter((s) => s.date === sceneDate)
      if (sameDate.length) chosen = sameDate.reduce((a, b) => (b.cloudPct < a.cloudPct ? b : a))
    }
    if (!chosen) chosen = scenes.reduce((a, b) => (b.cloudPct < a.cloudPct ? b : a))
    const day = e.Date(chosen.date)
    // Wide stretch (max 5000) so bright Cloud-free areas of a rice scene don't
    // clamp to a single saturated green block; a tight 0–3000 range leaves
    // mid-season canopies pinned at the top of the scale.
    const vis = { bands: TRUE_COLOR.bands, ...TRUE_COLOR_VIS }
    const picked = all
      .filterDate(day, day.advance(1, 'day'))
      .sort('CLOUDY_PIXEL_PERCENTAGE')
      .first()
    console.log(`[loadTrueColor] ${chosen.date} (month ${month.year}-${month.month}) → ${scenes.length} scenes, cloud=${chosen.cloudPct}%, vis=${JSON.stringify(vis)}`)
    picked.clip(geometry).getMap(vis, (mapId, err) => {
      if (err || !mapId || !mapId.urlFormat) {
        cb({ mode: 'error', count: scenes.length, scenes, chosen, url: null, err })
        return
      }
      console.log(`[loadTrueColor] chosen=${chosen.date} → mapId=${String(mapId.mapid).slice(0, 24)} url=${String(mapId.urlFormat).slice(0, 90)}…`)
      cb({ mode: 'photo', count: scenes.length, scenes, chosen, url: mapId.urlFormat })
    })
  })
}

// "Latest Satellite View" — the single most-recent Sentinel-2 pass over the
// area within the lookback window, regardless of month or cloud cover. Rendered
// as an un-masked True Color photo (the newest scene overall, not a monthly
// composite and not a cloud-filtered one). Used by the standalone map shortcut
// that deliberately ignores the time slider's month.
export function loadLatestTrueColor(geometry, cb, lookbackDays = 90) {
  const e = ee()
  const start = e.Date(Date.now()).advance(-lookbackDays, 'day')
  const end = e.Date(Date.now())
  const all = e.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(geometry)
    .filterDate(start, end)
    .sort('system:time_start', false)
  all.size().evaluate((totalCount) => {
    if (totalCount === 0) {
      cb({ mode: 'no_data', count: 0, date: null, cloudPct: null, url: null })
      return
    }
    const latest = all.first()
    const vis = { bands: TRUE_COLOR.bands, ...TRUE_COLOR_VIS }
    latest.get('system:time_start').evaluate((ts) => {
      const date = ts == null ? null : new Date(ts).toISOString().slice(0, 10)
      latest.get('CLOUDY_PIXEL_PERCENTAGE').evaluate((cloudPct) => {
        latest.clip(geometry).getMap(vis, (mapId, err) => {
          if (err || !mapId || !mapId.urlFormat) {
            console.error('[loadLatestTrueColor] getMap failed:', err)
            cb({ mode: 'error', count: totalCount, date, cloudPct, url: null, err })
            return
          }
          console.log(`[loadLatestTrueColor] date=${date} → cloud=${cloudPct}% url=${String(mapId.urlFormat).slice(0, 90)}…`)
          cb({ mode: 'photo', count: totalCount, date, cloudPct, url: mapId.urlFormat })
        })
      })
    }, (err) => {
      console.error('[loadLatestTrueColor] time_start failed:', err)
      cb({ mode: 'error', count: totalCount, date: null, cloudPct: null, url: null, err })
    })
  }, (err) => {
    console.error('[loadLatestTrueColor] size failed:', err)
    cb({ mode: 'error', count: 0, date: null, cloudPct: null, url: null, err })
  })
}

// Sentinel-1 Radar Vegetation Index (RVI) fallback. Used when Sentinel-2
// optical imagery is cloud-blocked: radar sees through clouds, so this gives a
// real vegetation-structure signal where NDVI can't be computed. S1_GRD returns
// backscatter in decibels (dB), a log scale — RVI MUST be computed on LINEAR
// power, or the ratio saturates into a flat, meaningless image.
export function getRadarVegetationIndex(geometry, startDate, endDate, cb) {
  const e = ee()
  const s1 = e.ImageCollection('COPERNICUS/S1_GRD')
    .filterBounds(geometry)
    .filterDate(startDate, endDate)
    .filter(e.Filter.eq('instrumentMode', 'IW'))
    .filter(e.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
    .filter(e.Filter.listContains('transmitterReceiverPolarisation', 'VH'))
  s1.size().evaluate((count) => {
    if (count === 0) { cb({ count: 0, url: null, indexUsed: 'RVI' }); return }
    const composite = s1.median().clip(geometry)
    const vvLinear = e.Image(10).pow(composite.select('VV').divide(10))
    const vhLinear = e.Image(10).pow(composite.select('VH').divide(10))
    const rvi = vhLinear.multiply(4).divide(vvLinear.add(vhLinear)).rename('RVI')
    const vis = { min: 0, max: 1, palette: ['blue', 'white', 'green'] }
    rvi.getMap(vis, (mapId, err) => {
      if (err || !mapId || !mapId.urlFormat) { cb({ count, url: null, indexUsed: 'RVI', err }); return }
      cb({ count, url: mapId.urlFormat, indexUsed: 'RVI' })
    })
  }, (err) => {
    console.error('getRadarVegetationIndex.size failed:', err)
    cb({ count: 0, url: null, indexUsed: 'RVI' })
  })
}

// Health Zone Breakdown — bucket every pixel of the currently-viewed month's
// index composite (NDVI or the Sentinel-1 radar RVI fallback) into 10 ranges,
// returning the AREA in each bucket. Batched into a SINGLE server call (one
// .evaluate()), mirroring the fetchDryMonths fix: each bucket is a binary mask
// that updates the EE pixelArea() image, all stacked into one multi-band image
// and summed in one reduceRegion. Never loop per-bucket client-side.
//
//   index: 'ndvi' (Sentinel-2 monthly composite) | 'rvi' (Sentinel-1 radar)
//   cb(res|null): { buckets: [{lo, hi, areaSqm}], totalAreaSqm }
//                 null when no usable scenes for that month (cloud-blocked/no-data).
export function getZoneBreakdown(geometry, month, index, cb) {
  const e = ee()
  const buckets = index === 'rvi' ? RVI_ZONE_BUCKETS : NDVI_ZONE_BUCKETS
  const start = e.Date.fromYMD(month.year, month.month, 1)
  const end = start.advance(1, 'month')

  if (index === 'rvi') {
    // Same query as getRadarVegetationIndex: S1 IW, both polarizations, median,
    // RVI on LINEAR power (dB saturates into a flat image). ±15 day window keeps
    // the breakdown consistent with the radar fallback the map is showing.
    const s1 = e.ImageCollection('COPERNICUS/S1_GRD')
      .filterBounds(geometry)
      .filterDate(start.advance(-15, 'day'), end.advance(15, 'day'))
      .filter(e.Filter.eq('instrumentMode', 'IW'))
      .filter(e.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
      .filter(e.Filter.listContains('transmitterReceiverPolarisation', 'VH'))
    s1.size().evaluate((count) => {
      if (count === 0) { cb(null); return }
      const composite = s1.median().clip(geometry)
      const vvLinear = e.Image(10).pow(composite.select('VV').divide(10))
      const vhLinear = e.Image(10).pow(composite.select('VH').divide(10))
      const rvi = vhLinear.multiply(4).divide(vvLinear.add(vhLinear)).rename('z')
      reduceZoneBands(e, rvi, buckets, geometry, cb)
    }, (err) => {
      console.error('getZoneBreakdown.rvi.size failed:', err)
      cb(null)
    })
    return
  }

  // NDVI — the exact monthly composite the map shows for this month.
  const clean = e.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(geometry)
    .filterDate(start, end)
    .filter(e.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 40))
  clean.size().evaluate((count) => {
    if (count === 0) { cb(null); return }
    const ndvi = clean.median().clip(geometry).normalizedDifference(['B8', 'B4']).rename('z')
    reduceZoneBands(e, ndvi, buckets, geometry, cb)
  }, (err) => {
    console.error('getZoneBreakdown.ndvi.size failed:', err)
    cb(null)
  })
}

// Shared tail of getZoneBreakdown: stack one pixelArea()-masked band per bucket
// plus a total-area band, sum them all in a single reduceRegion.
function reduceZoneBands(e, indexImage, buckets, geometry, cb) {
  const area = e.Image.pixelArea()
  const parts = []
  const names = []
  buckets.forEach((b, i) => {
    const name = 'a' + i
    names.push(name)
    // updateMask() keeps only pixels whose NDVI/RVI falls in this bucket; the
    // reducer then sums their true ground area (m²).
    const mask = indexImage.gte(b.lo).and(indexImage.lt(b.hi))
    parts.push(area.updateMask(mask).rename(name))
  })
  names.push('total')
  parts.push(area.updateMask(indexImage.mask()).rename('total'))
  e.Image(parts)
    .reduceRegion({ reducer: e.Reducer.sum(), geometry, scale: 10, maxPixels: 1e9, bestEffort: true })
    .evaluate(
      (result) => {
        if (!result) { cb(null); return }
        cb({
          buckets: buckets.map((b, i) => ({ lo: b.lo, hi: b.hi, areaSqm: result['a' + i] || 0 })),
          totalAreaSqm: result.total || 0,
        })
      },
      (err) => {
        console.error('getZoneBreakdown.reduceRegion failed:', err)
        cb(null)
      },
    )
}

export function getIndexTimeSeries(lat, lng, index, months, cb) {
  const e = ee()
  const cfg = INDICES[index] || INDICES.ndvi
  const point = e.Geometry.Point([lng, lat])
  const startDate = e.Date.fromYMD(months[0].year, months[0].month, 1)
  const last = months[months.length - 1]
  const endDate = e.Date.fromYMD(last.year, last.month, 1).advance(1, 'month')
  const all = s2Collection(point, startDate, endDate)
  const series = all.map((img) => {
    const idxImg = img.normalizedDifference(cfg.bands).rename(cfg.name)
    const value = idxImg.reduceRegion({ reducer: e.Reducer.mean(), geometry: point, scale: 10 })
    return e.Feature(null, {
      date: img.date().format('YYYY-MM-dd'),
      cloudPct: e.Number(img.get('CLOUDY_PIXEL_PERCENTAGE')),
      value: value.get(cfg.name),
    })
  })
  series.filter(e.Filter.notNull(['value'])).evaluate((result) => {
    if (!result || !result.features) { cb([]); return }
    // Same-day duplicate S2 orbits: collapse to one entry per date, keeping the
    // LOWEST-cloud scene (see dedupeLowestCloud) so the trend/hero can't vary
    // with Earth Engine's arbitrary row order.
    const points = result.features.map((f) => ({
      date: f.properties.date,
      cloudPct: f.properties.cloudPct,
      value: f.properties.value,
    }))
    cb(dedupeLowestCloud(points))
  })
}

export function getIndexTimeSeriesForGeometry(geometry, index, months, cb) {
  const e = ee()
  const cfg = INDICES[index] || INDICES.ndvi
  const startDate = e.Date.fromYMD(months[0].year, months[0].month, 1)
  const last = months[months.length - 1]
  const endDate = e.Date.fromYMD(last.year, last.month, 1).advance(1, 'month')
  const all = s2Collection(geometry, startDate, endDate)
  const series = all.map((img) => {
    const idxImg = img.normalizedDifference(cfg.bands).rename(cfg.name)
    const value = idxImg.reduceRegion({ reducer: e.Reducer.mean(), geometry, scale: 10, maxPixels: 1e9 })
    return e.Feature(null, {
      date: img.date().format('YYYY-MM-dd'),
      cloudPct: e.Number(img.get('CLOUDY_PIXEL_PERCENTAGE')),
      value: value.get(cfg.name),
    })
  })
  series.filter(e.Filter.notNull(['value'])).evaluate((result) => {
    if (!result || !result.features) { cb([]); return }
    // Same-day duplicate S2 orbits: collapse to one entry per date, keeping the
    // LOWEST-cloud scene (see dedupeLowestCloud). This is the SHARED source of
    // truth for the hero NDVI panel, growth-stage box and pre-planting badge.
    const points = result.features.map((f) => ({
      date: f.properties.date,
      cloudPct: f.properties.cloudPct,
      value: f.properties.value,
    }))
    cb(dedupeLowestCloud(points))
  })
}

// Feature 3 — Auto-planting-date detection (LSWI spike).
// A transplant floods the field: LSWI jumps from dry soil (~0.0–0.2) toward
// flooded (~0.4+). Look at the trailing ~90 days of cloud-free LSWI at the
// given field geometry, find the steepest positive scene-to-scene jump that
// starts dry and lands flooded, and report the estimated date (midpoint of the
// two observations) plus the jump magnitude as a rough confidence signal.
// Returns null (never guesses) when data is too sparse or no spike is found.
export function detectPlantingDate(geometry, cb) {
  const e = ee()
  const bandName = 'LSWI'
  const end = e.Date(Date.now())
  const start = end.advance(-90, 'day')
  const all = s2Collection(geometry, start, end)
  const series = all.map((img) => {
    const lswi = img.normalizedDifference(['B8', 'B11']).rename(bandName)
    const value = lswi.reduceRegion({ reducer: e.Reducer.mean(), geometry, scale: 10, maxPixels: 1e9 })
    return e.Feature(null, { date: img.date().format('YYYY-MM-dd'), value: value.get(bandName) })
  })
  series.filter(e.Filter.notNull(['value'])).evaluate((result) => {
    const feats = (result && result.features) || []
    const points = feats
      .map((f) => ({ date: f.properties.date, value: f.properties.value }))
      .sort((a, b) => a.date.localeCompare(b.date))
    if (points.length < 2) { cb(null); return }
    // Steepest positive jump that plausibly reflects dry soil -> flooded field.
    let best = null
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1]
      const cur = points[i]
      const delta = cur.value - prev.value
      if (delta > 0.1 && prev.value < 0.25 && cur.value >= 0.3) {
        if (!best || delta > best.deltaMagnitude) {
          best = {
            estimatedDate: midpointDate(prev.date, cur.date),
            deltaMagnitude: delta,
          }
        }
      }
    }
    cb(best || null)
  }, (err) => {
    console.error('detectPlantingDate failed:', err)
    cb(null)
  })
}

function midpointDate(a, b) {
  const ms = (new Date(a).getTime() + new Date(b).getTime()) / 2
  return new Date(ms).toISOString().slice(0, 10)
}

export function getDryMonths(months, geometry, cb) {
  const e = ee()
  // Batch the per-month loop into ONE server-side call — same pattern as
  // getIndexTimeSeries: map over a FeatureCollection, single .evaluate().
  // Each input feature carries its original month index so the caller's
  // return shape (a Set of month indices) is preserved.
  const monthFC = e.FeatureCollection(
    months.map((m, i) => e.Feature(null, { idx: i, year: m.year, month: m.month }))
  )
  const results = monthFC.map((ft) => {
    ft = e.Feature(ft)
    const year = e.Number(ft.get('year'))
    const monthNum = e.Number(ft.get('month'))
    const start = e.Date.fromYMD(year, monthNum, 1)
    const end = start.advance(1, 'month')
    const totalMm = e.ImageCollection('UCSB-CHG/CHIRPS/DAILY')
      .filterDate(start, end)
      .filterBounds(geometry)
      .sum()
      .reduceRegion({ reducer: e.Reducer.mean(), geometry, scale: 5000, maxPixels: 1e9 })
      // Default 1e3: `.get(..., default)` avoids the server-side
      // "Dictionary does not contain key" crash when a month has no pixels;
      // a high default also means "not dry" rather than a false <50 flag.
      .get('precipitation', 1e3)
    return ft.set('totalMm', totalMm)
  })

  results.evaluate((fc) => {
    const drySet = new Set()
    ;((fc && fc.features) || []).forEach((f) => {
      const mm = f.properties.totalMm
      if (mm != null && mm < DRY_MONTH_THRESHOLD) drySet.add(f.properties.idx)
    })
    cb(drySet)
  }, (err) => {
    console.error('getDryMonths failed:', err)
    cb(new Set())
  })
}

export function getRecentIndexValue(geometry, index, cb) {
  const e = ee()
  const cfg = INDICES[index] || INDICES.ndvi
  // Cap at the same 90-day lookback the ee-alerts-worker uses, so the hero
  // NDVI and Telegram agree on when a field has no usable reading: once no
  // cloud-free scene exists within 90 days, the hero stops showing a number
  // instead of reaching back into the 14-month trend window for a stale one.
  // The trend chart keeps its own wider 14-month window for history; this is
  // the "current status" value, so it respects the stricter bound. Sort desc +
  // first() so we report the most recent available value.
  const start = e.Date(Date.now()).advance(-90, 'day')
  const end = e.Date(Date.now())
  const all = e.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(geometry)
    .filterDate(start, end)
    .sort('system:time_start', false)
all.size().evaluate((totalCount) => {
    if (totalCount === 0) { cb({ count: 0, value: null, date: null, cloudBlocked: false }); return }
    // Is the freshest imagery itself cloud-blocked? Same-day duplicate S2 orbits
    // (2+ scenes on one date, different cloud %) make `all.first()` an arbitrary
    // pick, so resolve "the scene for the freshest date" to the LEAST-cloudy
    // image of that day FIRST — otherwise a cloudier twin could flag the reading
    // Cloud-blocked when a clean scene of the same date exists, and the reported
    // value below would come from the wrong orbit.
    all.first().get('system:time_start').evaluate((ts) => {
      let dayStart = null
      try {
        const f = new Date(ts)
        dayStart = new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth(), f.getUTCDate()))
      } catch (err) { dayStart = null }
      if (!dayStart || isNaN(dayStart.getTime())) {
        cb({ count: 0, value: null, date: null, cloudBlocked: false })
        return
      }
      const freshestDay = all
        .filterDate(dayStart, new Date(dayStart.getTime() + 86400000))
        .sort('CLOUDY_PIXEL_PERCENTAGE')
      freshestDay.first().get('CLOUDY_PIXEL_PERCENTAGE').evaluate((cloudPct) => {
        const cloudBlocked = cloudPct != null && cloudPct >= 40
        const clean = all.filter(e.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 40))
        clean.size().evaluate((count) => {
          if (count === 0) { cb({ count: 0, value: null, date: null, cloudBlocked }); return }
          const recent = clean.first()
          const idxImg = recent.normalizedDifference(cfg.bands).rename(cfg.name)
          recent.get('system:time_start').evaluate((ts) => {
            const date = ts == null ? null : new Date(ts).toISOString().slice(0, 10)
            idxImg.reduceRegion({ reducer: e.Reducer.mean(), geometry, scale: 10, maxPixels: 1e9 })
              .evaluate(
                (result) => {
                  const value = result && result[cfg.name]
                  cb({ count, value: value == null || value === undefined ? null : value, date, cloudBlocked })
                },
                (err) => {
                  console.error('getRecentIndexValue.reduceRegion failed:', err)
                  cb({ count: 0, value: null, date, cloudBlocked })
                },
              )
          }, (err) => {
            console.error('getRecentIndexValue.time_start failed:', err)
            cb({ count: 0, value: null, date, cloudBlocked })
          })
        }, (err) => {
          console.error('getRecentIndexValue.size failed:', err)
          cb({ count: 0, value: null, date, cloudBlocked })
        })
      }, (err) => {
        console.error('getRecentIndexValue.cloud failed:', err)
        cb({ count: 0, value: null, date: null, cloudBlocked: false })
      })
    }, (err) => {
      console.error('getRecentIndexValue.freshest_time failed:', err)
      cb({ count: 0, value: null, date: null, cloudBlocked: false })
    })
  }, (err) => {
    console.error('getRecentIndexValue.size failed:', err)
    cb({ count: 0, value: null, date: null, cloudBlocked: false })
  })
}

export function getRainfallMm(geometry, daysBack, cb) {
  const e = ee()
  daysBack = daysBack || 21
  const end = e.Date(Date.now())
  const start = end.advance(-daysBack, 'day')
  e.ImageCollection('UCSB-CHG/CHIRPS/DAILY')
    .filterDate(start, end)
    .filterBounds(geometry)
    .sum()
    .reduceRegion({ reducer: e.Reducer.mean(), geometry, scale: 5000, maxPixels: 1e9 })
    .evaluate(
      (result) => cb(result && result.precipitation),
      (err) => {
        console.error('getRainfallMm failed:', err)
        cb(null)
      },
    )
}

// Browse Observations — one batched server-side query (no per-image
// .evaluate() loop; that pattern caused the serialized EE throttling bug in
// fetchDryMonths). Maps the whole S2 collection into a FeatureCollection of
// {date, source, cloudCover, status, ndvi} and evaluates() it once.
//
// Status is derived with the app's existing decision rules:
//   - cloudCover >= 40  -> 'blocked'   (the cloud-mask gate that marks a month
//                                       Cloud-blocked / LOW CONFIDENCE)
//   - < 40 but older than 21 days (the existing CONFIDENCE_STALE_DAYS) → 'low'
//   - otherwise                        → 'clear'
// These two constants MUST stay in sync with store.js getConfidenceTier().
export function getObservations(geometry, startISO, endISO, cb) {
  const e = ee()
  if (!geometry) { cb([]); return }
  const end = endISO && !isNaN(new Date(endISO)) ? e.Date(endISO) : e.Date(Date.now())
  const start = startISO && !isNaN(new Date(startISO))
    ? e.Date(startISO)
    : end.advance(-14, 'month') // same window as the trend time series
  const collection = e.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(geometry)
    .filterDate(start, end)
  const series = collection.map((img) => {
    const cloudCover = e.Number(img.get('CLOUDY_PIXEL_PERCENTAGE'))
    const blocked = cloudCover.gte(40)
    const ageDays = e.Date(Date.now()).difference(img.date(), 'day')
    const stale = e.Number(ageDays).gte(21)
    // Server-side branching — plain JS ternary on an EE object would always
    // pick the first branch, so branch with ee.Algorithms.If.
    const status = e.Algorithms.If(blocked, 'blocked', e.Algorithms.If(stale, 'low', 'clear'))
    const ndvi = img
      .normalizedDifference(['B8', 'B4'])
      .rename('ndvi')
      .reduceRegion({ reducer: e.Reducer.mean(), geometry, scale: 10, maxPixels: 1e9 })
      .get('ndvi')
    return e.Feature(null, {
      date: img.date().format('YYYY-MM-dd'),
      source: 'Sentinel-2', // optical only for now; Sentinel-1 radar rows can be merged here later
      cloudCover,
      status,
      ndvi,
    })
  })
  series.evaluate((result) => {
    const feats = (result && result.features) || []
    // Same-day duplicate S2 orbits produce 2+ rows for one date; collapse them
    // to the LEAST-cloudy row (via dedupeLowestCloud) so the Observations log,
    // hero panel and true-color picker always agree on "the scene for that date".
    const rows = dedupeLowestCloud(
      feats
        .map((f) => ({
          date: f.properties.date,
          source: f.properties.source,
          cloudCover: f.properties.cloudCover,
          status: f.properties.status,
          ndvi: f.properties.ndvi,
          cloudPct: f.properties.cloudCover, // key dedupeLowestCloud compares on
        }))
        .filter((r) => r.date != null),
    )
      .map(({ cloudPct, ...r }) => r) // drop the temporary alias
      .sort((a, b) => b.date.localeCompare(a.date)) // newest first
    cb(rows)
  }, (err) => {
    console.error('getObservations failed:', err)
    cb([])
  })
}
