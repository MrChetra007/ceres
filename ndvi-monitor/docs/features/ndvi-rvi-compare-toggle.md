# NDVI ⇄ RVI Compare Toggle — Implementation Guide

Goal: let the user view NDVI and RVI for the same field + same date range,
and compare them — not just switch blindly, but actually see whether the two
signals agree.

This is written generically since I don't have your `BandPanel`/trend-chart
component code — adapt names/state management (Vuex, Pinia, or local
`ref`/`reactive`) to match what you actually have. Points below flag exactly
where you'll need to plug in your real component/store names.

---

## 1. Decide: toggle or overlay?

Two different UX patterns solve "compare" differently — pick one (or build
both, toggle first, overlay as a stretch goal):

- **Toggle (simpler, ship first):** one band selector, RVI added as another
  option alongside NDVI/NDWI/LSWI/etc. Map and trend chart re-render for
  whichever is selected. You compare by flipping back and forth and eyeballing
  the same date range.
- **Overlay (better for validation, more work):** a dedicated "Compare
  NDVI/RVI" mode that fetches both at once and draws both lines on the same
  trend chart (two y-axes, since NDVI is -0.2..0.8 and RVI is 0..1 — different
  natural ranges, don't share one axis or the shapes will look wrong).

Given your actual goal (validate RVI against ground-truthed NDVI), the
overlay is the one that actually answers your question — the toggle just
gets you there fastest. Recommend: ship the toggle first since it reuses
your existing single-band UI path, then add the overlay as a second view
once the toggle proves the wiring works end-to-end.

---

## 2. Toggle: add RVI as a selectable band

Wherever your current band list lives (likely a `const BANDS = ['ndvi',
'ndwi', 'lswi', 'savi', 'evi', 'gndvi']` or similar array feeding
`BandPanel`'s tabs):

```js
const BANDS = ['ndvi', 'ndwi', 'lswi', 'savi', 'evi', 'gndvi', 'rvi'];
```

Wherever the selected band drives a fetch (probably something like a
`watch`/`computed` on `selectedBand` that calls `getIndexTile` for the map
and `getIndexTimeSeries` for the trend chart), branch on `rvi` specifically,
since RVI uses **different backend actions** than every other band (per the
last addition):

```js
async function fetchTrendForBand(band, geometry, months) {
  if (band === 'rvi') {
    return callEeData({ action: 'getRviTimeSeries', geometry, months });
  }
  return callEeData({ action: 'getIndexTimeSeries', index: band, geometry, months });
}
```

Same split for the map tile fetch if your `getIndexTile` action doesn't
already handle `index: 'rvi'` as a direct request (check — it currently
only produces RVI as an automatic *fallback* when S2 is cloud-blocked, not
as something the user can directly select. If you want RVI directly
selectable on the map too, that's a small addition to
`actionGetIndexTile` — let me know if you want that written up separately).

The trend chart component itself likely doesn't need to change at all for
the toggle case — it's already rendering `points: [{date, value}]` for
whatever band is selected; RVI's points are the same shape (plus the extra
`orbit` field, which the chart can just ignore unless you use it).

---

## 3. Overlay: compare view

New state, separate from the single-band selection:

```js
const compareMode = ref(false); // or your store's equivalent
const ndviPoints = ref([]);
const rviPoints = ref([]);
```

On entering compare mode (or whenever the field/date range changes while
compare mode is active), fetch both in parallel:

```js
async function loadCompareData(geometry, months) {
  const [ndvi, rvi] = await Promise.all([
    callEeData({ action: 'getIndexTimeSeries', index: 'ndvi', geometry, months }),
    callEeData({ action: 'getRviTimeSeries', geometry, months }),
  ]);
  ndviPoints.value = ndvi.points;
  rviPoints.value = rvi.points;
}
```

Chart config — if you're on Chart.js/recharts/similar, use **dual y-axes**,
not one shared axis:

- Left axis: NDVI, range roughly -0.2 to 0.8 (matches your existing NDVI
  `VIS` config: `{min: -0.2, max: 0.8}`)
  Right axis: RVI, range 0 to 1
- Two separate line series, different colors, both plotted against the same
  x-axis (date)
- Since the two series won't share exact dates (S1 ~6-12 day revisit vs S2
  ~5 day), plot each series only at its own actual data points — don't
  interpolate or force them onto a shared date grid, or you'll invent data
  that doesn't exist.

A UI toggle button (`Compare mode: NDVI + RVI` vs your existing compare
mode for split-screen field comparison — name it distinctly, e.g. `Show RVI
overlay`, so it's not confused with your existing split-screen compare
feature) can just flip `compareMode` and swap which fetch/render path runs.

---

## 4. Reading the result once it's live

- Toggle back and forth (or look at the overlay) over the exact window
  around your father's field visit — that's your one point of confirmed
  ground truth so far.
- If RVI trends the same direction as NDVI during the known stress period,
  that's your first real validation signal for the radar fallback.
- If it diverges, check the `orbit` field on the RVI points first (per the
  earlier note) before concluding the radar signal itself is wrong — an
  orbit-mixing artifact will look like a real disagreement but isn't one.
