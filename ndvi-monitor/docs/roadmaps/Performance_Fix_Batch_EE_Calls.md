# Performance Fix — Batch Sequential Earth Engine Calls on App Init

## Context

After building the Data Trust Layer (cloud-blocked fallback + confidence badge), the app has
become noticeably slow on load. Investigation via Chrome DevTools Network tab + stack trace
confirmed the root cause: `initializeEE()` in `src/store.js` fires several functions on Earth
Engine auth success that each make **N sequential `.evaluate()` calls** (one full network
round-trip per item) instead of one batched call. Earth Engine's JS client internally serializes
these through a throttle (`goog.async.Throttle`), so they queue up and run one after another —
dozens of ~300–1700ms calls adding up to 15-20+ seconds of blocking "loading" state before the
map is usable.

This is a real, measured regression, not a guess — confirmed via Network tab (dozens of
`value:compute` XHR calls firing in sequence, immediately on app load) and a JS stack trace
showing the chain: `ee.initialize()` success callback → `initializeEE()` (store.js) →
`fetchDryMonths()` → `ee.getDryMonths()` (earthEngine.js) → one `.evaluate()` per month.

## The specific culprit

`fetchDryMonths()` in `store.js` calls `ee.getDryMonths(MONTHS, geom, callback)`. Per the existing
implementation and roadmap notes, this queries CHIRPS **per month individually** — a JS-side loop
that calls `.evaluate()` once for each entry in `MONTHS` (14 months = 14 sequential round-trips).
This fires immediately inside `initializeEE()`'s success callback, before the user has done
anything.

`refreshAllFieldStatuses()` and `refreshAllFieldTrends()` (also called in the same
`initializeEE()` callback) loop over `state.fields` and call `updateFieldStatus()` /
`loadFieldTrend()` once per field — each of which makes its own separate Earth Engine call. This
compounds the same problem if the user has more than 1-2 saved fields.

## Fix 1 — Batch `getDryMonths` into a single server-side call (highest priority)

Locate `getDryMonths()` in `src/services/earthEngine.js`. It currently loops in JavaScript and
calls `.evaluate()` (or `.getInfo()`) once per month. Rewrite it to do the looping **inside Earth
Engine**, server-side, and pull all results in **one** round trip:

```javascript
// Conceptual shape — adapt to match existing function signature/return shape
export function getDryMonths(months, geometry, callback) {
  const monthList = ee.List(months.map((m) => ({
    label: m.label,
    start: m.start, // however month boundaries are currently represented
    end: m.end,
  })))

  const results = ee.FeatureCollection(monthList.map((m) => {
    m = ee.Dictionary(m)
    const start = ee.Date(m.get('start'))
    const end = ee.Date(m.get('end'))
    const totalMm = ee.ImageCollection('UCSB-CHG/CHIRPS/DAILY')
      .filterBounds(geometry)
      .filterDate(start, end)
      .sum()
      .reduceRegion({ reducer: ee.Reducer.mean(), geometry, scale: 5000, maxPixels: 1e9 })
      .get('precipitation')
    return ee.Feature(null, { label: m.get('label'), totalMm: totalMm })
  }))

  results.evaluate((fc) => {
    const drySet = new Set()
    fc.features.forEach((f) => {
      if (f.properties.totalMm != null && f.properties.totalMm < 50) {
        drySet.add(f.properties.label)
      }
    })
    callback(drySet)
  })
}
```

Adjust field names/reducer to match whatever the current per-month implementation actually
computes — the point is: **one `.evaluate()` call on a `FeatureCollection` built via
`ee.List.map()`, not N separate calls.** Preserve the existing return shape (`drySet` — a Set of
month labels) so `fetchDryMonths()` in `store.js` doesn't need to change.

## Fix 2 — Defer `fetchDryMonths()` so it doesn't block the initial map load

In `initializeEE()` (`store.js`), `fetchDryMonths()` currently fires before/alongside
`loadIndexForMonth()` — the thing the user is actually waiting to see. Reorder so the visible map
loads first, and defer the dry-month markers (a secondary overlay, not core functionality) until
after:

```javascript
// Inside initializeEE()'s success callback:
setStatus('computing', 'Computing NDVI...')
loadIndexForMonth(state.mainMonth, null)  // user-visible — do this first

// Defer non-critical background work so it doesn't compete for the throttled
// EE connection with the map load the user is staring at:
requestIdleCallback
  ? requestIdleCallback(() => fetchDryMonths())
  : setTimeout(() => fetchDryMonths(), 0)
```

Do the same for `refreshAllFieldStatuses()` and `refreshAllFieldTrends()` — defer them behind
`loadIndexForMonth()` rather than firing all four at once on init.

## Fix 3 — Batch field status/trend refreshes when there are multiple saved fields

If a user has multiple saved fields, `refreshAllFieldStatuses()` (`state.fields.forEach(updateFieldStatus)`)
and `refreshAllFieldTrends()` (`state.fields.forEach(loadFieldTrend)`) each fire one Earth Engine
call per field. For now, this is lower priority than Fix 1 (typical users likely have few fields),
but if it proves to still be slow with several fields saved, apply the same batching pattern:
build one `ee.FeatureCollection` keyed by field id (using each field's geometry), compute status/
trend for all of them in a single `.map()` + one `.evaluate()`, then distribute results back into
`fieldStatus[field.id]` / `fieldTrends[field.id]` from the single callback. Only do this refactor
if profiling after Fix 1+2 shows it's still a meaningful contributor — don't do speculative work
here if the dry-months fix alone resolves the slowness.

## What NOT to do

- Don't reduce `MONTHS` to fewer months to "fix" this — that hides the problem by doing less work,
  not by doing the same work efficiently. The whole point is one call instead of many, not less
  data.
- Don't remove or disable the dry-month markers, confidence badges, or any Data Trust Layer
  feature — this is a performance fix for existing/new features, not a feature rollback.
- Don't introduce a different EE call pattern than what's used elsewhere in the codebase (i.e.
  keep using `ee.FeatureCollection` + `.map()` + one `.evaluate()`, matching how batched
  server-side computation is already done elsewhere in this app, e.g. time-series queries).

## Acceptance Checklist

- [ ] `getDryMonths()` makes exactly one `.evaluate()` call regardless of how many months are
      checked (verify in Network tab — one `value:compute` request, not N)
- [ ] On app load, the main NDVI map appears before dry-month markers, field statuses, and field
      trends are computed — those happen in the background afterward, not blocking first paint
- [ ] Time from Earth Engine auth success to the map being visible/interactive is meaningfully
      shorter than before (spot-check in Network tab: dozens of sequential `value:compute` calls
      should no longer appear on load)
- [ ] Dry-month markers, field dashboard badges, and field trend charts still populate correctly
      once their (now deferred/batched) calls complete — no functional regression, only faster
- [ ] `npm run build` passes; all existing features behave identically once loaded
