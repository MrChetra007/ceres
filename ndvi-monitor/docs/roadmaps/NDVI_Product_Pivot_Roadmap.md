# NDVI Rice Crop Health Monitor — Product Pivot Roadmap

### From tech-show demo → simple, real tool (single-user, no accounts)

---

## 0. Scope for this pass

Three features, in build order:

1. **Save & find your own rice fields** — draw a field once, it's there next time you open the app
2. **Dashboard** — a list of your saved fields with a health status at a glance, instead of
   hunting through the map one at a time
3. **Export** — a simple report you can save/share for a field

**Explicitly not doing yet:** multi-user accounts, Telegram/scheduled alerts, any server-side
component. Everything below runs entirely in the browser — no Supabase, no backend, no new
hosting requirements. This keeps it deployable exactly like the current static app.

**How "single-user, no accounts" actually works:** saved fields live in the browser's
`localStorage`, keyed to your device/browser. This is genuinely fine for one person using it
on one laptop at a booth or in an office — the moment you want this to sync across devices or
support more than one person, that's when a real backend + accounts becomes worth the added
complexity. Not now.

---

## 1. Feature A — Draw & save your own field

Right now the AOI is one hardcoded rectangle. Replace it with: draw any shape, name it, save it.

### 1.1 Add polygon drawing to the map

```html
<script src="https://unpkg.com/leaflet-draw@1.0.4/dist/leaflet.draw.js"></script>
<link rel="stylesheet" href="https://unpkg.com/leaflet-draw@1.0.4/dist/leaflet.draw.css" />
```

```js
const drawnItems = new L.FeatureGroup();
map.addLayer(drawnItems);

const drawControl = new L.Control.Draw({
  draw: { polygon: true, marker: false, circle: false, circlemarker: false, polyline: false, rectangle: true },
  edit: { featureGroup: drawnItems },
});
map.addControl(drawControl);

map.on(L.Draw.Event.CREATED, (e) => {
  drawnItems.addLayer(e.layer);
  promptSaveField(e.layer.toGeoJSON()); // hand off to Feature A.2
});
```

> **Explain to your AI:** `leaflet-draw` gives visitors/you an on-map toolbar to draw a
> polygon or rectangle by hand, instead of typing coordinates. `toGeoJSON()` converts
> whatever shape was drawn into a format you can both save and feed straight into
> `ee.Geometry.Polygon(...)` for NDVI computation later.

### 1.2 Save the field to `localStorage`

```js
function promptSaveField(geojson) {
  const name = prompt('Name this field (e.g. "North paddy — Svay Cheat"):');
  if (!name) return;

  const fields = JSON.parse(localStorage.getItem('ndvi_fields') || '[]');
  fields.push({
    id: crypto.randomUUID(),
    name,
    geojson,
    createdAt: new Date().toISOString(),
  });
  localStorage.setItem('ndvi_fields', JSON.stringify(fields));
  renderFieldList(); // Feature B
}

function getSavedFields() {
  return JSON.parse(localStorage.getItem('ndvi_fields') || '[]');
}

function deleteField(id) {
  const fields = getSavedFields().filter((f) => f.id !== id);
  localStorage.setItem('ndvi_fields', JSON.stringify(fields));
  renderFieldList();
}
```

### 1.3 Load a saved field back onto the map

```js
function loadField(field) {
  drawnItems.clearLayers();
  const layer = L.geoJSON(field.geojson).addTo(drawnItems);
  map.fitBounds(layer.getBounds());

  // Convert saved GeoJSON coordinates into an ee.Geometry for NDVI computation
  const coords = field.geojson.geometry.coordinates;
  const eeGeometry = field.geojson.geometry.type === 'Polygon'
    ? ee.Geometry.Polygon(coords)
    : ee.Geometry.Point(coords); // fallback, shouldn't hit this given draw config above

  computeAndShowNdviForGeometry(eeGeometry); // generalize your existing computeAndShowNdvi
}
```

**Note:** this means `computeAndShowNdvi()` from the migration roadmap needs a small refactor
— take a geometry as a parameter instead of always using the hardcoded Battambang rectangle.
Same for `getNdviTimeSeriesAtPoint` if you want per-field trends (see Feature B.2).

**Checkpoint:** ✅ Draw a shape, name it, refresh the page, it's still there in `localStorage`,
clicking it re-loads the NDVI overlay for that exact shape.

---

## 2. Feature B — Dashboard

A list view showing all saved fields with a health status, so you scan risk without opening
each one on the map.

### 2.1 Layout

Add a sidebar or a toggleable panel (`<div id="dashboard">`) listing each saved field as a card:

```html
<div id="dashboard" class="dashboard">
  <h3>My Fields</h3>
  <div id="field-list"></div>
</div>
```

```js
function renderFieldList() {
  const container = document.getElementById('field-list');
  const fields = getSavedFields();
  container.innerHTML = fields.map((f) => `
    <div class="field-card" data-id="${f.id}">
      <div class="field-name">${f.name}</div>
      <div class="field-status" id="status-${f.id}">Loading…</div>
      <button class="delete-btn" data-id="${f.id}">✕</button>
    </div>
  `).join('');

  fields.forEach(f => updateFieldStatus(f)); // Feature B.2

  container.querySelectorAll('.field-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.classList.contains('delete-btn')) return; // handled separately
      const field = fields.find(f => f.id === card.dataset.id);
      loadField(field);
    });
  });
  container.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteField(btn.dataset.id));
  });
}
```

### 2.2 Per-field health status (the actual useful part)

For each saved field, get the most recent month's mean NDVI and turn it into a simple badge.
Reuse the `reduceRegion` pattern from your existing click-to-inspect code, but over the whole
field polygon instead of a single point:

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
    const label = value > 0.6 ? '🟢 Healthy' : value > 0.3 ? '🟡 Moderate' : '🔴 Stressed';
    el.textContent = `${label} (NDVI ${value.toFixed(2)})`;
  });
}
```

> **Explain to your AI:** the 0.6 / 0.3 thresholds are a simple starting point, not a
> validated agronomic standard — reasonable for a first pass, but worth eventually checking
> against real Battambang rice-growth-stage NDVI ranges if this becomes a serious tool.

**Checkpoint:** ✅ Dashboard shows every saved field with a green/yellow/red badge and NDVI
number, computed automatically on load — no need to click into each one to know if something
needs attention.

---

## 3. Feature C — Export

A simple one-field report someone could save, print, or hand to someone else.

### 3.1 Simplest version: export the trend chart + summary as an image

If you're already using Chart.js for the trend chart (Phase 5 from the original roadmap),
Chart.js canvases can be exported directly:

```js
function exportFieldReport(field) {
  const canvas = document.getElementById('trend-chart'); // your existing Chart.js canvas
  const link = document.createElement('a');
  link.download = `${field.name.replace(/\s+/g, '_')}_NDVI_report.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}
```

This alone is genuinely useful and requires no new libraries — one button, one PNG download
with the field's trend line on it.

### 3.2 Nicer version: a proper one-page PDF

If you want something more polished (field name, date, NDVI status, chart, and a short
explanation on one page), that's a good fit for a PDF-generation pass — worth doing as a
follow-up once A and B are solid, using whatever PDF tooling fits your stack at that point.
Not blocking — the PNG export in 3.1 covers "real utility" on its own.

**Checkpoint:** ✅ Clicking "Export" on a field's dashboard card downloads something you could
actually hand to a farmer, co-op member, or loan officer.

---

## 4. Suggested build order

1. Feature A (draw + save + reload fields) — unlocks everything else, since B and C both
   depend on having saved fields to work with
2. Feature B.1 (dashboard list/layout) — no NDVI logic yet, just prove the list renders
3. Feature B.2 (per-field health status) — the actual "useful at a glance" payoff
4. Feature C.1 (PNG export) — quick win once the trend chart exists per field
5. Feature C.2 (PDF, optional) — polish pass if time allows

---

## 5. What this sets up for later (not now)

If this later grows into something for co-ops managing many farmers rather than just you:
- `localStorage` → Supabase table (`fields`: owner, geojson, name, notes) is a clean swap,
  since the data shape (GeoJSON + name) doesn't need to change, just where it's stored
- Telegram alerts become straightforward at that point too, since you'd already have a
  database of fields a scheduled job could iterate over — the earlier constraint was purely
  "no server-side component yet," which a Supabase Edge Function on a cron schedule resolves
