# Follow-up fix: hero subtitle still shows band-dependent Day count

## Status

The previous fix worked for the **Growth Stage card** — `growthStageDays` now
correctly stays anchored to NDVI and shows the same Day count across all
bands. The observation-count label fix also worked correctly (now shows
"67 Sentinel-2 scenes" vs "209 Sentinel-1 passes").

## Remaining bug

The **hero subtitle** (the small line right under the big index value, e.g.
"Stem Elongation / Booting · Day 53 · NDVI 0.73") still shows the OLD
band-dependent day count on the RVI tab, even though the Growth Stage card
below it now correctly shows the right day count. Same field, same slider
position, two different Day numbers displayed at once.

## Root cause

In `FieldDetailPanel.vue`, `stageText` has its own separate resolution path
that was NOT updated by the last fix:

```js
const stageText = computed(() => {
  if (monthStatus.value && monthStatus.value.stageLabel) return monthStatus.value.stageLabel
  const st = status.value
  ...
  const days = growthStageDays.value   // already fixed, but only used in the ELSE branch
  ...
})
```

`stageText` checks `monthStatus.value` FIRST, and only falls back to the
(now-fixed) `growthStageDays` in the second branch. `monthStatus` is built
from `activeObservation`, which still reads from the per-band `state.chartData`
— so on the RVI tab, `monthStatus.stageLabel` is still computed with the RVI
scene date, and that branch wins before the fixed fallback ever runs.

## Fix

`monthStatus` (in `FieldDetailPanel.vue`) currently does this:

```js
const monthStatus = computed(() => {
  const f = currentField.value
  const obs = activeObservation.value
  if (!f || !obs || obs.value == null) return null
  return store.buildStatusObject(f, obs.value, state.currentIndex, asOfDate.value)
})
```

`buildStatusObject(field, value, index, asOfDate)` takes `asOfDate` as an
explicit parameter — that's exactly where the band-dependent date is leaking
in, since `asOfDate.value` resolves through `selectedSceneDate` →
`activeObservation` → `state.chartData` (band-dependent).

Change `monthStatus` to pass the SAME NDVI-anchored date that
`growthStageDays` now uses (the `state.ndviChartData` / `state.ndviAsOfDate`
value added in the previous fix), instead of the generic `asOfDate.value`,
when building the day-count portion of the stage label. The hero `value`
(`obs.value`) itself should still come from whatever band is active — only
the DATE used to compute "Day X" inside `buildStatusObject` needs to be
NDVI-anchored.

Concretely: add a new computed (e.g. `ndviAnchoredAsOfDate`) that reads from
the NDVI-anchored state field from the last fix, with the same fallback chain
`asOfDate` already has (per-scene observation → last clear reading → month-end
fallback), just sourced from the NDVI series instead of `state.chartData`.
Pass THIS into `store.buildStatusObject(...)` inside `monthStatus`, instead of
the current `asOfDate.value`.

## Verify

1. Load a field, note the hero subtitle Day count on NDVI (e.g. Day 49).
2. Switch to RVI — hero subtitle Day count AND Growth Stage card Day count
   must now both show Day 49 (matching, not just the Growth Stage card).
3. Switch to NDWI and LSWI — same Day count should hold across all four tabs.
4. Scrub the time slider back a couple months on RVI — confirm both Day
   counts still move together and stay correct relative to the scrubbed date.
5. Confirm the hero INDEX VALUE (0.731 / 1.015 / etc.) still correctly
   reflects whichever band is selected — only the Day count should be pinned,
   not the reading itself.
