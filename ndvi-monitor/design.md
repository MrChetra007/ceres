# NDVI Rice Monitor — Design System Spec

Reference implementation: `ndvi-rice-monitor-prototype.html` (dummy-data prototype).
This document exists so an AI coding assistant can apply the same visual/interaction
system to the **real app** (`ndvi-monitor/index.html`, `style.css`, `app.js` — Leaflet
+ Google Earth Engine, real data). Nothing here changes data logic, only presentation
and interaction.

---

## 1. What's changing vs. the current app

| Area | Current app | Target (this spec) |
|---|---|---|
| Theme | Light background, white panels | Dark slate background, glass dark panels |
| Panels | Flat cards, hard borders | Floating rounded cards, blur backdrop, soft shadow |
| Field display | Not shown as shapes on map | Colored polygons per monitored field (health-coded) |
| Sidebar | None / minimal | Left slide-in "Monitored Fields" panel with search + filters |
| Inspect panel | Right panel, plain list of stats | Right slide-in card stack: NDVI hero, stress alert, phenology stage, trend chart, rainfall, metadata |
| Time control | Bottom slider | Top-center floating panel: play button, month label, season tag, scene/cloud pills, scrubber |
| Feedback | None / instant | Toasts (load, export, save), skeleton/blur pulse on band switch |
| Responsiveness | Not addressed | 3 breakpoints, detail panel becomes bottom sheet on mobile |

The Leaflet map, Earth Engine tile requests, real NDVI computation, localStorage
persistence, and growth-stage threshold logic **stay exactly as they are** — this is a
skin + interaction layer on top.

---

## 2. Design tokens

```css
--bg-map: #1c2b1a;              /* fallback map background before tiles load */
--panel: #12161d;               /* base panel fill */
--panel-2: #171c24;             /* secondary panel / hover surface */
--panel-border: rgba(255,255,255,0.08);
--panel-border-strong: rgba(255,255,255,0.14);

--text: #eef1f4;                /* primary text */
--text-dim: #9aa4b1;            /* secondary text */
--text-faint: #626c79;          /* tertiary / labels / mono meta */

--accent: #22c98e;              /* healthy / primary action (emerald) */
--accent-dim: rgba(34,201,142,0.16);
--amber: #f5a623;               /* moderate stress */
--amber-dim: rgba(245,166,35,0.16);
--red: #ef5b5b;                 /* severe stress */
--red-dim: rgba(239,91,91,0.16);
--blue: #4fa8ff;                /* benchmark/reference line, rainfall icon */

--radius-lg: 16px;   /* panels */
--radius-md: 12px;   /* cards, buttons */
--radius-sm: 8px;    /* small buttons */

--shadow: 0 8px 32px rgba(0,0,0,0.45), 0 1px 0 rgba(255,255,255,0.04) inset;
```

**Fonts:**
- UI/body: `Inter` (400/500/600/700/800)
- Data readouts (NDVI values, coordinates, dates, scene counts, hectares):
  `JetBrains Mono` — always use mono for numbers that represent measured data,
  never for prose.

**NDVI health color mapping (used everywhere — field polygons, badges, legend, sparklines):**
- `healthy` → accent green `#22c98e`
- `moderate` → amber `#f5a623`
- `stressed` → red `#ef5b5b`

---

## 3. Layout map (z-index order, back to front)

1. **Map layer** — Leaflet container, full bleed, `z-index: 0`
2. **Field polygon overlays** — drawn on the map (Leaflet GeoJSON/polygon layers colored
   by health status), `z-index` per Leaflet's own pane stacking
3. **Legend** (bottom-right) + **map attribution/coordinates** (bottom-left) — `z-index: 20-25`
4. **Zoom controls** (top-left, below top bar) — `z-index: 25`
5. **Band/style toggle panel** (bottom-center) — `z-index: 30`
6. **Time control panel** (top-center) — `z-index: 30`
7. **Top bar** (brand + view/compare/export/help/menu actions) — `z-index: 30`
8. **Sidebar** (left, "Monitored Fields") — slides in, `z-index: 40`
9. **Detail panel** (right, field inspector) — slides in, `z-index: 35`
10. **Toast stack** (top-right, below top bar) — `z-index: 80`
11. **Onboarding modal** (centered overlay) — `z-index: 90`

---

## 4. Components

### 4.1 Top bar
Fixed top, full width, flex `space-between`.
- **Left:** brand chip — icon + app name + small mono "location" badge (e.g.
  `BATTAMBANG`) + subtitle (`Sentinel-2 Satellite Crop Health · N Monitored Fields`,
  pull the field count from real data)
- **Right, in order:** Satellite/Street view toggle, Compare Mode toggle (stateful —
  highlights when active), Export dropdown (PNG/PDF), Help (opens onboarding modal),
  Menu/hamburger (opens sidebar)
- All buttons: dark glass pill, `--radius-sm`, hover = lighten + `translateY(-1px)`

### 4.2 Time control panel
Floating top-center card. Contains:
- Play/pause button (auto-advances through months on an interval, ~900ms/step, loops)
- Current month label (full name, e.g. "February 2026") + season tag
  (Wet Season (Rainfed) vs Dry Season (Irrigated) — derive from month, not hardcoded)
- Two mono pill badges: scene count for that month, cloud-cover %
- Horizontal scrubber: draggable handle, filled track, tick labels under it
  (mouse **and** touch drag support — this was missing in v1 of the prototype and
  had to be added; make sure the real build has touch handlers from the start)
- Dragging updates the map's active tile/date and triggers the loading transition (4.7)

### 4.3 Band + map-style panel
Floating bottom-center. Two segmented-control groups separated by a vertical divider:
- NDVI / NDWI / LSWI (index band select)
- Street / Satellite (base layer select)
Selected segment gets solid `--panel-2` background; switching bands should re-tint
the active tile layer, not just relabel it.

### 4.4 Legend
Bottom-right, fixed, hidden below the tablet breakpoint. Horizontal gradient bar
(red → amber → yellow → green) with min/mid/max mono labels
(`0.0 Soil/Water`, `0.4 Moderate`, `1.0 Dense Veg.`).

### 4.5 Sidebar — "Monitored Fields"
Slides in from left (`transform: translateX(-100%)` → `0`, ease `cubic-bezier(.4,0,.2,1)`, 0.35s).
- Header: title + total parcel/hectare count, close button, search input, filter tabs
  (All / Healthy / Alerts — filter the list client-side)
- Scrollable field-card list. Each card:
  - district + hectares (mono, small, uppercase)
  - field name (bold)
  - growth stage + day (e.g. "Tillering (Day 24)")
  - NDVI value badge, color-coded by status
  - sparkline (14-point trend, colored to match status)
  - stress alert strip if applicable (amber = warning, red = severe)
  - active state: left accent border + tinted background
- Footer: "Draw / Add New Field Boundary" — hooks into the real app's existing
  leaflet-draw + save-field flow, just re-skinned as a dashed accent button

### 4.6 Detail panel — field inspector
Slides in from right (mirror of sidebar transform/easing). Stack of cards for one
selected field:
1. **Header card:** breadcrumb (district · commune · hectares), field name, farmer +
   variety, then the NDVI hero row — big mono NDVI value, an info-dot with hover
   tooltip explaining NDVI in plain language, and a status badge (Vigorous Growth /
   Moderate Stress / Severe Stress) — plus a benchmark reference value underneath
2. **Alert card** (only if stress detected): icon + headline + one-line explanation
   of the likely cause, amber or red depending on severity
3. **Phenology card:** current stage name, plain-language description of what's
   happening in the plant at this stage, a "Day X / Y" progress bar
4. **Trend chart card:** 14-month area/line chart, NDVI (solid, filled) vs. benchmark
   (dashed blue), small legend, x-axis labels at quarter points
5. **Rainfall card:** single row, rain icon + mm value for the period
6. **Metadata card:** satellite constellation, acquisition date, cloud mask filter —
   monospace key-value rows, plus a one-line data-source footnote

Clicking a field polygon on the map **or** a sidebar card opens this panel and marks
that field active in both places (keep selection state in sync across map/sidebar/panel).

### 4.7 Motion & feedback
- Panel open/close: slide + fade, 0.3–0.4s, `cubic-bezier(.4,0,.2,1)` — never instant show/hide
- Band/date change: overlay briefly blurs + brightens (~480ms) before settling,
  simulating a fetch even though in the real app a fetch is actually happening —
  keep this as the *minimum* transition time so fast real responses don't feel abrupt
- Toasts: slide down + fade in from top-right, auto-dismiss ~2.5s, slide-out fade on exit.
  Use for: initial field load, export start ("Exporting…") → export complete ("Saved ✓"),
  band switch confirmation
- Hover states: subtle scale/shadow/lighten only, no hard color snaps
- Health badge / polygon color changes: transition `fill`/`color`, not instant swap

### 4.8 Onboarding modal
Centered overlay, dark scrim + blur backdrop. 4-slide walkthrough (dot progress
indicator, Skip + Next/Got it buttons): what NDVI is, how to read the color scale,
how stress alerts work, how the time slider + compare mode work. Reachable from the
help icon in the top bar at any time, not just first visit.

---

## 5. Responsive behavior

| Breakpoint | Key changes |
|---|---|
| `≤1024px` | Sidebar/detail panel narrow to 280px, legend hides, brand subtitle hides |
| `≤780px` | Top bar wraps and buttons collapse to icon-only; time panel moves to a bottom bar above the band panel; **detail panel becomes a bottom sheet** (slides up from bottom, not in from the right) since there's no side room; sidebar opening auto-closes when a field is selected from it |
| `≤480px` | Full-width sidebar, tighter paddings everywhere, toast stack moves to bottom so it doesn't collide with the top bar, chart height reduced |

`prefers-reduced-motion: reduce` should collapse all transition/animation durations
to near-zero.

---

## 6. Feature parity checklist (make sure nothing from the real app is lost)

- [ ] NDVI / NDWI / LSWI band switching → re-skin as segmented control, keep real tile logic
- [ ] Street / Satellite base layer toggle
- [ ] 14-month time slider (Jun 2025–Jul 2026 or current real range) with real scene/cloud metadata
- [ ] Compare-two-dates split screen → keep real logic, re-skin the divider/labels
- [ ] Click-to-inspect trend chart with stress detection → maps to Detail panel §4.6
- [ ] Growth-stage-aware NDVI thresholds (RICE_GROWTH_STAGES table) → maps to Phenology card §4.6.3, falls back to flat thresholds when planting date unknown, same as today
- [ ] Draw & save fields (leaflet-draw + localStorage) → maps to Sidebar footer §4.5
- [ ] Dashboard sidebar of saved fields with health badges → maps to §4.5
- [ ] PNG/PDF export of field reports → maps to Export dropdown, keep real export logic, re-skin as toast-driven flow
- [ ] Event overlay (flood/dry spell markers) — not yet represented in the prototype;
      needs a new marker/annotation treatment consistent with §2 tokens before this
      ships (flag this as an open item, don't silently drop it)

---

## 7. Implementation notes for the AI doing the redesign

- Don't replace the Leaflet map or Earth Engine calls — only restyle the DOM chrome
  around/on top of it and re-theme any Leaflet controls (zoom, attribution) to match
  §2 tokens.
- Field polygons should be real Leaflet layers colored via the health-status mapping
  in §2, not the prototype's absolutely-positioned SVG shapes (those were a
  no-backend stand-in only).
- Keep all class/variable naming close to this spec (`--accent`, `.field-card`,
  `.dp-card`, etc.) so future diffs against this doc stay legible.
- Reference file for exact markup/CSS/motion timing: `ndvi-rice-monitor-prototype.html`.
