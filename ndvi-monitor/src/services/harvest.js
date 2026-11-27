// Harvest-state helpers shared by the field panel, triage and JSON export.
//
// A field is harvested once TODAY is on/after its harvest_date. For the field
// panel we compare the SCRUBBED MONTH instead, so earlier months remain
// viewable ("earlier readings stay visible") while the harvest month and later
// show "Harvested". Dates are YYYY-MM-DD and comparisons are UTC-based to match
// the worker / database current_date.

export function harvestDateOf(field) {
  const h = field && field.harvestDate
  return h ? String(h).slice(0, 10) : null
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export function isHarvestedOn(field, dateISO) {
  const h = harvestDateOf(field)
  const d = dateISO ? String(dateISO).slice(0, 10) : null
  return !!h && !!d && d >= h
}

export function isHarvestedNow(field) {
  return isHarvestedOn(field, todayISO())
}

// True only once the harvest date has actually arrived (a future planned date
// does not hide the crop), and only for the harvest month or later.
export function isHarvestedForMonth(field, month) {
  const h = harvestDateOf(field)
  if (!h) return false
  if (h > todayISO()) return false
  if (!month || month.year == null || month.month == null) return true
  const monthKey = month.year + '-' + String(month.month).padStart(2, '0')
  return monthKey >= h.slice(0, 7)
}
