# UI Fix: Panel Overlay Blocking Map + Bottom Sheet Content

## Context
Following the previous collapsible-panel redesign, two issues need fixing before this ships. This is a **bug fix + content relocation** — no visual redesign beyond what's described below.

## Bug 1: Overlay blocks map interaction when a side panel is open
When the left (Settings) or right (NDVI Trend/field stats) drawer is expanded, something behind/around the panel is intercepting clicks — the user cannot click on the map or the field polygon underneath while a panel is open, even in areas of the screen the panel doesn't visually cover.

**Likely cause:** a full-screen invisible backdrop/overlay `div` (often added for "click outside to close" behavior) is sitting on top of the map with `pointer-events: auto` and a high z-index covering the *entire* viewport, not just the area outside the panel.

**Fix required:**
- Remove any full-viewport backdrop element used for the drawers, OR scope it so it never intercepts clicks over the map/canvas area.
- "Click outside to close" (if implemented) should be done via a document-level click listener checking if the click target is outside the panel ref — NOT via a transparent full-screen overlay div.
- After the fix: with either side panel open, the user must be able to click/select fields on the map normally, exactly as when both panels are collapsed.
- Also check for and remove any duplicate/orphaned panel instances currently rendering (e.g. a stray duplicate "NDVI Trend" card appears floating separately from the main right panel in the current build — this should not exist; there should be exactly one instance of each panel).

## Bug 2/Feature: Move mode selection + observation days into the bottom sheet
The bottom pull-up sheet is currently a placeholder (renders literal text like "SHEET.PULL_UP") and the real controls (NDVI/NDWI/LSWI/True Color mode toggle, Street/Satellite basemap toggle, and the "Browse Observations" thumbnail/day-picker strip) are still docked separately below/outside it.

**Fix required — move these into the bottom sheet's two sections (per the original spec):**
- **Top section ("Observe"):** the existing "Browse Observations" thumbnail/timeline strip (date thumbnails with NDVI mini previews, horizontal scroll).
- **Bottom section ("Mode selection"):** the existing NDVI / NDWI / LSWI / True Color toggle group, plus the Street/Satellite basemap toggle.
- These two sections stay visually separated by a horizontal divider, stacked vertically, inside the single collapsible bottom sheet.
- Remove the placeholder text entirely — replace with the real components moved in, not new ones.
- Collapsed state: only the small `^` pull-tab is visible at the bottom center, same as before.
- Expanded state: sheet slides up to reveal both sections.
- No change to the underlying logic/data/API calls used by the observation strip or mode toggle — only their container location moves.

## Non-goals
- Do not change left/right panel content or layout further beyond fixing the overlay bug.
- Do not change map rendering, NDVI heatmap logic, or any store/API behavior.
- Do not restyle colors/fonts — reuse existing Tailwind classes from the moved components as-is.

## Deliverables
- Fix the click-blocking overlay so the map remains fully interactive with any panel open.
- Remove duplicate panel rendering if present.
- Relocate mode-selection + observation-days components into the bottom sheet's two sections, replacing the placeholder.
- List every file changed at the end of your response.
