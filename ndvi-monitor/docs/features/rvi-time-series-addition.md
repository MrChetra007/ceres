# Add RVI Time Series — for NDVI/RVI Comparison

Target file: `supabase/functions/ee-data/index.ts`

Adds a new action, `getRviTimeSeries`, parallel to the existing
`getIndexTimeSeries` (which only handles S2-based indices). Call both with
the same `geometry`/`lat`+`lng` and `months` payload and overlay the two
`points` arrays on one chart to compare NDVI vs RVI over the same window.

---

## 1. Add this function

Insert near `actionGetIndexTimeSeries` (reuses the same RVI math already in
`getRadarVegetationIndex`, just per-scene over a time range instead of one
composite):

```ts
// ── getRviTimeSeries ────────────────────────────────────────────────────
// Radar Vegetation Index over time, from Sentinel-1 GRD — for comparing
// against the optical NDVI trend (actionGetIndexTimeSeries) to validate the
// radar fallback against ground-truthed NDVI. Same RVI formula as
// getRadarVegetationIndex (dB→linear power conversion — required, S1_GRD
// backscatter arrives in dB and RVI must be computed on linear power or the
// ratio saturates flat).
//
// `orbit` (ASCENDING/DESCENDING) is included per point deliberately: RVI can
// differ slightly by pass direction over the same field, so when comparing
// against NDVI, filter to one orbit direction first if the RVI series looks
// noisier than expected — that's often an orbit-mixing artifact, not a real
// signal.
async function actionGetRviTimeSeries(payload: any) {
  const months = payload.months || [];
  if (!months.length) return { points: [] };
  const geom =
    payload.lat != null && payload.lng != null
      ? ee.Geometry.Point([payload.lng, payload.lat])
      : toEeGeometry(payload.geometry);
  const startDate = ee.Date.fromYMD(months[0].year, months[0].month, 1);
  const last = months[months.length - 1];
  const endDate = ee.Date.fromYMD(last.year, last.month, 1).advance(1, "month");

  const s1 = ee
    .ImageCollection("COPERNICUS/S1_GRD")
    .filterBounds(geom)
    .filterDate(startDate, endDate)
    .filter(ee.Filter.eq("instrumentMode", "IW"))
    .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VV"))
    .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VH"));

  const series = s1.map((img: any) => {
    const vvLinear = ee.Image(10).pow(img.select("VV").divide(10));
    const vhLinear = ee.Image(10).pow(img.select("VH").divide(10));
    const rvi = vhLinear.multiply(4).divide(vvLinear.add(vhLinear)).rename("RVI");
    const value = rvi.reduceRegion({
      reducer: ee.Reducer.mean(),
      geometry: geom,
      scale: 10, // matches S1 GRD IW native resolution, same reasoning as NDVI's scale:10
      maxPixels: 1e9,
    });
    return ee.Feature(null, {
      date: img.date().format("YYYY-MM-dd"),
      orbit: img.get("orbitProperties_pass"), // "ASCENDING" | "DESCENDING"
      value: value.get("RVI"),
    });
  });
  const filtered = series.filter(ee.Filter.notNull(["value"]));
  const result = await evaluate(filtered);
  const points = ((result && result.features) || []).map((f: any) => ({
    date: f.properties.date,
    orbit: f.properties.orbit,
    value: f.properties.value,
  }));
  return { points };
}
```

## 2. Register the route

In the `HANDLERS` map, add:

```ts
const HANDLERS: Record<string, Handler> = {
  // ...existing entries...
  getIndexTimeSeries: actionGetIndexTimeSeries,
  getRviTimeSeries: actionGetRviTimeSeries,   // ← add this line
  // ...
};
```

## 3. Frontend call shape

Same payload shape as the existing NDVI trend call, just a different action
and no `index` param needed (RVI is the only thing this action computes):

```js
const [ndvi, rvi] = await Promise.all([
  callEeData({ action: "getIndexTimeSeries", index: "ndvi", geometry, months }),
  callEeData({ action: "getRviTimeSeries", geometry, months }),
]);
// ndvi.points: [{date, cloudPct, value}]
// rvi.points:  [{date, orbit, value}]
```

## 4. What to actually look for when comparing

- **Shape, not point-for-point alignment.** S1 revisit (~6-12 days) and S2
  revisit (~5 days) don't land on the same dates, so overlay as two separate
  line series on a shared date axis rather than trying to pair up individual
  points.
- **Direction of movement should agree** during a real stress event — if
  NDVI drops and RVI stays flat (or vice versa) over the same week, that's
  the actual signal you're testing for, not noise.
- **Split by `orbit` if the RVI line looks jagged** compared to NDVI's — try
  filtering to just `ASCENDING` or just `DESCENDING` points and see if the
  line smooths out. If it does, the two orbit directions have a real offset
  for this field and you may want to pick one as canonical for that field
  rather than mixing both.
