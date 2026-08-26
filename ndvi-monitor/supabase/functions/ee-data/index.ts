// ee-data — Earth Engine proxy for the interactive map.
//
// The browser never talks to Earth Engine directly anymore (the old
// ee.data.authenticateViaOauth popup only worked for EE-registered Google
// accounts). Every frontend EE call is routed through this function, which
// authenticates with the SAME service account secret the ee-alerts-worker
// uses (EE_SERVICE_ACCOUNT_KEY) and returns computed results or short-lived
// tile URLs. The tile URLs themselves are signed by Earth Engine and are safe
// for an unauthenticated browser to fetch directly.
//
// Auth: relies on the platform gateway's JWT verification (verify_jwt = true,
// the default — see config.toml; only telegram-webhook opts out), so any
// signed-in app user may call it and anonymous callers are rejected before
// this code runs.
//
// Actions are dispatched via the `action` field in the POST body. The cloud
// policy (<40 clean / >=40 cloud-blocked, true-color fallback, Sentinel-1 RVI
// radar fallback, 90-day lookback) is ported verbatim from
// src/services/earthEngine.js — behavior unchanged, only where it runs.

import ee from "npm:@google/earthengine@0.1.395";
import { statusFromNdvi } from "../_shared/growthStage.ts";

const EE_KEY = JSON.parse(Deno.env.get("EE_SERVICE_ACCOUNT_KEY") || "{}");
const APP_URL = Deno.env.get("APP_URL") || "*";

// ── Index/visualization config (mirrors src/config.js INDICES) ────────────
const BANDS: Record<string, string[]> = {
  ndvi: ["B8", "B4"],
  ndwi: ["B3", "B8"],
  lswi: ["B8", "B11"],
};
const VIS: Record<string, Record<string, unknown>> = {
  ndvi: { min: -0.2, max: 0.8, palette: ["red", "yellow", "green"] },
  ndwi: {
    min: -1,
    max: 1,
    palette: ["brown", "tan", "#e0f0ff", "#4a90d9", "#003366"],
  },
  lswi: { min: -0.3, max: 0.6, palette: ["tan", "lightblue", "darkblue"] },
};
const TRUE_COLOR_BANDS = ["B4", "B3", "B2"];
// Wide stretch so bright cloud-free areas of a rice scene don't clamp to a
// single saturated green block (same reasoning as the frontend TRUE_COLOR_VIS).
const TRUE_COLOR_VIS = { min: 0, max: 5000 };
const DRY_MONTH_THRESHOLD = 50;

const corsHeaders = {
  "Access-Control-Allow-Origin": APP_URL,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

// ── Earth Engine init (cached per isolate, refreshed before token expiry) ──
// Module-scope state: runs ONCE per warm function instance, not once per
// request. Concurrency-safe — the check-and-set below is synchronous, so
// requests arriving during startup all await the same in-flight init promise.
async function initEE(): Promise<void> {
  const t0 = performance.now();
  await new Promise<void>((resolve, reject) => {
    ee.data.authenticateViaPrivateKey(
      EE_KEY,
      () =>
        ee.initialize(null, null, () => resolve(), (e: string) =>
          reject(new Error(e))),
      (e: string) => reject(new Error(e)),
    );
  });
  console.log(
    `[ee-data] EE session initialized in ${Math.round(performance.now() - t0)}ms`,
  );
}

let eeReady: Promise<void> | null = null;
let eeReadyAt = 0;
// Service-account JWT-bearer grants return ONLY an access token (expires_in
// ~3600s, no refresh token), so a warm isolate's session silently dies after
// an hour. Re-auth well before expiry instead of serving failures.
const EE_INIT_TTL_MS = 45 * 60 * 1000;

function ensureEE(): Promise<void> {
  if (!eeReady || Date.now() - eeReadyAt > EE_INIT_TTL_MS) {
    eeReadyAt = Date.now();
    eeReady = initEE().catch((e) => {
      // Don't cache failures — the next request retries authentication
      // instead of permanently holding a rejected promise.
      eeReady = null;
      throw e;
    });
  }
  return eeReady;
}

// ── Promise helpers around the callback-style JS client ───────────────────
function evaluate(obj: any): Promise<any> {
  return new Promise((resolve, reject) =>
    obj.evaluate((res: any, err: string) =>
      err ? reject(new Error(err)) : resolve(res),
    ),
  );
}

function getMapUrl(obj: any, vis: any): Promise<string> {
  return new Promise((resolve, reject) =>
    obj.getMap(vis, (mapId: any, err: string) =>
      err || !mapId || !mapId.urlFormat
        ? reject(new Error(String(err || "getMap failed")))
        : resolve(mapId.urlFormat),
    ),
  );
}

function toEeGeometry(geojson: any) {
  const geometry =
    geojson && geojson.type === "Feature" ? geojson.geometry : geojson;
  if (
    !geometry ||
    !geometry.type ||
    geometry.coordinates == null ||
    (geometry.type !== "Point" && !geometry.coordinates.length)
  ) {
    throw Object.assign(new Error("invalid_geometry"), { code: 400 });
  }
  return ee.Geometry(geometry);
}

function s2Collection(geom: any, start: any, end: any) {
  return ee
    .ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
    .filterBounds(geom)
    .filterDate(start, end)
    .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 40));
}

function tsToISO(ts: any): string | null {
  return ts == null ? null : new Date(ts).toISOString().slice(0, 10);
}

// ── getIndexTile ───────────────────────────────────────────────────────────
// Port of loadIndexTile(): monthly composite per index, with radar fallback,
// true-color cloud-blocked fallback and no-data detection.
async function getLastValidDate(geom: any, monthStart: any): Promise<string | null> {
  const lookback = monthStart.advance(-90, "day");
  const prior = s2Collection(geom, lookback, monthStart).sort(
    "system:time_start",
    false,
  );
  const n = await evaluate(prior.size());
  if (!n) return null;
  const ts = await evaluate(prior.first().get("system:time_start"));
  return tsToISO(ts);
}

async function getRadarVegetationIndex(geom: any, startDate: any, endDate: any) {
  const s1 = ee
    .ImageCollection("COPERNICUS/S1_GRD")
    .filterBounds(geom)
    .filterDate(startDate, endDate)
    .filter(ee.Filter.eq("instrumentMode", "IW"))
    .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VV"))
    .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VH"));
  const count = await evaluate(s1.size());
  if (!count) return { count: 0, url: null };
  const composite = s1.median().clip(geom);
  // S1_GRD backscatter arrives in dB (log scale); RVI must be computed on
  // LINEAR power or the ratio saturates into a flat image.
  const vvLinear = ee.Image(10).pow(composite.select("VV").divide(10));
  const vhLinear = ee.Image(10).pow(composite.select("VH").divide(10));
  const rvi = vhLinear
    .multiply(4)
    .divide(vvLinear.add(vhLinear))
    .rename("RVI");
  const url = await getMapUrl(rvi, {
    min: 0,
    max: 1,
    palette: ["blue", "white", "green"],
  });
  return { count, url };
}

async function actionGetIndexTile(payload: any) {
  const index = payload.index && BANDS[payload.index] ? payload.index : "ndvi";
  const bands = BANDS[index];
  const vis = VIS[index];
  const geom = toEeGeometry(payload.geometry);
  const start = ee.Date.fromYMD(payload.year, payload.month, 1);
  const end = start.advance(1, "month");

  const rawCollection = ee
    .ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
    .filterBounds(geom)
    .filterDate(start, end);
  const cleanCollection = rawCollection.filter(
    ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 40),
  );
  const count = await evaluate(cleanCollection.size());

  if (count > 0) {
    const composite = cleanCollection
      .median()
      .clip(geom)
      .normalizedDifference(bands)
      .rename(index.toUpperCase());
    const url = await getMapUrl(composite, vis);
    return { mode: "index", count, url };
  }

  const rawCount = await evaluate(rawCollection.size());
  if (rawCount === 0) return { mode: "no_data", count: 0, url: null };

  // Cloud-blocked — try the Sentinel-1 radar fallback first (sees through
  // clouds; ±15-day window covers S1's ~6-12 day revisit).
  try {
    const radar = await getRadarVegetationIndex(
      geom,
      start.advance(-15, "day"),
      end.advance(15, "day"),
    );
    if (radar.count > 0 && radar.url) {
      return { mode: "radar_fallback", count: radar.count, url: radar.url, indexUsed: "RVI" };
    }
  } catch (e) {
    console.error("radar fallback failed:", e);
  }

  // No S1 coverage either — least-cloudy scene rendered as true color.
  const bestScene = rawCollection.sort("CLOUDY_PIXEL_PERCENTAGE").first();
  const cloudPct = await evaluate(bestScene.get("CLOUDY_PIXEL_PERCENTAGE"));
  let url: string | null = null;
  try {
    url = await getMapUrl(bestScene.clip(geom), {
      bands: TRUE_COLOR_BANDS,
      ...TRUE_COLOR_VIS,
    });
  } catch (e) {
    console.error("cloud-blocked true-color getMap failed:", e);
  }
  const lastValidDate = url ? await getLastValidDate(geom, start) : null;
  return { mode: "cloud_blocked", count: 0, url, cloudPct, lastValidDate };
}

// ── getTrueColorScene ──────────────────────────────────────────────────────
// Port of loadTrueColor(): single-scene RGB photo + full scene list for the
// date picker. Deliberately unmasked — clouds stay visible on purpose.
async function actionGetTrueColorScene(payload: any) {
  const geom = toEeGeometry(payload.geometry);
  const { year, month } = payload;
  const start = ee.Date.fromYMD(year, month, 1);
  const end = start.advance(1, "month");
  const all = ee
    .ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
    .filterBounds(geom)
    .filterDate(start, end);

  const list = all.map((img: any) =>
    ee.Feature(null, {
      date: img.date().format("YYYY-MM-dd"),
      cloudPct: ee.Number(img.get("CLOUDY_PIXEL_PERCENTAGE")),
    }),
  );
  const result = await evaluate(list);
  const scenes = ((result && result.features) || [])
    .map((f: any) => ({ date: f.properties.date, cloudPct: f.properties.cloudPct }))
    .sort((a: any, b: any) => a.date.localeCompare(b.date));

  if (scenes.length === 0) {
    return { mode: "no_data", count: 0, scenes: [], chosen: null, url: null };
  }

  // Resolve "the scene for the chosen date" to the LEAST-cloudy of any
  // same-day duplicate orbits (see frontend dedupeLowestCloud rationale).
  let chosen: { date: string; cloudPct: number } | null = null;
  if (payload.sceneDate) {
    const sameDate = scenes.filter((s: any) => s.date === payload.sceneDate);
    if (sameDate.length) {
      chosen = sameDate.reduce((a: any, b: any) => (b.cloudPct < a.cloudPct ? b : a));
    }
  }
  if (!chosen) {
    chosen = scenes.reduce((a: any, b: any) => (b.cloudPct < a.cloudPct ? b : a));
  }
  const day = ee.Date(chosen.date);
  const picked = all
    .filterDate(day, day.advance(1, "day"))
    .sort("CLOUDY_PIXEL_PERCENTAGE")
    .first();
  const url = await getMapUrl(picked.clip(geom), {
    bands: TRUE_COLOR_BANDS,
    ...TRUE_COLOR_VIS,
  });
  return { mode: "photo", count: scenes.length, scenes, chosen, url };
}

// ── getLatestTrueColor ─────────────────────────────────────────────────────
// Port of loadLatestTrueColor(): most recent S2 pass within the lookback
// window regardless of month/cloud, as an un-masked true-color photo.
async function actionGetLatestTrueColor(payload: any) {
  const geom = toEeGeometry(payload.geometry);
  const lookbackDays = payload.lookbackDays || 90;
  const start = ee.Date(Date.now()).advance(-lookbackDays, "day");
  const end = ee.Date(Date.now());
  const all = ee
    .ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
    .filterBounds(geom)
    .filterDate(start, end)
    .sort("system:time_start", false);

  const totalCount = await evaluate(all.size());
  if (totalCount === 0) {
    return { mode: "no_data", count: 0, date: null, cloudPct: null, url: null };
  }
  const latest = all.first();
  const ts = await evaluate(latest.get("system:time_start"));
  const date = tsToISO(ts);
  const cloudPct = await evaluate(latest.get("CLOUDY_PIXEL_PERCENTAGE"));
  const url = await getMapUrl(latest.clip(geom), {
    bands: TRUE_COLOR_BANDS,
    ...TRUE_COLOR_VIS,
  });
  return { mode: "photo", count: totalCount, date, cloudPct, url };
}

// ── getZoneBreakdown ───────────────────────────────────────────────────────
// Port of getZoneBreakdown(): bucket every pixel of the month's index image
// into 10 ranges, returning AREA per bucket in ONE batched reduceRegion.
function zoneBuckets(kind: string) {
  if (kind === "rvi") {
    return Array.from({ length: 10 }, (_, i) => ({ lo: i * 0.1, hi: (i + 1) * 0.1 }));
  }
  const arr = [{ lo: -1.0, hi: 0.1 }];
  for (let i = 1; i < 10; i++) arr.push({ lo: i * 0.1, hi: (i + 1) * 0.1 });
  return arr;
}

async function reduceZoneBands(indexImage: any, buckets: any[], geom: any) {
  const area = ee.Image.pixelArea();
  const parts: any[] = [];
  const names: string[] = [];
  buckets.forEach((b, i) => {
    const name = "a" + i;
    names.push(name);
    const mask = indexImage.gte(b.lo).and(indexImage.lt(b.hi));
    parts.push(area.updateMask(mask).rename(name));
  });
  names.push("total");
  parts.push(area.updateMask(indexImage.mask()).rename("total"));
  const result = await evaluate(
    ee
      .Image(parts)
      .reduceRegion({
        reducer: ee.Reducer.sum(),
        geometry: geom,
        scale: 10,
        maxPixels: 1e9,
        bestEffort: true,
      }),
  );
  if (!result) return null;
  return {
    buckets: buckets.map((b, i) => ({ lo: b.lo, hi: b.hi, areaSqm: result["a" + i] || 0 })),
    totalAreaSqm: result.total || 0,
  };
}

async function actionGetZoneBreakdown(payload: any) {
  const index = payload.index === "rvi" ? "rvi" : "ndvi";
  const geom = toEeGeometry(payload.geometry);
  const buckets = zoneBuckets(index);
  const start = ee.Date.fromYMD(payload.year, payload.month, 1);
  const end = start.advance(1, "month");

  if (index === "rvi") {
    // Same query as the radar fallback: ±15-day window keeps the breakdown
    // consistent with the radar view the map is showing.
    const s1 = ee
      .ImageCollection("COPERNICUS/S1_GRD")
      .filterBounds(geom)
      .filterDate(start.advance(-15, "day"), end.advance(15, "day"))
      .filter(ee.Filter.eq("instrumentMode", "IW"))
      .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VV"))
      .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VH"));
    const count = await evaluate(s1.size());
    if (!count) return { breakdown: null };
    const composite = s1.median().clip(geom);
    const vvLinear = ee.Image(10).pow(composite.select("VV").divide(10));
    const vhLinear = ee.Image(10).pow(composite.select("VH").divide(10));
    const rvi = vhLinear.multiply(4).divide(vvLinear.add(vhLinear)).rename("z");
    return { breakdown: await reduceZoneBands(rvi, buckets, geom) };
  }

  const clean = ee
    .ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
    .filterBounds(geom)
    .filterDate(start, end)
    .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 40));
  const count = await evaluate(clean.size());
  if (!count) return { breakdown: null };
  const ndvi = clean
    .median()
    .clip(geom)
    .normalizedDifference(["B8", "B4"])
    .rename("z");
  return { breakdown: await reduceZoneBands(ndvi, buckets, geom) };
}

// ── getIndexTimeSeries ─────────────────────────────────────────────────────
// Port of getIndexTimeSeries()/getIndexTimeSeriesForGeometry(): one batched
// FeatureCollection mapping over the clean S2 collection, evaluated once.
// Accepts either `lat`+`lng` or a GeoJSON `geometry`.
async function actionGetIndexTimeSeries(payload: any) {
  const index = payload.index && BANDS[payload.index] ? payload.index : "ndvi";
  const bands = BANDS[index];
  const months = payload.months || [];
  if (!months.length) return { points: [] };
  const geom =
    payload.lat != null && payload.lng != null
      ? ee.Geometry.Point([payload.lng, payload.lat])
      : toEeGeometry(payload.geometry);
  const startDate = ee.Date.fromYMD(months[0].year, months[0].month, 1);
  const last = months[months.length - 1];
  const endDate = ee.Date.fromYMD(last.year, last.month, 1).advance(1, "month");

  const all = s2Collection(geom, startDate, endDate);
  const series = all.map((img: any) => {
    const idxImg = img.normalizedDifference(bands).rename(index.toUpperCase());
    const value = idxImg.reduceRegion({
      reducer: ee.Reducer.mean(),
      geometry: geom,
      scale: 10,
      maxPixels: 1e9,
    });
    return ee.Feature(null, {
      date: img.date().format("YYYY-MM-dd"),
      cloudPct: ee.Number(img.get("CLOUDY_PIXEL_PERCENTAGE")),
      value: value.get(index.toUpperCase()),
    });
  });
  const filtered = series.filter(ee.Filter.notNull(["value"]));
  const result = await evaluate(filtered);
  const points = ((result && result.features) || []).map((f: any) => ({
    date: f.properties.date,
    cloudPct: f.properties.cloudPct,
    value: f.properties.value,
  }));
  return { points };
}

// ── detectPlantingDate ─────────────────────────────────────────────────────
// Port of detectPlantingDate() (Part 9 Feature 3): steepest dry→flooded LSWI
// jump over the trailing ~90 days. Returns null when data is sparse or no
// plausible spike exists — never a guess.
async function actionDetectPlantingDate(payload: any) {
  const geom = toEeGeometry(payload.geometry);
  const end = ee.Date(Date.now());
  const start = end.advance(-90, "day");
  const all = s2Collection(geom, start, end);
  const series = all.map((img: any) => {
    const lswi = img.normalizedDifference(["B8", "B11"]).rename("LSWI");
    const value = lswi.reduceRegion({
      reducer: ee.Reducer.mean(),
      geometry: geom,
      scale: 10,
      maxPixels: 1e9,
    });
    return ee.Feature(null, {
      date: img.date().format("YYYY-MM-dd"),
      value: value.get("LSWI"),
    });
  });
  const filtered = series.filter(ee.Filter.notNull(["value"]));
  const result = await evaluate(filtered);
  const points = ((result && result.features) || [])
    .map((f: any) => ({ date: f.properties.date, value: f.properties.value }))
    .sort((a: any, b: any) => a.date.localeCompare(b.date));

  if (points.length < 2) return { result: null };

  const midpoint = (a: string, b: string) => {
    const ms = (new Date(a).getTime() + new Date(b).getTime()) / 2;
    return new Date(ms).toISOString().slice(0, 10);
  };
  let best: { estimatedDate: string; deltaMagnitude: number } | null = null;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    const delta = cur.value - prev.value;
    if (delta > 0.1 && prev.value < 0.25 && cur.value >= 0.3) {
      if (!best || delta > best.deltaMagnitude) {
        best = { estimatedDate: midpoint(prev.date, cur.date), deltaMagnitude: delta };
      }
    }
  }
  return { result: best };
}

// ── getDryMonths ───────────────────────────────────────────────────────────
// Port of getDryMonths(): CHIRPS monthly totals batched into one server call.
async function actionGetDryMonths(payload: any) {
  const geom = toEeGeometry(payload.geometry);
  const months = payload.months || [];
  if (!months.length) return { dryMonths: [] };
  const monthFC = ee.FeatureCollection(
    months.map((m: any, i: number) =>
      ee.Feature(null, { idx: i, year: m.year, month: m.month }),
    ),
  );
  const results = monthFC.map((ft: any) => {
    ft = ee.Feature(ft);
    const year = ee.Number(ft.get("year"));
    const monthNum = ee.Number(ft.get("month"));
    const start = ee.Date.fromYMD(year, monthNum, 1);
    const end = start.advance(1, "month");
    const totalMm = ee
      .ImageCollection("UCSB-CHG/CHIRPS/DAILY")
      .filterDate(start, end)
      .filterBounds(geom)
      .sum()
      .reduceRegion({
        reducer: ee.Reducer.mean(),
        geometry: geom,
        scale: 5000,
        maxPixels: 1e9,
      })
      // Default avoids the server-side "Dictionary does not contain key"
      // crash for empty months; a high default reads "not dry".
      .get("precipitation", 1e3);
    return ft.set("totalMm", totalMm);
  });
  const fc = await evaluate(results);
  const dryMonths: number[] = [];
  ((fc && fc.features) || []).forEach((f: any) => {
    const mm = f.properties.totalMm;
    if (mm != null && mm < DRY_MONTH_THRESHOLD) dryMonths.push(f.properties.idx);
  });
  return { dryMonths };
}

// ── getFieldStatus ─────────────────────────────────────────────────────────
// NDVI status for a field geometry using the shared growth-stage logic (same
// source of truth as ee-alerts-worker): tight 14-day window first, widened to
// 90 days (low confidence) only when the short window has zero clean scenes.
async function computeNdviOverWindow(geom: any, days: number): Promise<number | null> {
  const end = ee.Date(Date.now());
  const start = end.advance(-days, "day");
  const collection = s2Collection(geom, start, end);
  const count = await evaluate(collection.size());
  if (!count) return null;
  const img = collection.median().normalizedDifference(["B8", "B4"]);
  const result = await evaluate(
    img.reduceRegion({
      reducer: ee.Reducer.mean(),
      geometry: geom,
      scale: 10,
      maxPixels: 1e9,
    }),
  );
  return result?.nd ?? 0;
}

async function actionGetFieldStatus(payload: any) {
  const geom = toEeGeometry(payload.geometry);
  let ndvi = await computeNdviOverWindow(geom, 14);
  let confidence: "high" | "low" = "high";
  if (ndvi === null) {
    ndvi = await computeNdviOverWindow(geom, 90);
    confidence = "low";
  }
  if (ndvi === null) {
    return { ndviValue: null, status: "no_data", stage: null, confidence, windowDays: 90 };
  }
  const { status, stage } = statusFromNdvi(ndvi, payload.plantingDate ?? null);
  return { ndviValue: ndvi, status, stage, confidence, windowDays: confidence === "low" ? 90 : 14 };
}

// ── getRecentIndexValue ────────────────────────────────────────────────────
// Port of getRecentIndexValue(): latest ≤90-day-old clean reading for a
// geometry, with a cloudBlocked flag derived from the freshest scene of the
// freshest day (least-cloudy twin orbit wins).
async function actionGetRecentIndexValue(payload: any) {
  const index = payload.index && BANDS[payload.index] ? payload.index : "ndvi";
  const bands = BANDS[index];
  const name = index.toUpperCase();
  const geom = toEeGeometry(payload.geometry);
  const start = ee.Date(Date.now()).advance(-90, "day");
  const end = ee.Date(Date.now());
  const all = ee
    .ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
    .filterBounds(geom)
    .filterDate(start, end)
    .sort("system:time_start", false);

  const totalCount = await evaluate(all.size());
  if (totalCount === 0) return { count: 0, value: null, date: null, cloudBlocked: false };

  // Resolve the freshest DAY first so a cloudier same-day duplicate orbit
  // can't flag the reading cloud-blocked when a clean scene of that date
  // exists.
  const ts = await evaluate(all.first().get("system:time_start"));
  const f = ts == null ? null : new Date(ts);
  const dayStart =
    f && !isNaN(f.getTime())
      ? new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth(), f.getUTCDate()))
      : null;
  if (!dayStart) return { count: 0, value: null, date: null, cloudBlocked: false };

  const freshestDay = all
    .filterDate(dayStart, new Date(dayStart.getTime() + 86400000))
    .sort("CLOUDY_PIXEL_PERCENTAGE");
  const cloudPct = await evaluate(freshestDay.first().get("CLOUDY_PIXEL_PERCENTAGE"));
  const cloudBlocked = cloudPct != null && cloudPct >= 40;

  const clean = all.filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 40));
  const count = await evaluate(clean.size());
  if (count === 0) return { count: 0, value: null, date: null, cloudBlocked };

  const recent = clean.first();
  const date = tsToISO(await evaluate(recent.get("system:time_start")));
  const idxImg = recent.normalizedDifference(bands).rename(name);
  const result = await evaluate(
    idxImg.reduceRegion({
      reducer: ee.Reducer.mean(),
      geometry: geom,
      scale: 10,
      maxPixels: 1e9,
    }),
  );
  const value = result && result[name] != null ? result[name] : null;
  return { count, value, date, cloudBlocked };
}

// ── getRainfall ────────────────────────────────────────────────────────────
// Port of getRainfallMm(): CHIRPS cumulative precipitation over a trailing
// window (default 21 days).
async function actionGetRainfall(payload: any) {
  const geom = toEeGeometry(payload.geometry);
  const daysBack = payload.daysBack || 21;
  const end = ee.Date(Date.now());
  const start = end.advance(-daysBack, "day");
  const result = await evaluate(
    ee
      .ImageCollection("UCSB-CHG/CHIRPS/DAILY")
      .filterDate(start, end)
      .filterBounds(geom)
      .sum()
      .reduceRegion({
        reducer: ee.Reducer.mean(),
        geometry: geom,
        scale: 5000,
        maxPixels: 1e9,
      }),
  );
  return { mm: (result && result.precipitation) ?? null };
}

// ── getObservations ────────────────────────────────────────────────────────
// Port of getObservations(): every S2 pass over the window with cloud cover,
// derived status and mean NDVI — one batched evaluate, no per-image loop.
async function actionGetObservations(payload: any) {
  const geom = toEeGeometry(payload.geometry);
  const endISO = payload.endISO;
  const startISO = payload.startISO;
  const end =
    endISO && !isNaN(new Date(endISO).getTime())
      ? ee.Date(endISO)
      : ee.Date(Date.now());
  const start =
    startISO && !isNaN(new Date(startISO).getTime())
      ? ee.Date(startISO)
      : end.advance(-14, "month");

  const collection = ee
    .ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
    .filterBounds(geom)
    .filterDate(start, end);
  const series = collection.map((img: any) => {
    const cloudCover = ee.Number(img.get("CLOUDY_PIXEL_PERCENTAGE"));
    const blocked = cloudCover.gte(40);
    const ageDays = ee.Date(Date.now()).difference(img.date(), "day");
    const stale = ee.Number(ageDays).gte(21);
    // Server-side branching must use ee.Algorithms.If — a plain JS ternary on
    // an EE object always picks the first branch.
    const status = ee.Algorithms.If(blocked, "blocked", ee.Algorithms.If(stale, "low", "clear"));
    const ndvi = img
      .normalizedDifference(["B8", "B4"])
      .rename("ndvi")
      .reduceRegion({
        reducer: ee.Reducer.mean(),
        geometry: geom,
        scale: 10,
        maxPixels: 1e9,
      })
      .get("ndvi");
    return ee.Feature(null, {
      date: img.date().format("YYYY-MM-dd"),
      source: "Sentinel-2",
      cloudCover,
      status,
      ndvi,
    });
  });
  const result = await evaluate(series);
  const rows = ((result && result.features) || []).map((feat: any) => ({
    date: feat.properties.date,
    source: feat.properties.source,
    cloudCover: feat.properties.cloudCover,
    status: feat.properties.status,
    ndvi: feat.properties.ndvi,
  }));
  return { rows };
}

// ── Router ─────────────────────────────────────────────────────────────────
type Handler = (payload: any) => Promise<Record<string, unknown>>;
const HANDLERS: Record<string, Handler> = {
  getIndexTile: actionGetIndexTile,
  getTrueColorScene: actionGetTrueColorScene,
  getLatestTrueColor: actionGetLatestTrueColor,
  getZoneBreakdown: actionGetZoneBreakdown,
  getIndexTimeSeries: actionGetIndexTimeSeries,
  detectPlantingDate: actionDetectPlantingDate,
  getDryMonths: actionGetDryMonths,
  getFieldStatus: actionGetFieldStatus,
  getRecentIndexValue: actionGetRecentIndexValue,
  getRainfall: actionGetRainfall,
  getObservations: actionGetObservations,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400);
  }

  const handler = body && HANDLERS[body.action];
  if (!handler) {
    return jsonResponse({ ok: false, error: "unknown_action" }, 400);
  }

  // Timing instrumentation: `supabase functions logs ee-data` will show, per
  // request, whether the EE session was freshly authenticated (cold isolate /
  // TTL refresh) or reused, plus the total handler duration. A request that is
  // slow WITHOUT a fresh "EE session initialized" line right before it is
  // slow because of Earth Engine compute, not auth.
  const started = performance.now();
  try {
    await ensureEE();
    const data = await handler(body);
    console.log(
      `[ee-data] ${body.action} ok in ${Math.round(performance.now() - started)}ms`,
    );
    return jsonResponse({ ok: true, ...data });
  } catch (e: any) {
    console.error(
      `[ee-data] ${body.action} failed after ${Math.round(performance.now() - started)}ms:`,
      e,
    );
    const status = typeof e?.code === "number" ? e.code : 500;
    const error = e?.message === "invalid_geometry" ? "invalid_geometry" : String(e?.message || e);
    return jsonResponse({ ok: false, error }, status);
  }
});
