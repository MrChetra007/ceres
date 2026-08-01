# NDVI Rice Crop Health Monitor — UI Redesign Patch

### Cleaning up the interface: one visual language instead of four bolted-on widgets

---

## 0. What this fixes

Right now the top status bar, the field card sidebar, the trend chart panel, and the
bottom control bar (Compare/NDWI/Export) each have their own background, spacing, and
button style. Functionally everything works — this patch is purely about making it
_read_ as one designed product instead of four separate pieces stacked on a map.

**Nothing computational changes.** No new Earth Engine calls, no new data. This is CSS
and markup only.

---

## 1. One shared panel style

Add this to `style.css` and reuse it everywhere — the field card, the trend chart panel,
and the bottom control bar should all share it:

```css
.panel {
  background: #ffffff;
  border: 0.5px solid #e5e3da;
  border-radius: 12px;
  padding: 1rem 1.25rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}

.panel-title {
  font-weight: 500;
  font-size: 14px;
  margin: 0;
  color: #1a1a18;
}

.panel-subtitle {
  font-size: 12px;
  color: #7a7972;
  margin: 2px 0 0;
}
```

> **Explain to your AI:** the point of `.panel` is that any floating box on the map —
> field card, chart, control bar — gets the same border, radius, and shadow. Swap these
> hex values for your existing color scheme if you already have CSS variables defined;
> the important part is that all four floating elements resolve to the _same_ values,
> not different ones each.

Apply `.panel` to the existing containers:

```html
<div id="dashboard" class="panel">...</div>
<div id="trend-chart-panel" class="panel">...</div>
<div id="slider-panel" class="panel">...</div>
```

---

## 2. Field card: pull the status badge out on its own

Currently the health label is inline text sharing space with the growth-stage detail.
Split it into a header row (name + status badge) and a stat row (area / planted date /
NDVI value) below a divider:

```html
<div class="field-card panel" data-id="${f.id}">
  <div class="field-card-header">
    <div>
      <p class="panel-title">${f.name}</p>
      <p class="panel-subtitle">${f.stageLabel}</p>
    </div>
    <span class="status-badge status-${f.statusClass}">${f.statusText}</span>
  </div>
  <div class="field-card-stats">
    <span
      ><i class="ti ti-ruler-2"></i>
      ${formatHectares(getOrComputeArea(f))}</span
    >
    <span
      ><i class="ti ti-calendar"></i> ${f.plantingDate ?
      formatShortDate(f.plantingDate) : 'No date'}</span
    >
    <span
      ><i class="ti ti-leaf"></i> NDVI ${f.lastNdvi?.toFixed(2) ?? '—'}</span
    >
  </div>
  <button class="delete-btn" data-id="${f.id}" aria-label="Delete field">
    ✕
  </button>
</div>
```

```css
.field-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 10px;
}

.status-badge {
  font-size: 12px;
  font-weight: 500;
  padding: 4px 10px;
  border-radius: 999px;
  white-space: nowrap;
}

.status-healthy {
  background: #eaf3de;
  color: #27500a;
}
.status-moderate {
  background: #faeeda;
  color: #633806;
}
.status-stressed {
  background: #fcebeb;
  color: #791f1f;
}

.field-card-stats {
  display: flex;
  gap: 16px;
  padding-top: 10px;
  border-top: 0.5px solid #e5e3da;
  font-size: 13px;
  color: #7a7972;
}

.field-card-stats i {
  font-size: 15px;
  margin-right: 4px;
  vertical-align: -2px;
}
```

> **Explain to your AI:** `f.statusClass` and `f.statusText` need to come from wherever
> `buildStatusText()` (Growth Stage patch, Section 3) currently builds its label — split
> that function so it returns a `{ statusClass, statusText, stageLabel }` object instead
> of one combined string, so the badge and the subtitle can be styled independently.

**Add a soft warning for implausible field sizes** — a rice paddy field over roughly
50 ha is almost certainly a mis-drawn shape, not a real single field:

```js
function getAreaWarning(hectares) {
  if (hectares > 50)
    return "Unusually large for one field — check the drawn shape?";
  return null;
}
```

Show it as a small muted line under the stats row only when it fires — don't add an
empty slot when there's no warning.

---

## 3. Bottom control bar: segmented toggle + dropdown export

Replace the current row of separate buttons with a segmented control (NDVI/NDWI), a
switch (Compare), and a single export dropdown:

```html
<div id="slider-panel" class="panel">
  <div class="control-row">
    <div class="segmented" role="group" aria-label="Index">
      <button class="segmented-btn active" data-index="ndvi">NDVI</button>
      <button class="segmented-btn" data-index="ndwi">NDWI</button>
    </div>
    <label class="switch-label">
      Compare
      <input type="checkbox" id="compare-toggle" />
    </label>
    <div class="export-dropdown">
      <button id="export-btn">
        <i class="ti ti-download"></i> Export <i class="ti ti-chevron-down"></i>
      </button>
      <div id="export-menu" class="export-menu" hidden>
        <button data-format="png">Export as PNG</button>
        <button data-format="pdf">Export as PDF</button>
      </div>
    </div>
  </div>
  <div class="slider-row">
    <span class="slider-label">Jun 2025</span>
    <input type="range" id="month-slider" min="0" max="13" value="12" />
    <span class="slider-label">Jul 2026</span>
  </div>
</div>
```

```css
.control-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  gap: 12px;
}

.segmented {
  display: flex;
  background: #f1efe8;
  border-radius: 8px;
  padding: 2px;
}

.segmented-btn {
  border: none;
  background: transparent;
  padding: 4px 12px;
  font-size: 13px;
  border-radius: 6px;
  color: #7a7972;
  cursor: pointer;
}

.segmented-btn.active {
  background: #ffffff;
  color: #1a1a18;
  font-weight: 500;
  box-shadow: 0 0 0 0.5px #e5e3da;
}

.switch-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #7a7972;
  white-space: nowrap;
}

.export-dropdown {
  position: relative;
}

.export-menu {
  position: absolute;
  bottom: 100%;
  right: 0;
  margin-bottom: 6px;
  background: #ffffff;
  border: 0.5px solid #e5e3da;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  overflow: hidden;
}

.export-menu button {
  display: block;
  width: 100%;
  text-align: left;
  padding: 8px 14px;
  border: none;
  background: transparent;
  font-size: 13px;
  cursor: pointer;
}

.export-menu button:hover {
  background: #f1efe8;
}

.slider-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.slider-label {
  font-size: 11px;
  color: #a3a29c;
  min-width: 48px;
}
```

```js
document.querySelectorAll(".segmented-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll(".segmented-btn")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    setActiveIndex(btn.dataset.index); // your existing NDVI/NDWI switch function
  });
});

document.getElementById("export-btn").addEventListener("click", () => {
  document.getElementById("export-menu").hidden =
    !document.getElementById("export-menu").hidden;
});

document.querySelectorAll("#export-menu button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.getElementById("export-menu").hidden = true;
    btn.dataset.format === "png"
      ? exportFieldReportPNG()
      : exportFieldReportPDF();
  });
});
```

**Checkpoint:** ✅ Bottom bar reads as one grouped control instead of four separate
buttons — NDVI/NDWI as a pill toggle, Compare as a switch, Export collapsed to one button
that reveals PNG/PDF on click.

---

## 4. Trend chart panel: give it a title instead of floating raw

Wrap the existing chart canvas + lat/lng readout in the same `.panel` style, with a real
title/subtitle instead of separate floating text elements:

```html
<div id="trend-chart-panel" class="panel">
  <div class="field-card-header">
    <div>
      <p class="panel-title">NDVI trend</p>
      <p class="panel-subtitle" id="chart-coords">—</p>
    </div>
    <button class="icon-btn" id="chart-menu-btn" aria-label="Chart options">
      <i class="ti ti-dots-vertical"></i>
    </button>
  </div>
  <canvas id="trend-chart"></canvas>
</div>
```

Update wherever you currently set the raw `Lat: X, Lng: Y` text to instead set
`#chart-coords`'s content, formatted as `13.2145, 103.4734 · 36 observations` — combining
what were two separate floating pieces of text into one subtitle line.

---

## 5. Top status bar: shrink to a fading toast

Instead of a permanent full-width banner, show status as a small pill that appears
top-center and fades out after a few seconds once state is `ready`:

```css
.status-toast {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  background: #ffffff;
  border: 0.5px solid #e5e3da;
  border-radius: 999px;
  padding: 6px 14px;
  font-size: 13px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  transition: opacity 0.4s ease;
  z-index: 500;
}

.status-toast.hidden {
  opacity: 0;
  pointer-events: none;
}
```

```js
function setStatus(state, text) {
  const bar = document.getElementById("status-bar");
  bar.textContent = text;
  bar.classList.remove("hidden");

  if (state === "ready") {
    clearTimeout(setStatus._fadeTimer);
    setStatus._fadeTimer = setTimeout(() => bar.classList.add("hidden"), 2500);
  }

  document.getElementById("auth-overlay").style.display =
    state === "ready" || state === "computing" || state === "initializing"
      ? "none"
      : "flex";
}
```

Change `#status-bar`'s class from a full-width banner to `.status-toast` in the HTML.

**Checkpoint:** ✅ Status messages ("NDVI layer loaded", "NDVI trend loaded — 36
observations") appear as a small pill, then fade — no longer a permanent bar eating
header space.

---

## 6. Suggested build order

1. Add the shared `.panel` style, apply it to the three existing containers
2. Rebuild the field card markup (header + badge + stat row + area warning)
3. Rebuild the bottom control bar (segmented toggle + switch + export dropdown)
4. Wrap the trend chart in `.panel` with a real title/subtitle
5. Convert the top status bar to a fading toast

Each step is independent — you can ship them one at a time and the app keeps working
between steps, since none of this touches the underlying NDVI/data logic.
