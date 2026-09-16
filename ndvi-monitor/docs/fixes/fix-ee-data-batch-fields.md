# Fix: batch per-field status/trend fetches instead of one call per field

## Symptom
On login, DevTools shows a burst of 8+ simultaneous `ee-data` requests, each
taking 4-16+ seconds, right after the fast Supabase `fields`/`aois`/`profiles`
calls. This happens on every sign-in and gets worse as more fields are saved.

## Root cause
`beginSessionWork()` in `src/store.js` runs:

```js
deferIdle(() => {
  fetchDryMonths()
  refreshAllFieldStatuses()   // .forEach(updateFieldStatus) — 1 ee-data call PER FIELD
  refreshAllFieldTrends()     // .forEach(loadFieldTrend)     — 1 ee-data call PER FIELD
})
```

`refreshAllFieldStatuses()` and `refreshAllFieldTrends()` each `.forEach()`
over `state.fields`, firing one independent `ee-data` call per field with no
batching or throttling. With N saved fields this is `1 + N + N` simultaneous
Earth Engine requests. Earth Engine's interactive/"Online" tier has
concurrency limits, so firing many requests at once causes some to queue or
throttle server-side rather than truly run in parallel — this is why times in
the trace vary wildly (4s to 16s) instead of clustering together.

This will scale worse, not better, as farmers save more fields — it's the
single biggest latency risk in the whole app if usage grows.

## Fix — batch all fields into one Earth Engine call per operation

This codebase already has the exact pattern needed: `actionGetDryMonths` in
`supabase/functions/ee-data/index.ts` takes an array of months, builds one
`ee.FeatureCollection`, maps a computation over all of them, and evaluates
once. Do the same thing for field statuses and field trends — array of field
geometries in, one batched EE `.map()`, one `evaluate()`, one HTTP response.

### 1. New action: `getAllFieldStatuses`

Replaces N calls to `getRecentIndexValue` with one call covering every field.

**Request payload:**
```json
{
  "action": "getAllFieldStatuses",
  "index": "ndvi",
  "fields": [
    { "id": "field-uuid-1", "geometry": { ...GeoJSON... } },
    { "id": "field-uuid-2", "geometry": { ...GeoJSON... } }
  ]
}
```

**Implementation notes (mirrors `actionGetRecentIndexValue`'s logic, just
batched):**
- Build one `ee.FeatureCollection` from the incoming `fields` array, each
  Feature carrying the field's `id` as a property (same trick
  `actionGetDryMonths` uses with `idx`).
- Map over it: for each field, run the same 90-day-lookback /
  freshest-clean-scene / cloud-blocked logic `actionGetRecentIndexValue`
  already has, but as a per-Feature computation inside the `.map()` instead of
  a standalone function.
- **Important:** each field has a different geometry, so `filterBounds` inside
  the map must use `ee.Feature(ft).geometry()` per iteration — this is
  normal EE `.map()` usage, not a new pattern, just confirm the existing
  per-field cloud/count logic is expressed as pure EE operations (no
  client-side `await evaluate()` calls *inside* the `.map()` callback — those
  must happen once, after the single outer `evaluate()`).
- Return: `{ statuses: [{ id, value, count, date, cloudBlocked }, ...] }` —
  one entry per input field, in any order (match by `id` client-side).

**Frontend change (`refreshAllFieldStatuses` in `src/store.js`):**
```js
export function refreshAllFieldStatuses() {
  if (!state.fields.length) return
  const payload = state.fields.map((f) => {
    const geom = f.geojson && (f.geojson.geometry || f.geojson)
    return geom && geom.coordinates ? { id: f.id, geometry: geom } : null
  }).filter(Boolean)
  if (!payload.length) return
  ee.getAllFieldStatuses(payload, state.currentIndex, (statuses) => {
    statuses.forEach(({ id, value, count, date, cloudBlocked }) => {
      const field = state.fields.find((f) => f.id === id)
      if (!field) return
      if (count === 0 || value == null) {
        fieldStatus[id] = { badgeText: '—', badgeClass: '', stageLabel: noReadingText(state.preferredLanguage), value: null, count: 0, date: date || null, cloudBlocked: !!cloudBlocked }
      } else {
        fieldStatus[id] = { ...buildStatusObject(field, value, state.currentIndex), value, count, date: date || null, cloudBlocked: !!cloudBlocked }
      }
      if (id === state.currentFieldId) applyFieldStyle()
    })
  })
}
```
`updateFieldStatus(field)` (the single-field version) stays as-is — it's still
needed for the "just saved one new field" and "field boundary just edited"
cases where refetching everything would be wasteful.

### 2. New action: `getAllFieldTrends`

Same batching idea for `refreshAllFieldTrends()` → `loadFieldTrend()`, which
currently fires one `getIndexTimeSeriesForGeometry` call per field (a 14-month
series each — this is actually the heavier half of the original problem,
since each one already contains its own internal `.map()` over months).

**Request payload:**
```json
{
  "action": "getAllFieldTrends",
  "index": "ndvi",
  "months": [{ "year": 2026, "month": 1 }, ...],
  "fields": [
    { "id": "field-uuid-1", "geometry": { ...GeoJSON... } }
  ]
}
```

**Implementation:** nested batching — outer `ee.FeatureCollection` over
fields, and for each field the existing per-month `.map()` logic from
`actionGetIndexTimeSeries`. This is more EE compute per call than
`getAllFieldStatuses` (fields × months data points), so:
- Keep `scale: 10` as-is for accuracy, but this is the action most likely to
  need a longer function timeout — check Supabase's current Edge Function
  timeout limit against expected field count × month count before assuming
  this fully replaces the per-field loop for very large field counts (20+).
- Return: `{ trends: [{ id, points: [{ date, cloudPct, value }, ...] }, ...] }`.

**Frontend change (`refreshAllFieldTrends`):** same shape as above — one
batched call, then distribute results into `fieldTrends[field.id]` by
matching `id`.

### 3. Only fields with valid geometry go in the batch

Both new actions should skip fields with missing/invalid `geojson.coordinates`
client-side before sending (see the `.filter(Boolean)` in the snippet above)
— don't send malformed geometries into the EE `.map()` where a single bad
entry could fail the whole batch.

### 4. Keep the single-field actions

Do NOT remove `getRecentIndexValue` or `getIndexTimeSeriesForGeometry` /
`getIndexTimeSeries` (point) actions — they're still the right tool for:
- `updateFieldStatus(field)` right after saving one new field
- `loadFieldTrend(field)` right after saving one new field
- `onMapClick` (single point, not a saved field)
- `loadChartForGeometry` (the currently-open field detail chart — already
  being fixed separately with response caching, see the earlier chart-cache
  patch)

This fix is specifically for the "refresh every field on login" fan-out, not
a replacement for every per-field call in the app.

## Done when

Signing in with several saved fields shows the Network tab go from N+N+1
separate `ee-data` calls down to 2-3 total (`getAllFieldStatuses`,
`getAllFieldTrends`, `getDryMonths`), and the dashboard health badges /
field-card sparklines populate without the multi-field pile-up latency seen in
the original trace (8 calls, 4-16s each).
