# Follow-up fix: Monitored Fields sidebar list shows wrong Day count

## Status

Detail panel is now fully fixed — Growth Stage card and hero subtitle both
correctly show Day 49 across NDVI/RVI/NDWI/LSWI tabs.

## Remaining bug

The left "Monitored Fields" sidebar list still shows the OLD day count for
the same field, at the same moment: sidebar card says "Day 53", detail panel
says "Day 49" — both looking at "Central Valley, rice filed", same NDVI 0.73
reading, same screenshot.

## Root cause

The sidebar list is populated by `refreshAllFieldStatuses()` in `store.js`,
which calls:

```js
ee.getAllFieldStatuses(payload, state.currentIndex, (statuses) => {
  statuses.forEach(({ id, value, count, date, cloudBlocked }) => {
    ...
    fieldStatus[id] = {
      ...buildStatusObject(field, value, state.currentIndex),
      ...
    }
  })
})
```

Note `buildStatusObject(field, value, state.currentIndex)` is called with
only 3 arguments — no `asOfDate` passed. Inside `buildStatusObject`:

```js
export function buildStatusObject(field, value, index, asOfDate) {
  ...
  const asOf = asOfDate ? new Date(asOfDate).getTime() : Date.now()
  const daysSincePlanting = Math.floor((asOf - new Date(field.plantingDate).getTime()) / 86400000)
  ...
}
```

When `asOfDate` is omitted, it silently falls back to `Date.now()` — the
REAL current calendar day, not the scene date the value/reading is actually
from. `value` here comes from `getAllFieldStatuses`, which resolves to
whatever the most recent EE scene is for that field (could be several days
old) — so the day count is being computed against "today" while the value
displayed is from an older date. That mismatch is what produces "Day 53"
in the sidebar vs "Day 49" in the detail panel (which correctly uses the
scene's own date via the earlier fix).

## Fix

In `store.js`, `refreshAllFieldStatuses()`'s callback already receives `date`
per field from `ee.getAllFieldStatuses(...)` — that's the actual scene date
the `value` came from. Pass it through to `buildStatusObject` as the
`asOfDate` argument instead of leaving it undefined:

```js
fieldStatus[id] = {
  ...buildStatusObject(field, value, state.currentIndex, date),
  value, count, date: date || null, cloudBlocked: !!cloudBlocked,
}
```

Do the same check in `updateFieldStatus(field)` (the single-field version) —
it has the identical pattern and likely the identical bug:

```js
fieldStatus[field.id] = {
  ...buildStatusObject(field, value, state.currentIndex),
  value, count, date: date || null, cloudBlocked: !!cloudBlocked,
}
```

Change this one too, passing `date` as the 4th argument.

## Verify

1. Open the app, don't select any field (sidebar list view).
2. Compare the Day count shown on each field's sidebar card against that same
   field's detail panel Day count after opening it — they must now match.
3. Confirm this holds for a field whose most recent clean scene is NOT today
   (e.g. a few days stale) — the sidebar should show the day count as of that
   scene's date, not today's calendar date.
4. Re-check the "srea sdav" field's card too (visible in the same sidebar) —
   apply the same verification there.
