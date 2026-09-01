# Fix: Field Selection Fires ~10 Concurrent `ee-data` Requests

## Diagnosis (confirmed via Network tab + logs)

Selecting a field triggers a burst of separate `ee-data` fetches, each
2.5–7.2 seconds, even though each response is tiny (~1 kB — a URL string
and a few numbers). This is NOT a bandwidth problem — payload sizes are
trivial. It's a **per-request latency problem**, caused by firing many
independent Edge Function invocations at once instead of one.

Two things make each of those ~10 requests expensive on its own:

1. **Cold Deno isolates.** EE auth state is cached *per isolate*
   (`ensureEE()`'s `eeReady`/`eeReadyAt` module-scope cache in `ee-data`).
   Ten concurrent invocations can land on ten different isolates, each
   paying the full `authenticateViaPrivateKey` + `ee.initialize()` handshake
   independently instead of sharing one warm session.
2. **Earth Engine's concurrent-request throttling** — firing many EE calls
   at once can queue against EE's own concurrency limits.

## Fix approach

Don't parallelize more — **consolidate**. Combine the several actions that
`loadField()` currently fires as separate `ee-data` round-trips into ONE
request (`getFieldBundle`) that does the sub-computations inside a single
already-authenticated isolate (using `Promise.all` for the EE calls
*within* that one warm session — that's fine; the expensive part was
cross-isolate auth, not concurrency itself).

This mirrors the batching principle already used for
`getAllFieldStatuses`/`getAllFieldTrends` (many *fields* in one call) —
just extended to many *actions* for one field.

### What gets bundled

`loadField(field)` in `store.js` currently fires, in order:

```js
loadIndexForMonth(state.mainMonth, currentGeometry.value)  // getIndexTile
loadFieldTrend(field)                                       // getIndexTimeSeries (ndvi, dashboard sparkline)
loadRainfall(currentGeometry.value)                          // getRainfall
loadBenchmark()                                              // getRecentIndexValue (ndvi)
loadChartForGeometry(currentGeometry.value, state.currentIndex, field.name)  // getIndexTimeSeries (current tab's index)
```

These five bundle cleanly — they all take the same `geometry` + `year`/
`month`/`months` inputs and don't depend on each other's results.
`fetchObservations`/`fetchHealthZone` are left OUT of the bundle (they
already have their own server-side permanent caching and are typically
triggered by separate UI panels opening, not by field selection itself —
confirm this in your actual `FieldDetailPanel.vue` before assuming; if it
turns out one of those DOES fire immediately on field select every time,
add it to the bundle the same way).

---

## Step 1 — Backend: add `actionGetFieldBundle` to `ee-data`

Add this new handler function (near the other `action*` functions):

```typescript
// ── getFieldBundle ──────────────────────────────────────────────────────
// Consolidates the several per-field reads that fire together when a field
// is selected (tile, ndvi dashboard trend, current-tab trend, rainfall,
// benchmark) into ONE request. Runs them concurrently INSIDE this single
// already-authenticated isolate — the earlier per-action version fired
// each as a separate ee-data invocation, paying EE auth/isolate-cold-start
// latency N times instead of once. See docs/field-bundle-fix.md.
async function actionGetFieldBundle(payload: any) {
  const geom = toEeGeometry(payload.geometry);
  const currentIndex = payload.currentIndex && BANDS[payload.currentIndex]
    ? payload.currentIndex
    : "ndvi";
  const months = payload.months || [];
  const year = payload.year;
  const month = payload.month;

  const tilePromise = actionGetIndexTile({
    index: currentIndex, year, month, geometry: payload.geometry,
  });
  const ndviTrendPromise = actionGetIndexTimeSeries({
    index: "ndvi", months, geometry: payload.geometry,
  });
  // Skip a duplicate call if the current tab IS ndvi — reuse the same trend.
  const chartTrendPromise = currentIndex === "ndvi"
    ? ndviTrendPromise
    : actionGetIndexTimeSeries({ index: currentIndex, months, geometry: payload.geometry });
  const rainfallPromise = actionGetRainfall({ geometry: payload.geometry, daysBack: 21 });
  const benchmarkPromise = actionGetRecentIndexValue({ index: "ndvi", geometry: payload.geometry });

  const [tile, ndviTrend, chartTrend, rainfall, benchmark] = await Promise.all([
    tilePromise, ndviTrendPromise, chartTrendPromise, rainfallPromise, benchmarkPromise,
  ]);

  return { tile, ndviTrend, chartTrend, rainfall, benchmark };
}
```

Register it in the `HANDLERS` router object:

```typescript
const HANDLERS: Record<string, Handler> = {
  getIndexTile: actionGetIndexTile,
  // ...existing entries...
  getFieldBundle: actionGetFieldBundle,   // <-- add this line
};
```

**Note on `Promise.all` here vs. the isolate problem:** this is safe and
intentional — these 5 calls now share ONE `ensureEE()` call (already
resolved before any handler runs, per the `Deno.serve` wrapper), so there's
no repeated auth cost. They're genuinely independent EE queries running
concurrently within a single warm session, which is exactly what you want.

Deploy:
```bash
supabase functions deploy ee-data
```

---

## Step 2 — Frontend: add the wrapper in `services/earthEngine.js`

```js
// Bundled per-field load — combines tile + trends + rainfall + benchmark
// into ONE ee-data request instead of 5 separate ones (see
// docs/field-bundle-fix.md for why this matters: cold-isolate auth cost
// was being paid once per request instead of once per field-select).
export function getFieldBundle(geometry, year, month, months, currentIndex, cb) {
  callEE('getFieldBundle', { geometry, year, month, months, currentIndex })
    .then((body) => cb({
      tile: body.tile || { mode: 'no_data', count: 0, url: null },
      ndviTrend: dedupeLowestCloud(body.ndviTrend?.points || []),
      chartTrend: dedupeLowestCloud(body.chartTrend?.points || []),
      rainfall: body.rainfall?.mm == null ? null : body.rainfall.mm,
      benchmark: body.benchmark?.value == null ? null : body.benchmark.value,
    }))
    .catch((err) => {
      fail(err)
      cb(null)
    })
}
```

---

## Step 3 — Frontend: rewrite `loadField()` in `store.js`

Replace the current `loadField` body's data-loading tail (everything after
the map/geometry setup, i.e. from `loadIndexForMonth(...)` through
`loadChartForGeometry(...)`) with a single bundled call:

```js
export function loadField(field) {
  state.currentFieldName = field.name
  state.currentFieldId = field.id
  state.ndviChartData = null
  mapReg.drawnItems.clearLayers()
  const geo = window.L.geoJSON(field.geojson)
  geo.eachLayer((l) => {
    l.on('click', () => {
      if (state.currentFieldId !== field.id) loadField(field)
      else state.infoPanelVisible = true
    })
    mapReg.drawnItems.addLayer(l)
  })
  applyFieldStyle()
  updateDrawEditVisibility()
  mapReg.map.fitBounds(geo.getBounds(), { maxZoom: 18, padding: [40, 40] })

  const geom = field.geojson && (field.geojson.geometry || field.geojson)
  if (!geom || !geom.coordinates) {
    setStatus('error', 'Field has invalid geometry')
    return
  }
  currentGeometry.value = polygonGeometry(geom.coordinates)
  hideAoiRectangle()
  state.infoPanelVisible = true
  state.observationsVisible = true
  state.chartSubtitle = field.name

  // Compare mode's right-panel tile still needs its own request (different
  // month) — that one stays as-is, it wasn't part of the burst.
  if (state.compareMode) loadIndexForMonthRight(state.rightMonth)

  if (!state.eeReady) return
  const m = MONTHS[state.mainMonth]
  if (!m) return

  beginLoading()
  setStatus('computing', 'Loading field data...')
  ee.getFieldBundle(
    currentGeometry.value,
    m.year, m.month,
    activeMonths(),
    state.currentIndex,
    (res) => {
      endLoading()
      if (!res) {
        setStatus('error', 'Failed to load field data')
        return
      }

      // 1. Map tile — same handling loadIndexForMonth's ee.loadIndexTile
      //    callback already does. Duplicate the mode-branching here (or
      //    better: extract that branching into a shared function both
      //    loadIndexForMonth and this callback call, to avoid drift).
      applyTileResult(res.tile, m)  // <-- see Step 3a below

      // 2. Dashboard sparkline trend (always NDVI).
      fieldTrends[field.id] = res.ndviTrend

      // 3. Current-tab trend chart.
      const cfg = INDICES[state.currentIndex] || TRUE_COLOR
      state.chartData = res.chartTrend
      state.chartIndex = state.currentIndex
      state.chartSubtitle = field.name + ' \u00b7 ' + observationCount(state.preferredLanguage, res.chartTrend.length, trendSource(state.currentIndex))
      if (state.currentIndex !== 'rvi') state.ndviChartData = res.chartTrend
      checkStress(res.chartTrend, null, null, state.currentIndex)

      // 4. Rainfall + benchmark.
      state.rainfallMm = res.rainfall
      state.benchmarkValue = res.benchmark

      setStatus('ready', cfg.name + ' field data loaded')
    },
  )
}
```

### Step 3a — Extract the tile-result branching into a shared function

`loadIndexForMonth`'s callback already contains a big `if (res.mode ===
'radar_fallback') {...} else if (res.mode === 'radar_index') {...} else
if (res.mode === 'cloud_blocked') {...} else if (res.mode === 'no_data')
{...} else {...}` chain. `loadField`'s bundled callback needs to apply
that exact same logic to `res.tile`. Rather than duplicating it, extract
it into a shared function once:

```js
// Shared by loadIndexForMonth's callback and loadField's bundled callback —
// applies a getIndexTile-shaped result to the MAIN map layer + related state.
// (side is always 'main' here; loadIndexForMonthRight keeps its own
// duplicate of this logic for the right panel, unless you extract that too.)
function applyTileResult(res, m) {
  state.sceneCount.main = res.count
  if (res.mode === 'error') {
    if (mapReg.ndviLayer) { mapReg.map.removeLayer(mapReg.ndviLayer); mapReg.ndviLayer = null }
    showToast('Satellite request failed \u2014 ' + (res.err || 'please try again'))
    setStatus('error', 'Satellite request failed for ' + m.label)
    return
  }
  if (res.mode === 'radar_fallback') {
    if (res.url) mapReg.ndviLayer = applyTileLayer(mapReg.map, mapReg.ndviLayer, res.url, 1)
    else if (mapReg.ndviLayer) { mapReg.map.removeLayer(mapReg.ndviLayer); mapReg.ndviLayer = null }
    state.radarFallback.main = { month: m.label, indexUsed: res.indexUsed || 'RVI' }
    setStatus('ready', 'Radar view (RVI) for ' + m.label + ' \u2014 clouds blocked optical view')
    return
  }
  if (res.mode === 'radar_index') {
    if (res.url) mapReg.ndviLayer = applyTileLayer(mapReg.map, mapReg.ndviLayer, res.url, 1)
    else if (mapReg.ndviLayer) { mapReg.map.removeLayer(mapReg.ndviLayer); mapReg.ndviLayer = null }
    setStatus('ready', (INDICES[state.currentIndex]?.name || 'RVI') + ' radar layer loaded \u2014 ' + m.label)
    return
  }
  if (res.mode === 'cloud_blocked') {
    if (res.url) mapReg.ndviLayer = applyTileLayer(mapReg.map, mapReg.ndviLayer, res.url, 1)
    else if (mapReg.ndviLayer) { mapReg.map.removeLayer(mapReg.ndviLayer); mapReg.ndviLayer = null }
    const sameMonth = res.lastValidDate ? isSameMonth(res.lastValidDate, m) : true
    state.cloudBlock.main = { month: m.label, cloudPct: res.cloudPct, lastValidDate: res.lastValidDate, sameMonth }
    setStatus('ready', sameMonth ? 'Cloud-blocked ' + m.label + ' \u2014 true-color shown' : 'No capture yet for ' + m.label + ' \u2014 showing ' + res.lastValidDate)
    return
  }
  if (res.mode === 'no_data' || !res.url) {
    if (mapReg.ndviLayer) { mapReg.map.removeLayer(mapReg.ndviLayer); mapReg.ndviLayer = null }
    setStatus('error', 'No cloud-free imagery yet for ' + m.label + ' \u2014 check back later in the month')
    return
  }
  mapReg.ndviLayer = applyTileLayer(mapReg.map, mapReg.ndviLayer, res.url)
  setStatus('ready', (INDICES[state.currentIndex]?.name || 'Index') + ' layer loaded \u2014 ' + m.label)
}
```

Then simplify `loadIndexForMonth`'s own `ee.loadIndexTile(...)` callback to
just call `applyTileResult(res, m)` after its own `endLoading()`/toast
logic (the toast-on-first-cloud-block behavior in `loadIndexForMonth` is
slightly different — it shows a toast — so keep that specific toast call
in `loadIndexForMonth` itself, only extracting the state-setting parts
into the shared function if you want to fully dedupe; a lighter-touch
option is to leave `loadIndexForMonth` untouched and only use
`applyTileResult` for the new bundled path — your call on how much
refactor you want here).

**Requires:** `isSameMonth` and `INDICES` already need to be
imported/available in `store.js` — `isSameMonth` was added in the
no-capture-yet fix; `INDICES` is already imported at the top of the file.

---

## Step 4 — Test

1. Deploy `ee-data`, then reload the app and select a field.
2. In the Network tab, confirm you now see **ONE** `ee-data` request for
   the field-select action (plus the separate compare-mode-right request
   if compare mode is on) instead of ~10.
3. Time it — compare against the old ~10-request burst. Expect roughly
   "one request's worth of latency" instead of the sum/max of ten.
4. Verify all the UI surfaces that used to populate from the separate
   calls still populate correctly from the bundle:
   - Map tile (including radar/cloud-blocked/no-data edge cases — test at
     least one cloud-blocked month to confirm `applyTileResult` behaves
     identically to the old `loadIndexForMonth` path)
   - Dashboard sparkline for this field (`fieldTrends[field.id]`)
   - Trend chart panel
   - Rainfall (21-day) figure
   - AOI benchmark figure
5. Switch bands (NDVI → NDWI → RVI) while a field is selected — this still
   goes through `setIndex()` → `loadChartForGeometry`/`loadIndexForMonth`
   individually (unchanged, not bundled), so confirm those still work too;
   this fix only targets the field-*selection* burst, not every subsequent
   band switch.
6. Switch away from a field and back — confirm `loadFieldTrend`'s existing
   `if (fieldTrends[field.id]) return` skip-if-cached guard still applies
   correctly (the bundle always fetches fresh `ndviTrend`, so re-selecting
   the same field will now always re-fetch it — if you want to preserve
   the old cache-skip behavior, add a check in `loadField` to skip calling
   `getFieldBundle`'s ndvi trend piece when `fieldTrends[field.id]` already
   exists; simplest version: keep calling the bundle but just don't
   overwrite `fieldTrends[field.id]` if already present).

---

## Optional follow-up (not required, worth considering later)

If the very FIRST field-select of a session still feels slow even after
this fix, that's the cold-isolate tax showing up on a single request
instead of ten. A cheap mitigation: ping a lightweight `ee-data` action
(or a dedicated `warmup` action that just calls `ensureEE()` and returns)
right after sign-in, before the user has clicked anything — absorbing the
cold-start cost during a moment the user isn't actively waiting on it.
