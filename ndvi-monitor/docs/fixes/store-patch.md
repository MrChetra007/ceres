# store.js patch — stop discarding sceneDate for cloud-blocked observations

## 1. In `loadIndexForMonth(idx, geometry, silent)`

### Replace this block:

```js
  // Pass the pinned observation date (if any) so the NDVI/index tile renders
  // that exact scene rather than the month's clearest-date composite.
  // For optical index views, if the selected scene is >= 40% cloud (blocked),
  // pass null so Earth Engine falls through to the clean composite / cloud fallback.
  let sceneDate = state.selectedObservationDate
  if (sceneDate && state.currentIndex !== 'truecolor') {
    const obs = Array.isArray(state.observations) ? state.observations.find((o) => o.date === sceneDate) : null
    if (obs && (obs.status === 'blocked' || (obs.cloudCover != null && obs.cloudCover >= 40))) {
      sceneDate = null
    }
  }
```

### With:

```js
  // Pass the pinned observation date (if any) so the NDVI/index tile renders
  // that exact scene rather than the month's clearest-date composite. This is
  // NEVER nulled out for a cloud-blocked date anymore: the backend's per-scene
  // branch (ee-data actionGetIndexTile step 0) now handles that case itself —
  // clean optical for that exact date, else Sentinel-1 RVI centered on that
  // date, else an honest "no data for this scene". Nulling it here used to
  // pre-empt that logic and silently show the month composite instead, which
  // is the bug we're fixing.
  const sceneDate = state.currentIndex !== 'truecolor' ? state.selectedObservationDate : null
```

## 2. In the `ee.loadIndexTile(...)` callback inside `loadIndexForMonth`, add two
new mode branches (place them next to the existing `radar_fallback` /
`radar_index` / `cloud_blocked` branches, before the `no_data` check):

```js
    // Per-scene radar fallback: the clicked date had no clean optical scene,
    // so the backend rendered Sentinel-1 RVI centered on THAT exact date
    // (not the month). Distinct from 'radar_fallback' (month-level auto
    // fallback) so the UI can say "this specific date" rather than "this month".
    if (res.mode === 'radar_scene_fallback') {
      endLoading()
      if (res.url) mapReg.ndviLayer = applyTileLayer(mapReg.map, mapReg.ndviLayer, res.url, 1)
      else if (mapReg.ndviLayer) { mapReg.map.removeLayer(mapReg.ndviLayer); mapReg.ndviLayer = null }
      const sceneLabel = res.sceneDate
        ? new Date(res.sceneDate + 'T00:00:00').toLocaleDateString(state.preferredLanguage === 'km' ? 'km-KH' : 'en', { month: 'short', day: 'numeric', year: 'numeric' })
        : m.label
      state.radarFallback.main = { month: m.label, indexUsed: res.indexUsed || 'RVI', sceneDate: res.sceneDate, cloudPct: res.cloudPct }
      const pctText = res.cloudPct != null ? Math.round(res.cloudPct) + '% cloud' : 'cloud-covered'
      setStatus('ready', sceneLabel + ' \u2014 ' + pctText + ', showing Sentinel-1 radar (RVI)')
      return
    }
    // The clicked date has neither a clean optical scene nor any Sentinel-1
    // pass nearby — be honest instead of silently showing a different date.
    if (res.mode === 'no_data_for_scene') {
      endLoading()
      if (mapReg.ndviLayer) { mapReg.map.removeLayer(mapReg.ndviLayer); mapReg.ndviLayer = null }
      const sceneLabel = res.sceneDate
        ? new Date(res.sceneDate + 'T00:00:00').toLocaleDateString(state.preferredLanguage === 'km' ? 'km-KH' : 'en', { month: 'short', day: 'numeric', year: 'numeric' })
        : m.label
      setStatus('error', 'No imagery (optical or radar) available for ' + sceneLabel)
      return
    }
```

## 3. Same two branches should be mirrored in `loadIndexForMonthRight` (compare
view) and in `applyTileResult` (the `getFieldBundle` tile handler used by
`loadField`), for consistency — they currently share the same mode list
(`error` / `radar_fallback` / `radar_index` / `cloud_blocked` / `no_data`) and
will silently fall through to the generic "apply the tile if there's a URL,
else remove the layer" path otherwise, which happens to work but won't show
the right status text/badge.

## 4. jumpToObservationDate — no change needed

`jumpToObservationDate` already sets `state.selectedObservationDate = dateStr`
before calling `loadIndexForMonth`, so once (1) stops nulling it out, the date
flows straight through to `ee.loadIndexTile(..., sceneDate)` correctly. This
function itself was NOT the bug.
