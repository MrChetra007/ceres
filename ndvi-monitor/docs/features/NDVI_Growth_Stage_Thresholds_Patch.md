# NDVI Rice Crop Health Monitor — Growth-Stage-Aware Thresholds Patch

### Fixing the biggest accuracy gap: fixed NDVI thresholds don't know rice growth stages

---

## 0. The problem this fixes

Right now, health status is a flat rule:

```js
const label = value > 0.6 ? '🟢 Healthy' : value > 0.3 ? '🟡 Moderate' : '🔴 Stressed';
```

This is wrong for a lot of the season. Freshly transplanted rice has low NDVI because
there's mostly water and mud visible between small seedlings — that's **normal**, not
stress. The same NDVI value at flowering stage, when the canopy should be dense and
green, **is** a real problem. A flat threshold can't tell these apart — it'll cry wolf
early in the season and may miss real stress later.

**The fix:** add a planting date per field, derive the expected growth stage from days-
since-planting, and compare actual NDVI against an expected range *for that stage* —
not one number for the whole season.

**Important honesty note for your defense/demo:** the stage-NDVI curve below is a
reasonable approximation built from general published rice phenology patterns, not a
field-validated model calibrated to Battambang soils/varieties specifically. Say so if
asked — it's a meaningfully better heuristic than a flat threshold, not a scientific
instrument.

---

## 1. Add a planting date to each field

Update `promptSaveField()` (Product Pivot roadmap, Feature A.2) to ask for a planting
date alongside the name:

```js
function promptSaveField(geojson) {
  const name = prompt('Name this field (e.g. "North paddy — Svay Cheat"):');
  if (!name) return;

  const plantingDateStr = prompt('Planting/transplanting date (YYYY-MM-DD), or leave blank if unknown:');
  const plantingDate = plantingDateStr && !isNaN(Date.parse(plantingDateStr)) ? plantingDateStr : null;

  const areaHectares = getFieldAreaHectares(geojson);

  const fields = JSON.parse(localStorage.getItem('ndvi_fields') || '[]');
  fields.push({
    id: crypto.randomUUID(),
    name,
    geojson,
    areaHectares,
    plantingDate, // null = unknown, falls back to flat thresholds (Section 4)
    createdAt: new Date().toISOString(),
  });
  localStorage.setItem('ndvi_fields', JSON.stringify(fields));
  renderFieldList();
}
```

> **Explain to your AI:** a plain `prompt()` for a date is rough UX — a real `<input type="date">`
> in a small modal (matching whatever save-field UI you build later) is a nicer version of the
> same idea. The important part is just capturing one ISO date string per field.

If you want to let people **edit** the planting date on an already-saved field (likely,
since people forget or estimate wrong), add a small "✎" edit affordance on the field card
that re-prompts and updates `field.plantingDate` in place.

---

## 2. The growth-stage curve

A rough, commonly-cited rice phenology curve, expressed as days-since-planting → stage
name → expected NDVI range. Store this as a lookup table, not a formula — easy to tweak
later once you have real Battambang data to compare against:

```js
// Days since planting -> { stage, min, max } expected NDVI range.
// Approximation based on general rice phenology, not field-calibrated.
const RICE_GROWTH_STAGES = [
  { maxDay: 10,  stage: 'Transplanting / Establishment', min: -0.1, max: 0.3 },
  { maxDay: 30,  stage: 'Tillering',                       min: 0.3,  max: 0.55 },
  { maxDay: 55,  stage: 'Stem Elongation / Booting',       min: 0.5,  max: 0.75 },
  { maxDay: 75,  stage: 'Flowering / Heading',              min: 0.6,  max: 0.85 },
  { maxDay: 100, stage: 'Grain Filling / Maturity',         min: 0.4,  max: 0.7 },
  { maxDay: 130, stage: 'Harvest / Senescence',             min: -0.1, max: 0.4 },
];

function getGrowthStage(daysSincePlanting) {
  for (const stage of RICE_GROWTH_STAGES) {
    if (daysSincePlanting <= stage.maxDay) return stage;
  }
  return RICE_GROWTH_STAGES[RICE_GROWTH_STAGES.length - 1]; // past 130 days, treat as post-harvest
}
```

> **Explain to your AI:** these day/NDVI numbers are intentionally roundable and easy to
> edit — if you later get feedback from an actual agronomist or find published Cambodia-
> specific rice NDVI data, this is the one table to update, nothing else in the app needs
> to change.

---

## 3. Updated status logic: actual vs. expected for that stage

Replace the flat comparison in `updateFieldStatus()` (Product Pivot roadmap, Feature B.2)
with a stage-aware version:

```js
function updateFieldStatus(field) {
  const coords = field.geojson.geometry.coordinates;
  const geometry = ee.Geometry.Polygon(coords);

  const recent = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(geometry)
    .filterDate(ee.Date(Date.now()).advance(-1, 'month'), ee.Date(Date.now()))
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
    .median()
    .normalizedDifference(['B8', 'B4']);

  const meanNdvi = recent.reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry,
    scale: 10,
    maxPixels: 1e9,
  });

  meanNdvi.get('nd').evaluate((value) => {
    const el = document.getElementById(`status-${field.id}`);
    if (value == null) { el.textContent = 'No recent clear imagery'; return; }

    el.textContent = buildStatusText(field, value);
  });
}

function buildStatusText(field, ndviValue) {
  if (!field.plantingDate) {
    // No planting date known — fall back to the original flat thresholds
    const label = ndviValue > 0.6 ? '🟢 Healthy' : ndviValue > 0.3 ? '🟡 Moderate' : '🔴 Stressed';
    return `${label} (NDVI ${ndviValue.toFixed(2)})`;
  }

  const daysSincePlanting = Math.floor(
    (Date.now() - new Date(field.plantingDate).getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysSincePlanting < 0) {
    return `Planting date is in the future — check the date`;
  }

  const { stage, min, max } = getGrowthStage(daysSincePlanting);

  let label;
  if (ndviValue >= min && ndviValue <= max) {
    label = '🟢 Healthy';
  } else if (ndviValue < min) {
    // Below expected range: how far below matters
    const deficit = min - ndviValue;
    label = deficit > 0.15 ? '🔴 Stressed' : '🟡 Below expected';
  } else {
    // Above expected max range is rare and usually harmless (e.g. weeds, mixed vegetation)
    label = '🟢 Healthy';
  }

  return `${label} — ${stage}, Day ${daysSincePlanting} (NDVI ${ndviValue.toFixed(2)})`;
}
```

**Checkpoint:** ✅ A field with a planting date shows something like
`🟡 Below expected — Tillering, Day 24 (NDVI 0.31)` instead of a flat `🔴 Stressed` that
would've fired for that same NDVI value under the old logic.

---

## 4. Backward compatibility

Fields saved before this patch won't have `plantingDate` — `buildStatusText()` already
handles this by falling back to the original flat thresholds when `field.plantingDate`
is `null`/`undefined`, so nothing breaks for existing saved fields. Prompt the person to
add a planting date next time they open a field's detail view, but don't force it.

---

## 5. Optional: show the expected range on the trend chart

If you want this to be visually obvious rather than just a text label, add a shaded band
to the Chart.js trend chart (Phase 5's chart) showing the expected NDVI range for the
field's current stage, so the actual NDVI line visibly sits inside or outside the band:

```js
// In your Chart.js dataset config, add a second "expected range" band dataset
// using fill: '+1' between a min-line and max-line dataset, styled with low opacity.
```

This is a polish item — the text label change in Section 3 is the part that actually
fixes the accuracy problem; the chart band is just making it visible at a glance.

---

## 6. Suggested build order

1. Add `plantingDate` capture to `promptSaveField()` + backward-compatible fallback
2. Add the `RICE_GROWTH_STAGES` table
3. Replace flat threshold logic with `buildStatusText()` in `updateFieldStatus()`
4. Test against a few fields with known planting dates — sanity check the stage
   boundaries against what you'd expect for real Battambang rice timing
5. (Optional) Add the shaded expected-range band to the trend chart

---

## 7. What this sets up for later

Once planting date exists per field, it also unlocks:
- **Harvest reminders** — days-since-planting crossing into the "Harvest" stage is a
  natural trigger for a simple on-screen note, no backend needed
- **Rainfall overlay** — cross-referencing a stage-appropriate NDVI dip against rainfall
  data (CHIRPS, via Earth Engine) becomes much more meaningful once you already know
  "this dip is unexpected for this stage," rather than guessing from raw NDVI alone
