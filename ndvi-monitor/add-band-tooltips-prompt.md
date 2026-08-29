# Task: Add hover tooltips to the band/index tab bar (NDVI, NDWI, LSWI, SAVI, EVI, GNDVI, True Color)

## Context
This is the Ceres app (Vue 3 + Vite, dark "satellite dashboard" design system). There's a tab bar
component — likely `BandPanel.vue` from the Stage 1 redesign (alongside TopBar, TimeControl,
MapLegend) — that renders buttons for each band/index mode: NDVI, NDWI, LSWI, SAVI, EVI, GNDVI, and
True Color. Users (co-op staff, extension officers, non-technical farmers) don't know what these
acronyms mean at a glance, so each tab needs an on-hover tooltip explaining it in plain language.

## Goal
On hover (and on focus, for keyboard/accessibility), show a small tooltip near each tab button with
a short plain-language explanation of what that mode shows.

## Requirements

1. **Find the component.** Locate the tab bar component that renders the NDVI/NDWI/LSWI/SAVI/EVI/GNDVI/True
   Color buttons (likely `src/components/BandPanel.vue` or similar — search the codebase for the
   button labels if the filename doesn't match). Do not guess the file — confirm it exists first.

2. **Build a reusable `Tooltip.vue` wrapper**, not a one-off inline tooltip, since we'll likely reuse
   it elsewhere (e.g. legend swatches, stat labels) later.
   - CSS-only positioning/visibility is preferred over a JS library — no new dependency.
   - Props: `text` (string, the tooltip content) and optionally `position` (`top` | `bottom`, default `top`).
   - Trigger on `:hover` AND `:focus-visible` on the wrapped element (keyboard accessibility — a
     button that only shows a tooltip on mouse hover fails for keyboard users).
   - Small delay (~150-300ms) before showing, to avoid flicker on fast mouse movement across the tab bar.
   - Dismiss immediately on mouseleave/blur (no delay needed on hide).
   - Should not intercept click events on the wrapped button — the tab must still be clickable normally.
   - Use a `<slot>` so it wraps existing tab buttons without changing their markup/behavior.

3. **Style to match the existing dark design system.** Use the same CSS custom properties/design
   tokens already defined in the app's theme (check `src/styles` or wherever the Stage 1 design
   tokens live — background, border, text color variables) instead of hardcoding new colors. Keep
   the tooltip compact: small font size, max-width ~220px so it wraps into 2-3 short lines rather
   than a single long line, subtle border/shadow consistent with the rest of the dashboard chrome.

4. **Wire it into the tab bar** — wrap each of the seven tab buttons with `<Tooltip :text="...">`,
   using this copy (edit for tone/length if it clashes with existing UI copy style, but keep the
   core meaning):

   | Tab | Tooltip text |
   |---|---|
   | NDVI | Overall vegetation health and greenness |
   | NDWI | Detects surface water and flooding |
   | LSWI | Soil and vegetation moisture content |
   | SAVI | Vegetation health, adjusted for bare soil in sparse crops |
   | EVI | Vegetation density, corrected for haze and canopy shadow |
   | GNDVI | Vegetation health, more sensitive to chlorophyll/nitrogen |
   | True Color | Real satellite photo — no index calculation |

5. **Mobile/touch consideration:** hover doesn't exist on touch devices. Either (a) leave tooltips as
   a desktop-only enhancement (acceptable for now, note this as a known limitation in a code comment),
   or (b) if there's an existing "help panel" or info-icon pattern already in the app (check the
   roadmap — there's a help panel mentioned as done), point to that instead for touch users. Don't
   over-engineer a tap-to-show solution unless asked.

## Deliverables
- New `Tooltip.vue` component.
- Updated tab bar component with all seven tabs wrapped and tooltip copy wired in.
- Brief note on where the design tokens were sourced from and whether any new CSS variables were added.

## Out of scope
- Don't touch tab click/selection logic, index-loading logic, or any Earth Engine/ee-data code.
- Don't add a tooltip library dependency (Floating UI, Tippy, etc.) — this should stay lightweight and CSS-driven.
- Don't change the tooltip copy's underlying index math or add new tabs.
