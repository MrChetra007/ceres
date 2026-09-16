# Redesign: Observations panel → horizontal day-strip above the mode selector

## What this is
Pure UI/UX restyle + a small behavior change to when the panel opens. No new
data, no `ee-data` changes, no new store logic beyond the AOI-fallback fix
already agreed separately. Reuses `state.observations` (from
`fetchObservations()`/`getObservations`) and the existing
`jumpToObservationDate(dateStr)` click handler as-is.

## Why
Right now the Observations panel only opens when the user manually clicks the
"Observations" button in the header. Most users never discover it, even
though selecting a field already fetches this data and marks the relevant
months on the time slider (the blue observation bands) — the marker exists
but nothing tells the user why, or that clicking "Observations" would explain
it. Surfacing it automatically, in a spot that's contextually attached to the
thing it explains (the mode selector, where the user is already looking at
NDVI/NDWI/LSWI), fixes the discoverability gap without adding a new feature.

## Changes

### 1. Remove the header "Observations" button entirely
Currently a nav-row button toggles `state.observationsVisible`. Delete this
button. Visibility is now driven by field-selection (see #3) plus the panel's
own open/close control (see #2) — nothing in the header controls it anymore.

### 2. New layout: horizontal day-strip, docked above the mode selector
Replace the current vertical scrolling table (DATE / SOURCE / CLOUD / STATUS
/ NDVI columns) with a horizontally scrollable row of day-columns, positioned
directly above the existing bottom mode-selector bar (the "Latest Satellite
View | NDVI NDWI LSWI True Color | Street Satellite | AREA" row) — same
general area, stacked on top of it, not replacing it.

Each day-column shows, compactly:
- The date
- A cloud icon whose fill/weight reflects `cloudCover` (e.g. a faint/clear
  icon for low cloud, a heavy/solid cloud icon as it approaches 100%) —
  replacing the current text badge ("Clear" / "Cloud-blocked" pill) with a
  glanceable icon, matching the reference screenshot's cloud-icon-per-day
  approach
- Keep NDVI value as small secondary text under/beside the date where space
  allows; drop the SOURCE column (it's always "Sentinel-2" today, not worth a
  column)
- The currently-selected date (matching `state.mainMonth`'s underlying
  observation, if any) visually highlighted, same idea as the reference
  screenshot's highlighted selected day

Include a small collapse/expand control on the strip itself (e.g. a chevron
or an "×" on one edge) — this replaces the header button as the only way to
close it manually now that the header button is gone. Clicking a day-column
still calls `jumpToObservationDate(dateStr)`, unchanged.

Horizontal scrolling: left/right arrow affordances or native scroll — either
is fine, match whatever scrolling pattern the rest of the app's horizontal UI
already uses if one exists, for consistency.

### 3. Auto-open on field selection, not on AOI view

- When a field is loaded (`loadField(field)` succeeds — i.e. right after
  `state.currentFieldId`/`currentGeometry.value` are set for a real field),
  set `state.observationsVisible = true` automatically.
- When no field is selected (AOI-only view, including right after
  `clearFieldSelection()`), leave `state.observationsVisible` as whatever the
  user last set it to via the strip's own collapse control — do NOT force it
  open in this case. The AOI-fallback fix (separate, already agreed) means
  the strip still *works* without a field selected if the user opens it
  manually; it just doesn't auto-open there.
- `clearFieldSelection()` does not need to force `observationsVisible` closed
  either — leave the user's toggle state alone when they deselect, don't
  fight their last manual choice.

### 4. Don't touch

- `fetchObservations()`'s data-fetching logic, dedup-by-field-and-range
  guard, or the AOI-fallback change — that's a separate, already-scoped fix.
- `jumpToObservationDate()` — reused as-is.
- The blue observation-month bands on the time slider — those stay, this
  redesign is what explains them, not a replacement for them.
- The mode selector bar itself (NDVI/NDWI/LSWI/True Color/Street/Satellite/
  AREA) — the strip sits above it, doesn't restructure it.

## Done when

- No "Observations" button exists in the header.
- Selecting a field shows the day-strip automatically, positioned above the
  mode selector, in a horizontal row of day-columns with cloud icons.
- The strip can be collapsed/expanded via its own control.
- Clicking a day-column still jumps the map to that date, unchanged from
  today's behavior.
- Viewing the AOI (no field selected) does not auto-open the strip, but the
  user can still open it manually if they choose to.
