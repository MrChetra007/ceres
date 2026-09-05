// Very light reverse-geocoding, used only when saving a field so the AI and
// alerts can name the field's real province/region instead of a hardcoded one.
// Nominatim (OpenStreetMap) is free for low volume with honest usage.
const CACHE = new Map()
let queue = Promise.resolve()

export function reverseGeocode(lat, lng, timeoutMs = 6000) {
  if (lat == null || lng == null || !isFinite(lat) || !isFinite(lng)) return Promise.resolve(null)
  const key = lat.toFixed(3) + ',' + lng.toFixed(3)
  if (CACHE.has(key)) return Promise.resolve(CACHE.get(key))
  const run = queue.then(() =>
    fetch(
      'https://nominatim.openstreetmap.org/reverse' +
        '?format=jsonv2&zoom=10&lat=' + encodeURIComponent(lat) + '&lon=' + encodeURIComponent(lng)
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const a = j && j.address
        const region = a && (a.province || a.state || a.region || a.county)
        const country = a && a.country
        const name = [region, country].filter(Boolean).join(', ')
        return name || null
      })
      .catch(() => null)
  )
  const raced = Promise.race([run, new Promise((r) => setTimeout(() => r(null), timeoutMs))])
  // Cache whatever landed first so a second field nearby resolves instantly.
  raced.then((val) => CACHE.set(key, val))
  queue = run.catch(() => {})
  return raced
}