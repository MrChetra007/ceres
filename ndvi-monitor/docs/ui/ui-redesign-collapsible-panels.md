# UI Redesign: Collapsible Side Panels + Bottom Sheet

## Goal
Redesign the main map screen layout so the **map is full-bleed** at all times, and the three existing UI panels (left settings/fields panel, right field-stats panel, bottom observations/mode bar) become **collapsible drawers** that default to a minimized edge tab and expand on demand. This is a **visual/structural redesign only** — no data, logic, or feature changes. All existing content, components, and functionality must be preserved exactly as-is; only how they are shown/hidden changes.

Stack: Vue 3 + Tailwind CSS. Keep it desktop-first for now (no mobile breakpoint work needed yet).

## Current state
- Left panel ("Settings" + "Monitored Fields" list) is permanently pinned open, fixed width (~300px), always visible, pushing/overlaying the map.
- Right panel (field stats: NDVI value, growth stage, stress alert, Consult AI button, NDVI trend chart, rainfall, field metadata, field photos) is permanently pinned open on the right, always visible.
- Bottom bar ("Browse Observations" thumbnail timeline + NDVI/NDWI/LSWI/True Color mode toggle + Street/Satellite toggle) is permanently pinned at the bottom, always visible.

## Target state

### 1. Left drawer (Settings + Monitored Fields)
- Default: **collapsed** to a thin vertical tab flush with the left edge of the screen, showing a `>` chevron icon only.
- Clicking the tab **slides the panel open** (same width/content as today), chevron flips to `<`.
- Clicking the `<` (or clicking the tab again) collapses it back to the thin edge tab.
- All existing content inside (Settings menu, Base layer toggle, Export options, Telegram alerts, Help, Language, Sign out, Monitored Fields search + list, "Draw / Add New Field Boundary" button) stays unchanged — just wrapped in the new collapsible container.

### 2. Right drawer (Field stats panel)
- Same collapse/expand behavior, mirrored on the right edge (`<` when collapsed, tab flips to `>` when open... i.e. arrow always points toward the direction the panel will open).
- All existing content (NDVI score card, growth stage, stress alert, Consult AI button, trend chart, rainfall, field metadata, field photos) stays unchanged inside the drawer.

### 3. Bottom sheet (Observe + Mode selection)
- Default: **collapsed** to a small centered pull-tab at the bottom edge with a `^` chevron.
- Clicking the tab (or dragging up, if trivial to add) expands the sheet upward, revealing two stacked sections separated by a horizontal divider:
  - **Top section ("Observe")**: the existing "Browse Observations" thumbnail/timeline strip, unchanged.
  - **Bottom section ("Mode selection")**: the existing NDVI/NDWI/LSWI/True Color toggle + Street/Satellite basemap toggle, unchanged.
- Clicking the tab again (chevron flips to `v`) collapses the sheet back down to just the pull-tab.

### 4. Map
- Becomes the base layer filling the entire viewport at all times (no longer resized/pushed by the side panels — panels overlay on top of it, semi-opaque background if needed for readability, matching current panel styling).
- Top header bar (search, Compare, user menu, sign out) stays fixed and unchanged.

## Interaction rules
- Only one side drawer (left or right) needs to be open at a time is NOT required — both can be open simultaneously if the user expands both.
- Opening/closing should animate with a smooth slide transition (200–300ms), not an instant snap.
- Preserve all existing Tailwind class-based styling/colors from the current components — only change the wrapping layout/positioning, not the visual theme.

## Deliverables
- Refactor the relevant Vue components to add collapsible wrapper behavior (new `CollapsiblePanel` or similar reusable component is fine if it reduces duplication).
- Do not change any prop/emit contracts, API calls, or store logic used by the inner content components.
- List every file changed/added at the end of your response.
