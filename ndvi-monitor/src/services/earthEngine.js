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

export function loadIndexTile(month, index, geometry, cb) {
  const e = ee()
  const cfg = INDICES[index] || INDICES.ndvi
  const start = e.Date.fromYMD(month.year, month.month, 1)
  const end = start.advance(1, 'month')
  const collection = s2Collection(geometry, start, end)
  collection.size().evaluate((count) => {
    if (count === 0) { cb({ count, url: null, err: 'none' }); return }
    const composite = collection.median().clip(geometry).normalizedDifference(cfg.bands).rename(cfg.name)
    composite.getMap(cfg.vis, (mapId, err) => {
      if (err || !mapId || !mapId.urlFormat) { cb({ count, url: null, err }); return }
      cb({ count, url: mapId.urlFormat })
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

export function getDryMonths(months, geometry, cb) {
  const e = ee()
  const drySet = new Set()
  let pending = months.length
  months.forEach((m, i) => {
    const start = e.Date.fromYMD(m.year, m.month, 1)
    const end = start.advance(1, 'month')
    e.ImageCollection('UCSB-CHG/CHIRPS/DAILY')
      .filterDate(start, end)
      .filterBounds(geometry)
      .sum()
      .reduceRegion({ reducer: e.Reducer.mean(), geometry, scale: 5000, maxPixels: 1e9 })
      .evaluate((result) => {
        const mm = result && result.precipitation
        if (mm != null && mm < DRY_MONTH_THRESHOLD) drySet.add(i)
        pending--
        if (pending === 0) cb(drySet)
      })
  })
}

export function getRecentIndexValue(geometry, index, cb) {
  const e = ee()
  const cfg = INDICES[index] || INDICES.ndvi
  const start = e.Date(Date.now()).advance(-1, 'month')
  const end = e.Date(Date.now())
  const collection = s2Collection(geometry, start, end)
  collection.size().evaluate((count) => {
    if (count === 0) { cb({ count: 0, value: null }); return }
    const recent = collection.median().normalizedDifference(cfg.bands).rename(cfg.name)
    recent.reduceRegion({ reducer: e.Reducer.mean(), geometry, scale: 10, maxPixels: 1e9 })
      .evaluate((result) => {
        const value = result && result[cfg.name]
        cb({ count, value: value == null || value === undefined ? null : value })
      })
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
    .evaluate((result) => cb(result && result.precipitation))
}
