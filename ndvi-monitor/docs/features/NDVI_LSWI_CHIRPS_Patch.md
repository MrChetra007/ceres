# NDVI Rice Crop Health Monitor — LSWI + CHIRPS Rainfall Patch

### Adding a water-sensitive index and rainfall context to existing stress alerts

---

## 0. What this adds, and why these two together

Two small, independent additions that reinforce each other:

- **LSWI** (Land Surface Water Index) — a third index alongside your existing NDVI/NDWI
  toggle, more sensitive to water/moisture in the canopy and soil than NDWI, and
  specifically useful for catching **transplanting and flooding events** in rice —
  both very relevant to your Battambang / Tonle Sap context.
- **CHIRPS rainfall** — pulls in actual rainfall data so a stress alert can say
  *"NDVI dropped, and there's been no rain for 18 days"* instead of just a red badge
  with no explanation.

Both are the same mechanical pattern you already use for NDVI/NDWI and the flood/dry-spell
event markers — another `ee.ImageCollection`, filtered by date + geometry, reduced to a
number or a tile. No new libraries, no backend change.

**Honesty note, same spirit as the growth-stage patch:** rainfall correlating with an NDVI
dip is a hint, not a diagnosis. Low rain + low NDVI could mean drought stress, or could be
coincidence, or could be a normal post-harvest dry field. Phrase this as context for the
person to consider, not as a causal claim.

---

## 1. LSWI — third index alongside NDVI/NDWI

### 1.1 The formula

```js
// LSWI = (NIR - SWIR) / (NIR + SWIR)
// Sentinel-2: B8 = NIR, B11 = SWIR (20m native, but Earth Engine resamples automatically
// when you call normalizedDifference across mixed-resolution bands)
function computeLswi(image) {
  return image.normalizedDifference(['B8', 'B11']).rename('LSWI');
}
```

> **Explain to your AI:** this is the exact same `normalizedDifference()` pattern you
> already use for NDVI (`B8`/`B4`) and NDWI (`B3`/`B8`) — just a different band pair.
> LSWI values run roughly -1 to 1; flooded/recently-transplanted paddies read noticeably
> higher than dry bare soil, which is what makes it good at catching transplanting dates.

### 1.2 Slot it into your existing index toggle

Wherever your NDVI/NDWI toggle currently branches (Phase 7.4 in PROCESS.md — "Toggle
button in slider panel switches between NDVI and NDWI"), add a third state:

```js
const INDEX_CONFIG = {
  NDVI: { bands: ['B8', 'B4'], palette: ['red', 'yellow', 'green'], min: -0.2, max: 0.8 },
  NDWI: { bands: ['B3', 'B8'], palette: ['brown', 'white', 'blue'], min: -0.5, max: 0.5 },
  LSWI: { bands: ['B8', 'B11'], palette: ['tan', 'lightblue', 'darkblue'], min: -0.3, max: 0.6 },
};

function getIndexTileForMonth(year, month, indexName) {
  const cfg = INDEX_CONFIG[indexName];
  const start = ee.Date.fromYMD(year, month, 1);
  const end = start.advance(1, 'month');
  const img = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(battambang)
    .filterDate(start, end)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
    .median()
    .normalizedDifference(cfg.bands)
    .rename(indexName);
  return img; // caller calls .getMap({min: cfg.min, max: cfg.max, palette: cfg.palette}, ...)
}
```

If your current toggle is a two-state button, switch it to a 3-way segmented control
(NDVI / NDWI / LSWI) rather than adding a second button — keeps the UI pattern consistent
with what's already there.

### 1.3 Dashboard status for LSWI (optional, only if useful)

Your dashboard already computes per-field status differently per active index
("Healthy/Moderate/Stressed for NDVI; Water/Moist/Dry for NDWI" per PROCESS.md). LSWI is
mainly useful as a **visual layer** and a **transplanting/flood detector**, less as a
per-field health badge — I'd skip adding a third badge vocabulary unless you find a
concrete use for it. Simpler is better here.

**Checkpoint:** ✅ Toggling to LSWI shows a distinct water/moisture-sensitive overlay,
using the same tile-swap mechanism as your NDVI/NDWI toggle.

---

## 2. CHIRPS rainfall — context for stress alerts

### 2.1 Pull rainfall total for a field over a trailing window

```js
function getRainfallMm(geometry, daysBack = 21) {
  const end = ee.Date(Date.now());
  const start = end.advance(-daysBack, 'day');

  const rainfall = ee.ImageCollection('UCSB-CHG/CHIRPS/DAILY')
    .filterDate(start, end)
    .filterBounds(geometry)
    .sum(); // CHIRPS band is 'precipitation', daily mm — sum gives total mm over the window

  return rainfall.reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry,
    scale: 5000, // CHIRPS native resolution is ~5.5km, no point requesting finer
    maxPixels: 1e9,
  });
}
```

> **Explain to your AI:** CHIRPS is daily, ~5km resolution, going back to 1981 — much
> coarser than Sentinel-2's 10m, so don't expect field-level precision. It's meant to
> answer "was it dry in this general area," not "did rain fall on this specific paddy."

### 2.2 Attach rainfall context to the existing stress alert

Your Phase 5 stress alert (`getNdviTimeSeriesAtPoint` — compares recent NDVI to 14+ days
earlier, flags >15% drop) is the natural place to add this. When a drop fires, also pull
rainfall for the same window and append it to the alert text:

```js
function buildStressAlertText(ndviDropPct, geometry, daysBack = 14) {
  let text = `⚠ Possible stress detected (NDVI down ${ndviDropPct.toFixed(0)}% over ${daysBack} days)`;

  getRainfallMm(geometry, daysBack).get('precipitation').evaluate((mm) => {
    if (mm == null) return;
    const rainNote = mm < 10
      ? ` — only ${mm.toFixed(0)}mm rain in that period, drought stress is plausible`
      : ` — ${mm.toFixed(0)}mm rain in that period, so low rainfall likely isn't the cause`;
    updateAlertElement(text + rainNote);
  });

  return text; // shown immediately, rainNote appended once evaluate() resolves
}
```

Same pattern applies to `buildStatusText()` from the growth-stage patch — you could append
a rainfall note there too, but I'd start with just the point-click stress alert since
that's already the "something's wrong, tell me more" moment in your UI.

### 2.3 Optional: rainfall band on the time slider

You already render flood/dry-spell markers as colored bands below the slider track
(Phase 7.1). CHIRPS lets you generate that band **automatically** instead of hand-placing
event markers — e.g., shade any month where total rainfall falls below some threshold as
"dry," rather than manually marking Jan–Mar 2026. This is a nice-to-have, not required for
the core feature — your existing hand-placed markers already work and are more precise for
known events (an actual flood vs. a merely-dry month aren't the same thing).

**Checkpoint:** ✅ Clicking a field with a recent NDVI drop shows the stress alert plus a
rainfall figure for the same window, phrased as context rather than a diagnosis.

---

## 3. Suggested build order

1. LSWI band math + slot into the existing NDVI/NDWI toggle (Section 1) — self-contained,
   no dependency on Section 2
2. CHIRPS rainfall query function (Section 2.1) — test it standalone in the Earth Engine
   Code Editor first, same as you did for NDVI in Phase 1
3. Wire rainfall into the point-click stress alert (Section 2.2)
4. (Optional) auto-generated dry-month band on the slider (Section 2.3)

---

## 4. What this sets up for later

- LSWI's transplanting-detection ability could eventually **auto-suggest a planting date**
  when a field is first drawn (look for the LSWI spike that marks flooding/transplanting),
  instead of relying on the user typing one in — a nice follow-up to the growth-stage patch,
  not needed now
- Rainfall + NDVI together is the natural first step toward the "drought/flood risk
  assessment" idea from the recommendations doc — but that's a scoped feature of its own,
  not something this patch tries to fully solve
