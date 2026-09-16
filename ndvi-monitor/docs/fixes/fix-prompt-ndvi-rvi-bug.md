# Fix: Growth-stage day count and observation count disagree between NDVI and RVI tabs

## Bug summary

When switching the field detail panel from the NDVI tab to the RVI (radar) tab
for the same field and same time-slider position, two numbers change that
should NOT change:

1. **"Day since planting" / growth stage** shows a different day count on RVI
   than on NDVI (e.g. Day 49 vs Day 53).
2. **Observation count** in the chart subtitle shows a very different number
   on RVI than NDVI (e.g. 67 vs 209).

## Root cause

`FieldDetailPanel.vue` has a comment stating growth stage is "planting-date
based, not band-derived, so it stays identical across tabs (intentional)" —
but the actual implementation violates this. The chain is:

```
growthStageDays (computed)
  → asOfDate (computed)
    → selectedSceneDate (computed)
      → activeObservation (computed)
        → reads from state.chartData
```

`state.chartData` is repopulated by `loadChartForGeometry()` in `store.js`
every time the band changes:

```js
if (index === 'rvi') ee.getRviTimeSeriesForGeometry(geometry, activeMonths(), onGeomTrend)
else ee.getIndexTimeSeriesForGeometry(geometry, index, activeMonths(), onGeomTrend)
```

NDVI/NDWI/LSWI all query the same Sentinel-2 collection with the same cloud
filter, so they happen to share scene dates — that's why the "intentional"
comment seemed true before RVI existed. RVI queries a totally different
collection (Sentinel-1, no cloud filter, both orbit directions, different
revisit cadence, and `getRviTimeSeries` deliberately skips the
`dedupeLowestCloud` dedup NDVI gets). So RVI's "latest scene in this month"
lands on a different date than NDVI's, and the growth-stage day count silently
drifts with it.

The observation count (chart subtitle "N observations") is a **separate,
non-bug** issue: it's just `state.chartData.length` for whichever band is
active, and RVI's undeduped every-orbit-pass count is naturally much larger
than NDVI's cloud-filtered deduped count. This isn't wrong data — it's just
mislabeled, since both show as generic "N observations" with no indication
they're counting fundamentally different things.

## What to fix — do this in order, verify after each step

### Step 1 — Add an NDVI-anchored date source in `store.js`

Add a new reactive field to `state` (or a separate small reactive object) that
holds the most recent NDVI/optical observation date for the currently loaded
field/point, independent of which band tab is active. Populate it ONLY from
the NDVI (optical) fetch path — never from the RVI fetch path.

The cleanest place to set it: wherever `state.chartData` is currently set
inside `loadChartForGeometry()`'s `onGeomTrend` callback and
`loadChartForPoint()`'s `onPointTrend` callback, add a parallel branch that
also updates this NDVI-anchored value whenever `index !== 'rvi'`.

Concretely:
- Add `ndviChartData` (or `ndviAsOfDate` if you'd rather store just the
  resolved date) to `state` in `store.js`.
- In `onGeomTrend` / `onPointTrend`, when `index !== 'rvi'`, also assign this
  new field alongside the existing `state.chartData = data` assignment.
- Do NOT update it when `index === 'rvi'`.

### Step 2 — Repoint `growthStageDays` in `FieldDetailPanel.vue` to the NDVI-anchored source

Currently `selectedSceneDate` → `activeObservation` reads from
`state.chartData` (whatever band is active). Change the date resolution used
specifically for `growthStageDays` (and anything else that must stay
band-independent, like the Stage card) to read from the new
`state.ndviChartData` / `state.ndviAsOfDate` instead of the generic
`state.chartData`.

Do NOT change `heroValue`, `heroStatus`, or the chart itself — those SHOULD
still reflect whatever band is currently selected. Only the growth-stage /
day-count logic needs to be pinned to NDVI.

Verify: switch between NDVI, NDWI, LSWI, and RVI tabs for the same field at
the same slider position. The "Day X since planting" and growth stage name
must now stay identical across all four tabs. The hero value badge should
still correctly change per band as before.

### Step 3 — Fix the misleading "N observations" label

Don't try to make the counts match — they're legitimately counting different
things. Instead, make the label honest. In `store.js`, wherever
`state.chartSubtitle` is built with `observationCount(...)`, pass through
which source is being counted (e.g. "67 Sentinel-2 scenes" vs "209 Sentinel-1
passes") so the UI doesn't imply they're the same kind of number.

Check `observationCount()` in `services/format.js` — it currently just takes
a language and a count. Extend it to optionally take a source/index name, or
add a small suffix when `state.currentIndex === 'rvi'` at the call site in
`store.js` (both places: `loadChartForPoint` and `loadChartForGeometry`).

Verify: the chart subtitle when viewing NDVI should say something like
"67 Sentinel-2 observations"; when viewing RVI it should say something like
"209 Sentinel-1 passes" — clearly distinguishing the source, not just showing
two very different bare numbers under an identical label.

### Step 4 — Regression check

After Steps 1–3, re-test the full flow on a real field:
1. Load a field, confirm NDVI tab shows correct Day X / growth stage /
   observation count with the Sentinel-2 label.
2. Switch to RVI — confirm Day X and growth stage are UNCHANGED from step 1,
   hero value updates to the RVI reading, and the observation count now shows
   the Sentinel-1 label with its own (larger) count.
3. Switch to NDWI and LSWI — confirm Day X / growth stage still match step 1
   exactly (these were already correct before, just re-verify no regression).
4. Scrub the time slider a few months back on RVI — confirm Day X still
   tracks correctly relative to the scrubbed date, not just at "today".
5. Check the console log in `growthStageDays` (the `[daysSincePlanting]` log)
   — its `source` field should now say something like "NDVI-anchored
   observation" rather than pointing at RVI data when RVI is the active tab.

## Constraints

- Do not change how NDVI/NDWI/LSWI resolve their own hero values or charts —
  only touch the day-count/growth-stage resolution path and the observation
  count label.
- Do not remove the `dedupeLowestCloud` skip for RVI — that's intentional and
  documented, keep it as-is.
- Keep the existing `[daysSincePlanting]` console log for debugging, just
  update what `source` it reports.
