# Ceres — Add SAVI, EVI, GNDVI Indices + Weather Forecast Panel

## Context

Ceres is a Vue 3 + Vite + Tailwind + Supabase + Google Earth Engine rice field monitoring app for Battambang, Cambodia. Dark theme, satellite-dashboard design system.

The app already computes and displays **NDVI, NDWI, LSWI, and True Color** as selectable "modes" — this is the single source of truth for mode selection, located in the **bottom sheet ("Browse Observations")**, which has an NDVI/NDWI/LSWI/True Color toggle group. There is no duplicate mode control anywhere else in the app.

**Current layout (do not change structurally):**
- Header bar (search, Zones, hamburger settings menu)
- Full-bleed map background with the color-coded overlay for whichever mode is selected
- Left drawer: Monitored Fields list (collapsible, edge tab)
- Right drawer: Field stats panel — opens when a field is selected. Top to bottom: field name/header, hero index score + health label, growth stage progress bar, stress alert callout, "Consult AI" button, index trend chart (fixed height, panel scrolls via overflow-y), Rainfall (21-day), Field Metadata, Field Photos.
- Bottom sheet: Browse Observations — satellite-pass thumbnail strip, mode toggle group (NDVI/NDWI/LSWI/True Color), basemap toggle, Areas dropdown
- Top overlay card: month/season label, play button, timeline

**Design rules — follow these strictly:**
- No visual/theme changes. Reuse existing Tailwind classes, dark color scheme, and component patterns exactly as they are.
- The map is always the base layer; panels float on top and never permanently shrink it.
- Panels scroll (overflow-y) rather than compress content to fit.
- Mobile and desktop share the same components with responsive behavior differences, not divergent components. On mobile, the bottom sheet's mode-selection row is a stacked flex-column — any new mode added there must fit this pattern without horizontal overflow.
- The right panel (field stats) is NOT a bottom-sheet on mobile — it's its own full-screen overlay, separate from the bottom sheet.

## Ground rules for you (the coding agent)

1. **Explore before writing.** Before touching anything, locate:
   - The file(s) where NDVI/NDWI/LSWI band math is defined (likely a composable, store module, or Earth Engine query builder).
   - The component that renders the mode toggle group in the Browse Observations bottom sheet.
   - The component/config that defines per-mode color legends and health thresholds.
   - The right-panel "Field stats" component, specifically where Rainfall (21-day) is rendered — the weather forecast will live near there.
   Mirror the exact existing pattern for each of these. Do not introduce a new architecture (e.g. a different state pattern, a new folder structure, a different band-math abstraction) if one already exists.

2. **One index at a time.** Implement SAVI fully (band math → mode toggle → legend/thresholds → map rendering) and confirm it renders correctly before moving to EVI, then GNDVI. Don't build all three band-math functions first and wire up UI after — do each end-to-end.

3. **Scope discipline.** These three indices are **visual/exploratory tabs only** — they do NOT feed into the existing growth-stage stress-alert scoring or Consult AI's alert logic for this pass. Do not modify the stress-alert calculation.

4. Do not touch Telegram alert logic, Consult AI's prompt, or the LSWI planting-date detection in this pass — weather is display-only for now (see Step 4).

## Step 1 — SAVI (Soil-Adjusted Vegetation Index)

Formula: `SAVI = ((NIR - RED) / (NIR + RED + L)) * (1 + L)`, with `L = 0.5`.
Sentinel-2 bands: NIR = B8, RED = B4.

- Add the SAVI Earth Engine expression alongside the existing NDVI/NDWI/LSWI expressions, following the exact same code pattern (same file, same function signature style).
- Add "SAVI" as a new option in the Browse Observations mode toggle group, in the same list as NDVI/NDWI/LSWI/True Color. Confirm it doesn't break the mobile stacked layout.
- Add a SAVI-specific color legend/threshold set — **do not reuse the NDVI threshold values**, since SAVI's healthy range differs. If you're unsure of reasonable default breakpoints, use a 3-band gradient (stressed / moderate / healthy) proportional to SAVI's typical 0–1 range and flag it clearly as a placeholder for the user to tune.
- Verify: select a field, switch to SAVI mode, confirm the map overlay renders with real spatial variation (not flat/uniform) and the legend displays correctly.

## Step 2 — EVI (Enhanced Vegetation Index)

Formula: `EVI = G * ((NIR - RED) / (NIR + C1*RED - C2*BLUE + L))`, with `G = 2.5`, `C1 = 6`, `C2 = 7.5`, `L = 1`.
Sentinel-2 bands: NIR = B8, RED = B4, BLUE = B2 (confirm B2 is already available in the existing image collection query — it should be, since Sentinel-2 pulls it by default).

- Same pattern as Step 1: band math → mode toggle entry → legend/thresholds → verify.
- EVI does not saturate the way NDVI does, so it's expected to keep discriminating between fields even at high biomass — don't clip/normalize it to match NDVI's visual range.

## Step 3 — GNDVI (Green NDVI)

Formula: `GNDVI = (NIR - GREEN) / (NIR + GREEN)`.
Sentinel-2 bands: NIR = B8, GREEN = B3.

- Same pattern as Steps 1–2. This is the simplest of the three — same as your existing NDVI formula with B4 swapped for B3.

## Step 4 — Weather Forecast (Open-Meteo)

Scope for this pass: **display-only on the right "Field stats" panel.** Do NOT wire this into Consult AI or Telegram advisory text yet — but structure the code so that's a small addition later, not a rewrite.

- Use the Open-Meteo forecast API (free, no API key required) — fetch by the field's centroid lat/lng.
- Fetch: a short forecast window (e.g. next 3–5 days) covering precipitation probability/amount and temperature.
- Build a small, isolated fetch/cache module (e.g. `weatherService` or similar, matching existing naming conventions in the codebase) that returns a clean `weatherContext` object — do not scatter the fetch call inline inside a component. This is the seam that makes wiring it into Consult AI/Telegram easy later: whoever builds that later should be able to call the same function and get the same shaped object, rather than re-deriving forecast data from scratch.
- Add a "Forecast" section to the right panel, placed near the existing Rainfall (21-day) section, following the same visual pattern (card/section style, spacing, dark theme colors) already used there.
- Cache the forecast response briefly (e.g. per field, per session, or with a short TTL) to avoid redundant calls if the user reopens the same field repeatedly.
- Verify: select a field, confirm the forecast section renders real data for that field's location, and confirm no errors when the field has no coordinates yet (edge case for newly-drawn fields).

## Step 5 — Final check

- Confirm all three new modes (SAVI, EVI, GNDVI) appear correctly in the Browse Observations toggle group on both desktop and mobile, with no layout overflow.
- Confirm switching between all 7 modes (NDVI, NDWI, LSWI, True Color, SAVI, EVI, GNDVI) works cleanly with no stale state bleeding between them (a known past bug class in this app — check the field detail sidebar updates correctly when scrubbing the date slider in each new mode too).
- Confirm no changes were made to the stress-alert logic, Consult AI prompts, or Telegram worker in this pass.
- Confirm no visual/theme regressions — spacing, colors, and existing components should look untouched aside from the additions described above.
