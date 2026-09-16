# Fix: cache the trend chart series so mode switches stop refetching it

## Symptom
Switching NDVI → NDWI → LSWI (or back) feels slow. Two `ee-data` calls fire on
every switch (`setIndex()` in `src/store.js`): the map tile (`getIndexTile`)
and the trend chart series (`getIndexTimeSeries` /
`getIndexTimeSeriesForGeometry`). The chart call is the heavier one — it maps
`reduceRegion` over every month in the active window (~14 months) inside a
single Earth Engine `.map()`, then evaluates the whole batch. That's real EE
compute across ~14 images, done fresh on every single index switch, even when
you're just toggling back and forth between indices you already viewed this
session.

## Root cause
`setIndex(index)` in `src/store.js` unconditionally calls either
`loadChartForGeometry(currentGeometry.value, index, state.currentFieldName)`
or `reloadChartForIndex()` — there is no cache check, so NDVI→NDWI→NDVI always
re-runs the full EE query three times instead of reusing the first two
results.

This codebase already has this exact caching pattern in two other places —
`fetchHealthZone()` and `fetchObservations()` both build a cache key and skip
the EE call on a hit. This fix extends that same pattern to the trend chart,
it doesn't invent a new one.

## Fix — cache trend series by (subject, index)

### 1. Add a chart cache alongside the existing `fieldTrends` reactive object

`fieldTrends` already caches the NDVI-only per-field series (see
`loadFieldTrend`/`refreshAllFieldTrends`). Add a parallel general-purpose
cache for the *currently open* chart (which can be keyed by field OR by a
clicked point, and by whichever index is active) — don't reuse
`fieldTrends` directly since it's hardcoded to NDVI and to fields, and the
open chart also serves point clicks.

```js
// Near the other module-scope state, alongside fieldTrends/toastTimers etc.
const chartCache = new Map() // key -> { data: [...], subtitle, fetchedAt }
const CHART_CACHE_TTL_MS = 15 * 60 * 1000 // matches EE_INIT_TTL_MS order of magnitude; tune if needed

function chartCacheKey(subjectKey, index, rangeKey) {
  return subjectKey + '|' + index + '|' + rangeKey
}
```

- `subjectKey` — for a field: `'field:' + field.id`. For a point click:
  `'point:' + lat.toFixed(4) + ',' + lng.toFixed(4)` (matches the precision
  already used in `state.chartSubtitle`).
- `rangeKey` — reuse the same range-key pattern `fetchObservations()` already
  builds: `(state.rangeStart || '') + '|' + (state.rangeEnd || '')`, so a
  date-range change correctly invalidates the cache instead of serving stale
  months.

### 2. Check the cache before calling `ee.getIndexTimeSeries*`

In both `loadChartForPoint(lat, lng, index, onEmpty)` and
`loadChartForGeometry(geometry, index, label)`:

```js
const rangeKey = (state.rangeStart || '') + '|' + (state.rangeEnd || '')
const subjectKey = /* 'field:'+id or 'point:'+lat,lng, as above */
const key = chartCacheKey(subjectKey, index, rangeKey)
const cached = chartCache.get(key)
if (cached && Date.now() - cached.fetchedAt < CHART_CACHE_TTL_MS) {
  state.chartData = cached.data
  state.chartIndex = index
  state.chartSubtitle = cached.subtitle
  checkStress(cached.data, lat, lng, index) // or (cached.data, null, null, index) for geometry callers
  setStatus('ready', /* same message pattern, note it's from cache is optional in the status text */)
  return
}
```

Only fall through to the existing `ee.getIndexTimeSeries*` call on a cache
miss, and on a successful fetch, store the result:

```js
chartCache.set(key, { data, subtitle: state.chartSubtitle, fetchedAt: Date.now() })
```

### 3. Invalidate correctly — don't serve stale data

The cache must be cleared/bypassed in these cases (all already have an event
hook in `store.js` to attach to):

- **Field boundary edited** (`onFieldEdited()`) — the field's geometry
  changed, so its cached series for every index is now wrong. Delete all
  `chartCache` entries whose key starts with `'field:' + field.id + '|'`.
- **Planting date changed** (`updateField(id, { planting_date... })`) — this
  doesn't change the NDVI *values*, only their stage interpretation
  (`buildStatusObject`), so the raw chart series cache does NOT need
  invalidating here — only `fieldStatus[id]` (already handled). Leave this
  one alone; listed here so it's not "fixed" by mistake.
- **Date range changed** (`applyDateRange` / `clearDateRange`) — already
  naturally handled since `rangeKey` is part of the cache key; a new range
  produces a cache miss automatically. No explicit invalidation code needed,
  just confirm the key includes `rangeKey` as shown above.
- **TTL expiry** — the 15-minute TTL above handles the case where the
  underlying Sentinel-2 collection gains a new scene mid-session. Don't skip
  this even though field/range invalidation is explicit — new imagery can
  land at any time independent of any user action.

### 4. Do NOT cache these (out of scope for this fix)

- `getIndexTile` (map tile) — different fix (module-scope scene-count cache),
  tracked separately, not this one.
- `fieldTrends` (the existing NDVI-only per-field cache used for dashboard
  sparklines) — already has its own cache, already correct, leave untouched.
- `getRecentIndexValue` (`updateFieldStatus`, `loadBenchmark`) — these are
  cheap single-month lookups already, not the slow path.

## Done when

Switching index (NDVI → NDWI → LSWI → NDVI) on the same field or point within
the same session shows the trend chart update near-instantly on any index
you've already viewed once, with only a genuinely new index/subject/range
combination triggering a real `ee-data` call (visible in Network tab — repeat
switches back to a previously-viewed index should show NO `getIndexTimeSeries`
request at all).
