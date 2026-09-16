# Fix: No-Capture-Yet Months Skip the RVI/True-Color Fallback

## Bug summary

The auto-fallback chain in `actionGetIndexTile` (ee-data Edge Function) only
tries the Sentinel-1 radar (RVI) fallback when the requested month has
Sentinel-2 scenes that are **too cloudy** (`cloud_blocked`). It does NOT try
radar when the month has **zero Sentinel-2 captures at all yet**
(`no_data`) — which is the common case for the current/latest month right
after it starts (S2 revisits every ~5 days, so day 1 of a new month often
has nothing yet).

Result: on the default "current month" view, users see a flat "No
cloud-free imagery yet — check back later" message instead of a radar or
recent true-color fallback, even though useful imagery exists.

## Fix approach

Stop treating "zero scenes this month" and "scenes exist but too cloudy"
as different code paths. Instead:

1. Try the exact requested month's clean optical scenes first (unchanged).
2. If that's empty for ANY reason, try Sentinel-1 radar (±15 days of the
   month) — same as before, just no longer gated behind "scenes exist but
   are cloudy."
3. If radar also has nothing, widen the OPTICAL search backward up to 90
   days (not bound to the calendar month) and show the least-cloudy scene
   found as true color, flagging how old it is.

This means the UI now needs to distinguish two different reasons a
true-color fallback might appear:
- **Same month, too cloudy** → existing "Cloud-covered" messaging.
- **Different (older) month, no capture yet this month** → new "No
  capture yet — showing most recent available" messaging.

---

## Step 1 — Backend: rewrite `actionGetIndexTile`

File: `ee-data` Edge Function (Deno, Supabase).

Replace the existing `actionGetIndexTile` function with:

```typescript
async function actionGetIndexTile(payload: any) {
  const rawIndex = payload.index;
  const index =
    rawIndex === "rvi" ? "rvi" : rawIndex && BANDS[rawIndex] ? rawIndex : "ndvi";
  const vis = VIS[index];
  const geom = toEeGeometry(payload.geometry);
  const start = ee.Date.fromYMD(payload.year, payload.month, 1);
  const end = start.advance(1, "month");

  if (index === "rvi") {
    const radar = await getRadarVegetationIndex(
      geom, start.advance(-15, "day"), end.advance(15, "day"),
    );
    if (radar.count > 0 && radar.url) {
      return { mode: "radar_index", count: radar.count, url: radar.url, indexUsed: "RVI" };
    }
    return { mode: "no_data", count: 0, url: null };
  }

  // 1. Exact requested month, clean optical scenes — the ideal case.
  const rawCollection = ee
    .ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
    .filterBounds(geom)
    .filterDate(start, end);
  const cleanCollection = rawCollection.filter(
    ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 40),
  );
  const count = await evaluate(cleanCollection.size());
  if (count > 0) {
    const composite = applyIndex(
      cleanCollection.median().clip(geom), index, index.toUpperCase(),
    );
    const url = await getMapUrl(composite, vis);
    return { mode: "index", count, url };
  }

  // 2. No clean scene THIS month (either none captured yet, or all too
  //    cloudy) — try Sentinel-1 radar. It has its own independent revisit
  //    schedule, so it doesn't care whether S2 has anything yet this month.
  try {
    const radar = await getRadarVegetationIndex(
      geom, start.advance(-15, "day"), end.advance(15, "day"),
    );
    if (radar.count > 0 && radar.url) {
      return { mode: "radar_fallback", count: radar.count, url: radar.url, indexUsed: "RVI" };
    }
  } catch (e) {
    console.error("radar fallback failed:", e);
  }

  // 3. No radar either — widen the OPTICAL search backward up to 90 days,
  //    not bound to the calendar month, and show the least-cloudy scene
  //    found in that window as true color. Covers BOTH "current month has
  //    zero captures yet" (early-month case) AND genuine cloud-heavy months
  //    with the same one code path.
  const lookbackStart = start.advance(-90, "day");
  const widenedRaw = ee
    .ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
    .filterBounds(geom)
    .filterDate(lookbackStart, end);
  const widenedCount = await evaluate(widenedRaw.size());
  if (widenedCount === 0) return { mode: "no_data", count: 0, url: null };

  const bestScene = widenedRaw.sort("CLOUDY_PIXEL_PERCENTAGE").first();
  const cloudPct = await evaluate(bestScene.get("CLOUDY_PIXEL_PERCENTAGE"));
  const lastValidDate = tsToISO(
    await evaluate(bestScene.get("system:time_start")),
  );
  let url: string | null = null;
  try {
    url = await getMapUrl(bestScene.clip(geom), {
      bands: TRUE_COLOR_BANDS,
      ...TRUE_COLOR_VIS,
    });
  } catch (e) {
    console.error("cloud-blocked true-color getMap failed:", e);
  }
  return { mode: "cloud_blocked", count: 0, url, cloudPct, lastValidDate };
}
```

### Step 1b — Delete dead code

`getLastValidDate()` is no longer called by anything (its 90-day-lookback
logic is now inlined directly into step 3, since step 3 needs the actual
scene object, not just its date). Delete the function:

```typescript
async function getLastValidDate(
  geom: any,
  monthStart: any,
): Promise<string | null> {
  // ... entire function ...
}
```

Double-check nothing else in the file calls `getLastValidDate` before
deleting (search the file for the name).

### Step 1c — Deploy

```bash
supabase functions deploy ee-data
```

---

## Step 2 — Frontend: `src/store.js`

### 2a — Add a small date-comparison helper

Add near `toISODate` (or any other date utility already in the file):

```js
function isSameMonth(dateStr, m) {
  const d = new Date(dateStr)
  return d.getFullYear() === m.year && d.getMonth() + 1 === m.month
}
```

### 2b — Update the `cloud_blocked` branch in `loadIndexForMonth`

Replace the existing `if (res.mode === 'cloud_blocked') { ... }` block
inside `loadIndexForMonth` with:

```js
if (res.mode === 'cloud_blocked') {
  endLoading()
  if (res.url) mapReg.ndviLayer = applyTileLayer(mapReg.map, mapReg.ndviLayer, res.url, 1)
  else if (mapReg.ndviLayer) { mapReg.map.removeLayer(mapReg.ndviLayer); mapReg.ndviLayer = null }

  // Distinguish "this month IS cloudy" from "this month has no capture yet,
  // showing an older clear one" — same res.mode, different real reason.
  const sameMonth = res.lastValidDate
    ? isSameMonth(res.lastValidDate, m)
    : true // no date at all — treat as the original cloudy case
  state.cloudBlock.main = {
    month: m.label,
    cloudPct: res.cloudPct,
    lastValidDate: res.lastValidDate,
    sameMonth,
  }
  if (!silent && !cloudToastShown) {
    cloudToastShown = true
    if (sameMonth) {
      const pctText = res.cloudPct != null ? Math.round(res.cloudPct) + '%' : 'high'
      const lastText = res.lastValidDate
        ? 'Last valid reading: ' + res.lastValidDate
        : 'No cloud-free imagery available in the last 90 days.'
      showToast('\u2601\uFE0F Cloud-covered on ' + m.label + ' (' + pctText + ' cloud) \u2014 showing true-color image. NDVI can\u2019t be reliably calculated. ' + lastText, 4000)
    } else {
      showToast('\ud83d\udcf7 No capture yet for ' + m.label + ' \u2014 showing the most recent available image (' + res.lastValidDate + ')', 4000)
    }
  }
  setStatus('ready', sameMonth
    ? 'Cloud-blocked ' + m.label + ' \u2014 true-color shown'
    : 'No capture yet for ' + m.label + ' \u2014 showing ' + res.lastValidDate)
  return
}
```

### 2c — Apply the same change to `loadIndexForMonthRight`

`loadIndexForMonthRight` has its own separate `cloud_blocked` branch (for
the right/compare-mode map). Apply the equivalent logic there — same
`sameMonth` check, writing to `state.cloudBlock.right` instead of
`state.cloudBlock.main`, and to `mapReg.ndviLayerRight`/`mapReg.mapRight`.
It currently has no toast text change needed unless you also want a
distinct message for the compare pane — mirror step 2b if so.

### 2d — Update the confidence badge in `viewConfidence`

Find this block inside `viewConfidence(side)`:

```js
if (state.cloudBlock.main) {
  return { tier: 'low', reason: confReason(lang, 'cloudBlocked') }
}
```

Replace with:

```js
if (state.cloudBlock.main) {
  return state.cloudBlock.main.sameMonth
    ? { tier: 'low', reason: confReason(lang, 'cloudBlocked') }
    : { tier: 'low', reason: confReason(lang, 'noRecentCapture') }
}
```

There is a second, near-identical `cloudBlocked` check further down in the
same function for the `side !== 'main'` path (the one using
`state.cloudBlock[side]` directly via `getConfidenceTier`). Leave that one
as-is for now unless you also thread `sameMonth` through
`getConfidenceTier`'s signature — that's a larger change and optional.

---

## Step 3 — Add the missing translation key

`confReason(lang, 'noRecentCapture')` needs a new entry wherever
`confReason`'s translation map lives (likely `src/services/format.js`,
alongside the existing `cloudBlocked`, `noData`, `stale`, `fewScenes`,
`estimatedDate` keys used elsewhere in `store.js`).

1. Open `src/services/format.js` and find the `confReason` function /
   translation object.
2. Add a `noRecentCapture` key with both `en` and `km` text, matching the
   style of the existing keys. Suggested wording (adjust to match the
   file's tone/format):
   - en: `"No new capture yet — showing the most recent available image"`
   - km: (translate to match the existing Khmer phrasing style used for
     `cloudBlocked` in the same file)

---

## Step 4 — Test

1. Deploy the backend (`supabase functions deploy ee-data`) before testing
   frontend changes — the frontend logic depends on the new
   `lastValidDate`/`cloud_blocked` semantics.
2. **Early-month case:** load the app on day 1-3 of a new month, on a field
   with no current-month S2 capture yet. Confirm:
   - Map shows either an RVI radar tile (if S1 has coverage) or a true-color
     image from a previous month — never the old flat "no scenes" message.
   - If true-color fallback fires, toast reads "No capture yet for
     [month] — showing the most recent available image (...)", NOT
     "Cloud-covered."
   - Confidence badge reads the new `noRecentCapture` text, not
     "Cloud-blocked."
3. **Genuine cloud-blocked case:** pick a month known to have S2 scenes but
   heavy cloud cover (e.g. peak wet season). Confirm the ORIGINAL
   "Cloud-covered on [month] (X% cloud)" toast and "Cloud-blocked" badge
   still appear — this path must be unchanged.
4. **True no-data case:** pick a field/month with genuinely nothing in the
   last 90 days (new field, remote area). Confirm it still falls through to
   `mode: 'no_data'` and the original "No cloud-free imagery" message.
5. Repeat the early-month and cloud-blocked checks in Compare mode (right
   panel) to confirm `loadIndexForMonthRight` behaves the same way.
6. Confirm direct RVI tab selection (`radar_index` mode) is unaffected —
   it's a separate branch, untouched by this fix.
