# NDVI Rice Crop Health Monitor — Stack Migration Roadmap

### Vue + Vite → Plain HTML / CSS / JS

---

## 0. Why we're switching

The Earth Engine JS client (`@google/earthengine` npm package) does dynamic function-binding
and injects its own OAuth/gapi loader script internally. Under Vite's dev-server module graph
and pre-bundling cache, this produces a hard-to-debug error:

```
Auth failed: Error: Failed to locate function parameters.
```

This is not a bug in the app's code — it's the EE client's dynamic binding breaking under
Vite's ESM interop. The fix is to load Earth Engine the way Google's own docs and every EE
tutorial do it: via a plain `<script>` tag, with no bundler in between.

**Everything else about the project — NDVI computation, AOI, Cloud Project, OAuth Client ID,
phase order — stays the same.** This is purely a delivery-mechanism swap, not a redesign.

---

## 1. What carries over unchanged

Confirm these before touching anything — they don't change:

- **AOI (Battambang rice paddies):** `[103.10, 12.95, 103.25, 13.05]`
- **NDVI computation:** Sentinel-2 (`COPERNICUS/S2_SR_HARMONIZED`) → filter by bounds/date/cloud →
  `.median()` → `.normalizedDifference(['B8', 'B4'])`
- **Visualization palette:** `{ min: -0.2, max: 0.8, palette: ['red', 'yellow', 'green'] }`
- **Cloud Project ID:** `gen-lang-client-0978198347` (the "flora AI" project — confirmed to have
  a registered OAuth client and successfully return the algorithms list)
- **OAuth Client ID:** `355514869488-q3v52vvkb7c3gikr0og89o26m51ev403.apps.googleusercontent.com`
  (the "Pawpass"-adjacent Web application client, or create a fresh Web application client if
  you want one scoped just to this project — either works as long as it's a **Web application**
  type, not Android)
- **Earth Engine registration:** already active under Community non-commercial tier
  (org: National University of Battambang)
- **No visitor login** — developer authenticates once via OAuth popup, demo runs under that
  session/quota

---

## 2. New project structure

Drop Vite entirely. A static folder is enough:

```
ndvi-monitor/
├── index.html
├── style.css
├── app.js
```

No `npm create vite`, no `node_modules`, no build step. Serve it with anything that serves
static files — `npx serve .`, VS Code's Live Server extension, or just opening `index.html`
directly (note: OAuth popup flows generally need `http://` not `file://`, so use a local
server, not double-clicking the file).

**Explain to your AI:** because there's no bundler, `ee` and `L` (Leaflet) become global
variables from the `<script>` tags — no `import` statements needed for them anywhere in `app.js`.

---

## 3. Phase mapping (old Vue phase → new vanilla equivalent)

### Phase 2 (scaffold) → New Phase A: HTML shell + script tags

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>NDVI Rice Crop Health Monitor</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <div id="map"></div>
  <div id="status-bar" class="status-bar"></div>
  <div id="auth-overlay" class="auth-overlay">
    <div class="auth-card">
      <h2>NDVI Rice Crop Health Monitor</h2>
      <p class="subtitle">Battambang, Cambodia</p>
      <button id="sign-in-btn">Sign in with Google</button>
    </div>
  </div>

  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="https://ajax.googleapis.com/ajax/libs/earthengine/1.7.36/earthengine-api.js"></script>
  <script src="app.js"></script>
</body>
</html>
```

**Checkpoint:** ✅ Page loads with no console errors, Leaflet and `ee` are both defined
globally (check in browser console: `typeof L`, `typeof ee` should both be `"object"`).

### Phase 2.3 (blank map) → carries over almost as-is

```js
// app.js
const EE_PROJECT_ID = 'gen-lang-client-0978198347';
const CLIENT_ID = '355514869488-q3v52vvkb7c3gikr0og89o26m51ev403.apps.googleusercontent.com';

const map = L.map('map', { center: [13.05, 103.175], zoom: 11 });
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors',
  maxZoom: 19,
}).addTo(map);
```

**Checkpoint:** ✅ Blank Battambang map renders.

### Phase 2.2 (auth) + Phase 3.1 (tile URL) → New Phase B: Auth + NDVI in one flow

```js
document.getElementById('sign-in-btn').addEventListener('click', authenticate);

function authenticate() {
  setStatus('authenticating', 'Signing in...');
  ee.data.authenticateViaOauth(
    CLIENT_ID,
    () => {
      setStatus('initializing', 'Initializing Earth Engine...');
      ee.initialize(
        null, null,
        () => {
          setStatus('computing', 'Computing NDVI...');
          computeAndShowNdvi();
        },
        (err) => setStatus('error', `Init failed: ${err?.message || err}`),
        null,
        EE_PROJECT_ID
      );
    },
    (err) => setStatus('error', `Auth failed: ${err?.message || err}`)
  );
}

function computeAndShowNdvi() {
  const battambang = ee.Geometry.Rectangle([103.10, 12.95, 103.25, 13.05]);
  const s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(battambang)
    .filterDate('2026-06-01', '2026-07-01')
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
    .median();

  const ndvi = s2.normalizedDifference(['B8', 'B4']).rename('NDVI');
  const ndviVis = { min: -0.2, max: 0.8, palette: ['red', 'yellow', 'green'] };

  // NOTE: use the callback form of getMap, not the old synchronous-looking form —
  // this is required in the current client and avoids the exact bug we hit under Vite.
  ndvi.getMap(ndviVis, (mapId, err) => {
    if (err || !mapId?.urlFormat) {
      setStatus('error', err || 'Could not get tile URL from Earth Engine');
      return;
    }
    L.tileLayer(mapId.urlFormat, {
      attribution: 'Sentinel-2 / Google Earth Engine',
      opacity: 0.8,
    }).addTo(map);
    setStatus('ready', 'NDVI layer loaded — June 2026');
  });
}

function setStatus(state, text) {
  const bar = document.getElementById('status-bar');
  bar.textContent = text;
  bar.className = `status-bar ${state}`;
  document.getElementById('auth-overlay').style.display =
    (state === 'ready' || state === 'computing' || state === 'initializing') ? 'none' : 'flex';
}
```

**Checkpoint:** ✅ Clicking "Sign in with Google" completes the OAuth popup, and the
green/red NDVI overlay appears over Battambang — this is the exact point that was
blocked in the Vue version.

### Phase 4 (time slider) → unchanged in concept, DOM-based instead of Vue state

- Add `<input type="range" id="month-slider">` to `index.html`
- Replace `selectedMonth` Vue ref with a plain JS variable
- On the slider's `input` event (debounced 300ms), call a `getNdviTileForMonth(year, month)`
  function, get the new tile URL via `.getMap()`, remove the old Leaflet layer, add the new one
- Everything else from the original Phase 4 plan (debounce reasoning, loading spinner) applies unchanged

### Phase 5 (click-to-inspect) → unchanged in concept

- `map.on('click', ...)` works identically in vanilla Leaflet
- `.evaluate()` usage for pulling NDVI time-series values out of Earth Engine is unchanged
- Swap the "small popup or side panel" from a Vue component to a plain `<div>` you show/hide
  and populate with `innerHTML` or `textContent`
- Chart.js integration: add `<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>`
  to `index.html`, use the global `Chart` constructor — no `import` needed

### Phase 6 (polish) → unchanged, DOM-based instead of Vue conditionals

- Preset location buttons: plain `<button>` elements with click handlers calling `map.flyTo()`
- Loading states: toggle CSS classes on elements instead of `v-if`
- "How this works" panel: a plain `<div>` toggled with a button

---

## 4. What's different to keep in mind going forward

- **No component reactivity.** State (current month, selected point, NDVI values) lives in
  plain JS variables at the top of `app.js`, and you manually update the DOM when they change.
  For an app this size (single page, no routing), this is simpler than it sounds — you're
  writing 5-10 small `update...()` functions instead of relying on Vue's reactivity system.
- **No build step.** Changes to `app.js` or `index.html` take effect on a plain browser
  refresh — no dev server restart needed, no Vite cache to worry about.
- **Deployment is simpler too:** any static host (Vercel, Netlify, Cloudflare Pages, or even
  GitHub Pages) can serve the three files directly — no build command needed in the host's
  settings, just "serve this folder as-is."

---

## 5. Immediate next step

1. Create the three files above (`index.html`, `style.css`, `app.js`)
2. Serve locally (`npx serve .` or Live Server)
3. Confirm the OAuth popup completes and NDVI renders — this unblocks everything downstream
4. Once confirmed, resume from "Phase 4 — Time slider" using the mapping above
