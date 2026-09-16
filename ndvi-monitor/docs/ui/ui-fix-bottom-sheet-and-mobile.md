# UI Fix: Bottom Sheet Styling, Dropdown Clipping, and Mobile Rendering Bugs

## Context
Follow-up fixes to the bottom sheet and right panel from the previous redesign passes. These are bug fixes and small styling adjustments — no new features, no changes to underlying data/logic.

---

## Fix 1: Bottom sheet styling (desktop)
The bottom sheet (pull-tab + "Browse Observations" + mode/basemap row) currently spans full viewport width and sits flush against the bottom edge of the screen.

**Required changes:**
- Add bottom margin/padding so the sheet floats above the bottom edge of the viewport (don't let it touch edge-to-edge), consistent with how the pull-tab and the top "August 2026" scene card already float with spacing.
- Change width from `100%` to `auto` (size to content instead of stretching full width).
- Horizontally center the sheet in the viewport.
- This applies to both the collapsed pull-tab and the expanded sheet state.

## Fix 2: AREA dropdown clipped/hidden behind sheet
When the user clicks the "AREA" selector inside the bottom sheet's mode-selection row, the resulting dropdown/popover (showing the area list and "+ New area") renders **behind or clipped by** the bottom sheet container — its top portion is cut off and part of it is hidden.

**Likely cause:** the bottom sheet container has `overflow: hidden` (or similar) clipping children that try to render outside its bounds, and/or the dropdown's z-index is lower than sibling elements in the sheet.

**Required fix:**
- Ensure the AREA dropdown renders fully visible, on top of all other sheet content, not clipped by any parent `overflow` rule.
- Use a portal/teleport for the dropdown if that's the simplest way to escape the sheet's overflow/z-index context (consistent with however other dropdowns/popovers in the app already handle this, if applicable).
- Verify no other popovers inside the bottom sheet have the same clipping issue.

## Fix 3: Right panel (NDVI Trend / field stats) broken on mobile
On mobile viewports, opening the right panel renders as a large modal covering nearly the full screen, but most of the panel is empty black space — the NDVI Trend chart does not render (blank area where the chart should be).

**Likely cause:** the chart component is sized based on a fixed/desktop-assumed width and either fails to render or renders at zero/invalid width in the mobile container.

**Required fix:**
- Make the chart component responsive so it correctly sizes to its actual container width on mobile (recalculate/resize on mount and on viewport resize, not just once at a fixed desktop width).
- Verify the chart renders correctly at common mobile widths (test at ~360–420px container width).
- The panel's overall height/scroll behavior on mobile should also be checked — content below the chart (rainfall, metadata, etc.) should be reachable via scroll within the panel, not require an oversized empty panel.

## Fix 4: Placeholder text still present on mobile
The bottom sheet on mobile still shows the literal placeholder text `SHEET.PULL_UP` instead of the real pull-tab UI. This was already fixed for desktop in a previous pass — the mobile layout is either using a separate/duplicate component that wasn't updated, or a responsive breakpoint is falling back to the old placeholder.

**Required fix:**
- Locate wherever `SHEET.PULL_UP` (or equivalent placeholder string) still exists in the codebase and confirm it is not reachable in any viewport, mobile included.
- If mobile and desktop use separate sheet components, apply the same real pull-tab treatment to both, or better, share a single responsive component so this class of bug can't recur.

## Fix 5: Bottom sheet overlaps map controls on mobile
On mobile, the bottom sheet (and its pull-tab) sits directly against the map's zoom controls (+/−) and pan/area-navigation arrows with no spacing, unlike the padded, floating treatment being added for desktop in Fix 1.

**Required fix:**
- Apply equivalent spacing/padding rules on mobile so the bottom sheet does not visually collide with the zoom controls or navigation arrows.
- The sheet can remain full-width on mobile if that's more usable on a narrow screen (unlike Fix 1's `auto` width for desktop) — but it must not overlap other floating UI elements. Add safe margin around it instead.

## Non-goals
- Do not change chart data, API calls, or store logic — only rendering/sizing behavior.
- Do not change desktop layout beyond Fix 1 and Fix 2.
- Do not redesign mobile layout further than fixing the specific overlaps/bugs listed.

## Deliverables
- Fix all five items above.
- Confirm behavior by checking both desktop and mobile viewport sizes after the fix.
- List every file changed at the end of your response.
