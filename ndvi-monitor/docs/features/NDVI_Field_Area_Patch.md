# NDVI Rice Crop Health Monitor — Field Area (Hectares) Patch

### Small addition: show real field size alongside NDVI status

---

## 0. Why this matters

Right now a saved field shows a name and a health badge (🟢/🟡/🔴). It doesn't show
**how big the field actually is**. For a farmer or co-op, "2.1 ha, stressed" is a much
more useful sentence than just "stressed" — size is basic context that's currently missing.

This patch adds area calculation using **turf.js**, computed entirely in the browser from
the GeoJSON you already save — no Earth Engine call needed, since this is pure geometry,
not satellite data.

---

## 1. Add turf.js

One more CDN script tag, same pattern as Leaflet/Chart.js/leaflet-draw:

```html
<script src="https://unpkg.com/@turf/turf@6/turf.min.js"></script>
```

> **Explain to your AI:** `turf.area(geojson)` returns area in **square meters**. We
> convert to hectares (1 ha = 10,000 m²) since that's the unit farmers/co-ops actually
> think in for rice paddies.

---

## 2. Area helper function

Add this to `app.js`:

```js
function getFieldAreaHectares(geojson) {
  const squareMeters = turf.area(geojson);
  const hectares = squareMeters / 10000;
  return hectares;
}

function formatHectares(ha) {
  // Under 0.1 ha, show more decimal places — small fields shouldn't round to "0.0 ha"
  if (ha < 0.1) return `${ha.toFixed(3)} ha`;
  return `${ha.toFixed(1)} ha`;
}
```

---

## 3. Compute + save area when a field is drawn

Update `promptSaveField()` (from the Product Pivot roadmap, Feature A.2) to compute and
store area at save time, so you're not recalculating it on every dashboard render:

```js
function promptSaveField(geojson) {
  const name = prompt('Name this field (e.g. "North paddy — Svay Cheat"):');
  if (!name) return;

  const areaHectares = getFieldAreaHectares(geojson);

  const fields = JSON.parse(localStorage.getItem('ndvi_fields') || '[]');
  fields.push({
    id: crypto.randomUUID(),
    name,
    geojson,
    areaHectares,
    createdAt: new Date().toISOString(),
  });
  localStorage.setItem('ndvi_fields', JSON.stringify(fields));
  renderFieldList();
}
```

**Backward compatibility note:** any fields already saved in `localStorage` before this
patch won't have `areaHectares`. Handle that gracefully wherever you display it (see the
card template below) — either show "—" or compute it on the fly as a fallback:

```js
function getOrComputeArea(field) {
  if (typeof field.areaHectares === 'number') return field.areaHectares;
  return getFieldAreaHectares(field.geojson); // fallback for pre-patch saved fields
}
```

---

## 4. Show it on the dashboard card

Update the field card template (Feature B.1) to include area next to the name:

```js
function renderFieldList() {
  const container = document.getElementById('field-list');
  const fields = getSavedFields();
  container.innerHTML = fields.map((f) => `
    <div class="field-card" data-id="${f.id}">
      <div class="field-name">${f.name}</div>
      <div class="field-area">${formatHectares(getOrComputeArea(f))}</div>
      <div class="field-status" id="status-${f.id}">Loading…</div>
      <button class="delete-btn" data-id="${f.id}">✕</button>
    </div>
  `).join('');

  fields.forEach(f => updateFieldStatus(f));

  container.querySelectorAll('.field-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.classList.contains('delete-btn')) return;
      const field = fields.find(f => f.id === card.dataset.id);
      loadField(field);
    });
  });
  container.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteField(btn.dataset.id));
  });
}
```

Add a small CSS rule for `.field-area` in `style.css` — a muted, smaller-font line under
the field name works well (same visual weight as a subtitle, not competing with the health
badge for attention).

**Checkpoint:** ✅ Each dashboard card now reads something like:
`North paddy — Svay Cheat` / `2.1 ha` / `🟢 Healthy (NDVI 0.68)`

---

## 5. Optional: live area readout while drawing

`leaflet-draw` can show area in its on-map tooltip *while the user is still drawing*,
before they finish the polygon — nice touch, not required:

```js
const drawControl = new L.Control.Draw({
  draw: {
    polygon: { showArea: true, metric: ['ha'] },
    rectangle: { showArea: true, metric: ['ha'] },
    marker: false, circle: false, circlemarker: false, polyline: false,
  },
  edit: { featureGroup: drawnItems },
});
```

> **Explain to your AI:** this is leaflet-draw's own built-in area tooltip (separate from
> the turf.js calculation) — it's a nice live preview while drawing, but the turf.js value
> computed in Section 2 is still the one that gets saved and displayed on the dashboard,
> so the two should match but are technically independent code paths.

---

## 6. Suggested build order

1. Add the turf.js `<script>` tag
2. Add `getFieldAreaHectares()` + `formatHectares()` + `getOrComputeArea()` helpers
3. Update `promptSaveField()` to store `areaHectares` at save time
4. Update the dashboard card template to display it
5. (Optional) Add `showArea: true` to the draw toolbar for a live preview while drawing

---

## 7. Known caveat

Turf's `turf.area()` uses a **geodesic (spherical Earth)** calculation, so it's already
accurate for real-world hectares — no extra correction needed, even though Battambang
rice paddies are small enough that a flat-plane approximation would've been close too.
