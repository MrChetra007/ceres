import { INDICES, DRY_MONTH_THRESHOLD } from '../config'

function ee() {
  return window.ee
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
    const vis = { bands: ['B4', 'B3', 'B2'], min: 0, max: 3000 }
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
        // Cloud-blocked: pick the least-cloudy scene for the true-color fallback.
        const bestScene = rawCollection.sort('CLOUDY_PIXEL_PERCENTAGE').first()
        getCloudPctAndTrueColor(bestScene, geometry, start, (res) => {
          cb({ mode: 'cloud_blocked', count: 0, url: res.url, cloudPct: res.cloudPct, lastValidDate: res.lastValidDate, err: res.err })
        })
      })
      return
    }
    const composite = cleanCollection.median().clip(geometry).normalizedDifference(cfg.bands).rename(cfg.name)
    composite.getMap(cfg.vis, (mapId, err) => {
      if (err || !mapId || !mapId.urlFormat) { cb({ mode: 'index', count, url: null, err }); return }
      cb({ mode: 'index', count, url: mapId.urlFormat })
    })
  })
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
    return e.Feature(null, { date: img.date().format('YYYY-MM-dd'), value: value.get(cfg.name) })
  })
  series.filter(e.Filter.notNull(['value'])).evaluate((result) => {
    if (!result || !result.features) { cb([]); return }
    cb(result.features.map((f) => ({ date: f.properties.date, value: f.properties.value })))
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
    return e.Feature(null, { date: img.date().format('YYYY-MM-dd'), value: value.get(cfg.name) })
  })
  series.filter(e.Filter.notNull(['value'])).evaluate((result) => {
    if (!result || !result.features) { cb([]); return }
    cb(result.features.map((f) => ({ date: f.properties.date, value: f.properties.value })))
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
  // Same 14-month window the trend chart uses — a hard 30-day window returns
  // zero scenes whenever the latest cloud-free image is older than a month
  // (common in Cambodia's rainy season), which silently showed "No recent data"
  // while the trend/stress cards had real values. Sort desc + first() so we
  // report the most recent available value, consistent with the chart's last point.
  const start = e.Date(Date.now()).advance(-14, 'month')
  const end = e.Date(Date.now())
  const all = e.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(geometry)
    .filterDate(start, end)
    .sort('system:time_start', false)
  all.size().evaluate((totalCount) => {
    if (totalCount === 0) { cb({ count: 0, value: null, date: null, cloudBlocked: false }); return }
    // Is the freshest scene itself cloud-blocked? If so the last valid reading
    // is older than the freshest imagery — the data is effectively masked.
    all.first().get('CLOUDY_PIXEL_PERCENTAGE').evaluate((cloudPct) => {
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
          cb({ count: 0, value: null, date: null, cloudBlocked })
        })
      }, (err) => {
        console.error('getRecentIndexValue.size failed:', err)
        cb({ count: 0, value: null, date: null, cloudBlocked })
      })
    }, (err) => {
      console.error('getRecentIndexValue.cloud failed:', err)
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
