# NDVI Rice Crop Health Monitor — Full Build Roadmap

### Satellite-based crop stress detection for Battambang, Cambodia — Tech Show Demo

---

## 0. What we're building (recap)

A single-page web app, **no login/accounts**, that shows a live satellite map of rice-growing
areas in Battambang. The map is colored by **NDVI** (a measure of plant health computed from
satellite imagery). A visitor can:

1. See the map with a green→red health overlay
2. Drag a time slider to watch vegetation health change over a season
3. Click any spot to see a mini trend chart + a plain-language stress alert

**Backend = Google Earth Engine.** No Supabase, no database, no server you host. Earth Engine
does the satellite math on Google's machines; your app just asks for images and displays them.

---

## Phase 1 — Foundations (get one NDVI image on a map)

**Goal:** prove the core concept works before building any app around it.

### 1.1 Explore in the Earth Engine Code Editor first

Go to `code.earthengine.google.com` (you already have access). This is a browser-based
scratchpad — write a script, see the result on a map instantly. Do this _before_ touching
your own app.

```javascript
// Explain to your AI assistant: this is Earth Engine's own scripting
// language (a JS dialect that runs on Google's servers, not in your browser).

// 1. Define the area of interest — a bounding box around Battambang rice paddies
var battambang = ee.Geometry.Rectangle([103.1, 12.95, 103.25, 13.05]);

// 2. Load Sentinel-2 satellite images, filtered to recent + low cloud cover
var s2 = ee
  .ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
  .filterBounds(battambang)
  .filterDate("2026-06-01", "2026-07-01")
  .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 20))
  .median(); // combine into one cloud-free-ish composite image

// 3. Compute NDVI = (NIR - Red) / (NIR + Red)
//    B8 = near-infrared band, B4 = red band, on Sentinel-2
var ndvi = s2.normalizedDifference(["B8", "B4"]).rename("NDVI");

// 4. Style it: red (unhealthy) -> yellow -> green (healthy)
var ndviVis = { min: -0.2, max: 0.8, palette: ["red", "yellow", "green"] };

Map.centerObject(battambang, 11);
Map.addLayer(ndvi, ndviVis, "NDVI");
```

**What to check:** does the map show green over rice paddy areas and red/brown over roads,
water, or bare land? If yes — the concept works. If the whole area looks one color, adjust
the date range (rice may be freshly planted / just harvested) or the min/max in `ndviVis`.

> **Explain to your AI:** NDVI values range from -1 to 1. Water is usually negative,
> bare soil near 0, healthy dense vegetation 0.6–0.9. We clip the display range to
> -0.2 to 0.8 just so the color gradient looks good, not because those are the only
> possible values.

### 1.2 Get real Battambang rice paddy coordinates

Don't guess the bounding box — use Google Maps to find 2–3 real rice paddy areas near
Svay Cheat / Battambang, note their lat/lng, and adjust the rectangle above to match.

### 1.3 Register a Cloud Project for your app (separate from Code Editor scratch use)

You already registered for Earth Engine access. Now, in Google Cloud Console, confirm you
have a **Cloud Project ID** — you'll need this string later to initialize Earth Engine from
your own app (`ee.initialize()` requires a project ID, not just your Google account).

**Checkpoint:** ✅ You've seen real NDVI colors over real Battambang rice fields inside the
Earth Engine Code Editor. Do not move to Phase 2 until this works.

---

## Phase 2 — Scaffold the app

**Goal:** a blank Vue app that can talk to Earth Engine and show _something_ on a map.

### 2.1 Project setup

```bash
npm create vite@latest ndvi-monitor -- --template vue
cd ndvi-monitor
npm install
npm install leaflet
```

> **Explain to your AI:** we're using Leaflet, not Mapbox — Leaflet is free, open-source,
> and simpler for a demo like this. No API key needed for the base map tiles (we'll use
> OpenStreetMap as the base layer, with Earth Engine's NDVI layer drawn on top).

### 2.2 Earth Engine authentication for a web app

This is the part that's different from the Code Editor (which auto-authenticates you).
For a real app, Earth Engine needs a way to verify requests. Two options:

- **Option A — Client-side OAuth popup** (`ee.data.authenticateViaPopup()`): simplest for
  a demo, visitor doesn't need to log in — _you_ authenticate once as the developer, and the
  demo runs under your account/quota. Good enough for a booth demo where you control the laptop.
- **Option B — Server-side service account**: more "production," requires a small backend
  to hold credentials securely. **Skip this for the demo** — Option A is the right call
  given no accounts/backend in our design.

```javascript
// main.js — simplified concept, actual Earth Engine JS client setup
import ee from "@google/earthengine"; // via script tag, see EE JS API docs

ee.data.authenticateViaPopup(
  () => {
    ee.initialize(null, null, () => console.log("EE ready"));
  },
  (err) => console.error("Auth failed", err),
);
```

> **Explain to your AI:** Earth Engine's JS client isn't a typical npm package you
> `import` — Google distributes it as a script you load via `<script>` tag pointing to
> their CDN, or via their newer ESM module. Check the current Earth Engine JavaScript
> Setup guide at the time of building, since this detail can change.

### 2.3 Basic Leaflet map, no NDVI yet

Get a plain Leaflet map centered on Battambang rendering in your Vue component first —
confirms your frontend setup is solid before adding satellite complexity on top.

**Checkpoint:** ✅ Blank map of Battambang loads in your Vue app. Earth Engine auth succeeds
(check browser console for "EE ready").

---

## Phase 3 — Render the NDVI layer in your app

**Goal:** the same NDVI visualization from Phase 1, now inside your own Leaflet map instead
of the Code Editor.

### 3.1 Get a tile URL from Earth Engine

```javascript
// Same NDVI computation as before, but instead of Map.addLayer (Code Editor only),
// we request a tile URL template we can hand to Leaflet.

var ndvi = /* ...same as Phase 1... */;
var ndviVis = {min: -0.2, max: 0.8, palette: ['red', 'yellow', 'green']};

ndvi.getMap(ndviVis, function(mapInfo) {
  console.log(mapInfo.urlFormat); // a tile URL template, e.g. https://earthengine.../{z}/{x}/{y}
});
```

> **Explain to your AI:** `getMap()` asks Earth Engine's servers to pre-render this
> computation as map tiles (like Google Maps tiles) and gives back a URL pattern.
> This is the bridge between "Earth Engine computation" and "normal web map library" —
> Leaflet doesn't know anything about satellites, it just knows how to display tile URLs.

### 3.2 Add it to Leaflet as a tile layer

```javascript
L.tileLayer(ndviTileUrl, {
  attribution: "Sentinel-2 / Google Earth Engine",
}).addTo(map);
```

**Checkpoint:** ✅ Your own Vue+Leaflet app shows the same green/red NDVI overlay over
Battambang that you saw in the Code Editor.

---

## Phase 4 — Time slider (the "wow" feature)

**Goal:** drag a slider, watch NDVI update for different months.

### 4.1 Structure: one NDVI computation per month

Instead of one fixed date range, wrap the Phase 3 computation in a function that takes a
month and returns a tile URL:

```javascript
function getNdviTileForMonth(year, month) {
  var start = ee.Date.fromYMD(year, month, 1);
  var end = start.advance(1, "month");
  var img = ee
    .ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
    .filterBounds(battambang)
    .filterDate(start, end)
    .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 20))
    .median()
    .normalizedDifference(["B8", "B4"])
    .rename("NDVI");
  return img; // caller then calls .getMap() on this
}
```

### 4.2 Vue side: slider component

- A `<input type="range">` bound to a `selectedMonth` value in Vue state.
- On change, call `getNdviTileForMonth()`, get the new tile URL, and **swap the Leaflet
  tile layer** (remove old layer, add new one — or use `setUrl()` if supported for the
  layer type).
- Add a small loading spinner while Earth Engine computes the new tile — this can take
  1–3 seconds, which is normal.

> **Explain to your AI:** don't call Earth Engine on every pixel of slider drag —
> debounce the slider (e.g., only fire the request 300ms after the user stops dragging)
> so you're not spamming requests while they scrub through months.

**Checkpoint:** ✅ Dragging the slider visibly changes the map colors month to month —
this is your headline demo moment.

---

## Phase 5 — Click-to-inspect + trend chart

**Goal:** click any point on the map, see its NDVI history as a small chart.

### 5.1 Get a click coordinate

```javascript
map.on("click", function (e) {
  var { lat, lng } = e.latlng;
  // send this to your Earth Engine query function
});
```

### 5.2 Query NDVI time series for that single point

```javascript
function getNdviTimeSeriesAtPoint(lat, lng) {
  var point = ee.Geometry.Point([lng, lat]);
  var collection = ee
    .ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
    .filterBounds(point)
    .filterDate("2025-08-01", "2026-07-01")
    .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 20))
    .map(function (img) {
      var ndvi = img.normalizedDifference(["B8", "B4"]).rename("NDVI");
      var value = ndvi.reduceRegion({
        reducer: ee.Reducer.mean(),
        geometry: point,
        scale: 10,
      });
      return ee.Feature(null, {
        date: img.date().format("YYYY-MM-dd"),
        ndvi: value.get("NDVI"),
      });
    });

  // Convert to a plain list your app can read (via .evaluate() callback)
  collection.aggregate_array("ndvi").evaluate(function (values) {
    /* use in Vue */
  });
}
```

> **Explain to your AI:** `.evaluate()` is how you pull a result _out_ of Earth Engine's
> server-side computation back into normal JavaScript you can use in Vue. Everything
> before `.evaluate()` is just building up a description of a computation — nothing
> actually runs on Google's servers until you call `.evaluate()` (or `.getMap()`,
> or similar "trigger" functions).

### 5.3 Display it

- Small popup or side panel showing a line chart (Chart.js) of NDVI over the last 6–12
  months for that exact point.
- Compute a simple change badge: compare the most recent value to 2 weeks prior —
  if it dropped more than some threshold (e.g., 10–15%), show a "⚠ Possible stress
  detected" label. This is a simple rule, not a model — be upfront about that if asked.

**Checkpoint:** ✅ Clicking a field shows its own mini health history, not just a static color.

---

## Phase 6 — Polish for the tech show

These aren't "extra," they're what makes a demo land with an audience:

- **Preset "interesting" locations** — 2–3 bookmarked spots you know show a clear NDVI
  story (e.g., one healthy field, one that dipped during a dry spell). Add clickable
  buttons that fly the map to these, so you're not hunting for a good example live.
- **Loading states everywhere** — Earth Engine calls take a second or two; a blank map
  or frozen slider looks broken to a booth visitor. Always show a spinner/skeleton.
- **A one-paragraph "How this works" panel** — non-technical visitors will ask; have a
  simple explanation on-screen (satellite passes overhead every few days → measures how
  much light plants reflect → healthy plants reflect more near-infrared light → we turn
  that into a color map).
- **Offline fallback (optional but recommended)** — booth wifi is often bad. Consider
  pre-fetching and caching a few months of tiles/images locally as a backup in case
  live Earth Engine calls are slow or fail during the actual demo.
- **Mobile/tablet check** — if people will interact with it themselves on a tablet at
  your booth, test touch interactions (pinch zoom, tap instead of click) explicitly.

---

## Phase 7 — Stretch goals (only if time allows, you said no time pressure so these are fair game)

- **Event overlay**: mark a known drought/flood week on the time slider timeline so
  users visually connect an NDVI dip to a real event.
- **Compare two dates side-by-side** (split-screen map) instead of one slider.
- **Export a "report"**: click a field → generate a simple PDF/image summary of its
  NDVI trend — nice leave-behind for interested visitors (ag co-ops, NGOs).
- **Multiple index support**: NDWI (water index) alongside NDVI, useful for flood context
  given Battambang's proximity to Tonle Sap flood dynamics.

---

## Tech stack summary

| Layer               | Tool                                             | Why                                                                     |
| ------------------- | ------------------------------------------------ | ----------------------------------------------------------------------- |
| Compute / "backend" | Google Earth Engine (JS client)                  | Free (Community tier), no server to host, does the heavy satellite math |
| Frontend framework  | Vue 3 + Vite                                     | Matches your existing stack/comfort                                     |
| Map                 | Leaflet                                          | Free, no API key, simple tile layer support                             |
| Styling             | Tailwind CSS                                     | Matches your existing stack                                             |
| Charts              | Chart.js                                         | Lightweight, easy line charts for NDVI trends                           |
| Auth                | Earth Engine OAuth popup (developer-only)        | No visitor login needed — you authenticate once as the app owner        |
| Hosting             | Static hosting (Vercel/Netlify/Cloudflare Pages) | It's a static frontend calling Earth Engine directly — no server needed |

---

## Known risks to plan around

1. **Cloud cover** — Cambodia's rainy season means many Sentinel-2 images are cloudy.
   The `.median()` composite over a month helps, but some months may still look patchy.
   Have a fallback date range picked in advance that you've verified looks clean.
2. **Quota** — Community tier gives 150 EECU-hours/month. A live demo with lots of
   clicking/scrubbing is unlikely to hit this, but don't leave the app open
   auto-refreshing overnight before the show.
3. **Booth wifi** — see Phase 6's offline fallback note. This is the single biggest
   real-world risk to a live demo, more than any code issue.
4. **NDVI ≠ diagnosis** — be ready to explain to visitors (especially any ag experts)
   that a stress signal tells you _something_ changed, not _what_ caused it
   (drought vs. disease vs. pest vs. poor soil all can lower NDVI similarly).

---

## Suggested build order (recap)

1. Prove NDVI works in the Earth Engine Code Editor over real Battambang coordinates
2. Scaffold Vue + Leaflet + Earth Engine auth, blank map only
3. Render one static NDVI tile layer in your own app
4. Add the month time slider
5. Add click-to-inspect + trend chart
6. Polish: presets, loading states, explanation panel, offline fallback
7. (Optional) stretch features if time allows
