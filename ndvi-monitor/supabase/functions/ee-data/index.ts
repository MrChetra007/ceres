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
import { createClient } from "npm:@supabase/supabase-js@2";
import { statusFromNdvi } from "../_shared/growthStage.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { translateIndexValue } from "../_shared/indexTranslations.ts";
import {
  healthScoreWeights,
  primaryIndexForStage,
  primaryIndexReasonKey,
  stageNameForDayCount,
} from "../_shared/primaryIndex.ts";
import { detectDiscrepancy } from "../_shared/discrepancy.ts";

const EE_KEY = JSON.parse(Deno.env.get("EE_SERVICE_ACCOUNT_KEY") || "{}");

// Service-role Supabase client for the closed-period caches (§0 of the
// ee-cost-control directive). This function is already a trusted server
// context (it holds the EE service account key), so service_role reads/writes
// simply bypass RLS on the ee_*_cache tables — no end-user policies exist.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

// ── Index/visualization config (mirrors src/config.js INDICES) ────────────
const BANDS: Record<string, string[]> = {
  ndvi: ["B8", "B4"],
  ndwi: ["B3", "B8"],
  lswi: ["B8", "B11"],
  savi: ["B8", "B4"],
  evi: ["B8", "B4", "B2"],
  gndvi: ["B8", "B3"],
};
const VIS: Record<string, Record<string, unknown>> = {
  ndvi: { min: -0.2, max: 0.8, palette: ["red", "yellow", "green"] },
  ndwi: {
    min: -1,
    max: 1,
    palette: ["brown", "tan", "#e0f0ff", "#4a90d9", "#003366"],
  },
  lswi: { min: -0.3, max: 0.6, palette: ["tan", "lightblue", "darkblue"] },
  // SAVI/EVI/GNDVI are visual/exploratory tabs only (they do NOT feed the
  // growth-stage stress-alert scoring). Palettes below are starter breakpoints
  // for the user to tune.
  savi: { min: 0, max: 1, palette: ["brown", "yellow", "green"] },
  evi: { min: 0, max: 1, palette: ["red", "orange", "green"] },
  gndvi: { min: -0.2, max: 0.8, palette: ["red", "purple", "green"] },
};
const TRUE_COLOR_BANDS = ["B4", "B3", "B2"];
// Wide stretch so bright cloud-free areas of a rice scene don't clamp to a
// single saturated green block (same reasoning as the frontend TRUE_COLOR_VIS).
const TRUE_COLOR_VIS = { min: 0, max: 3000, gamma: 1.4 };
const DRY_MONTH_THRESHOLD = 50;

// Apply the band math for a given index to a (single) image and rename the
// result band to `name`. NDVI/NDWI/LSWI/GNDVI are 2-band ratios that map cleanly
// onto ee.Image.normalizedDifference(); SAVI and EVI need a custom expression
// (same style as the RVI fallback above). This is the single place index math
// lives — every action that computes an index goes through here so a new index
// stays consistent across the map, trend chart, field statuses and bulk trends.
function applyIndex(img: any, index: string, name: string) {
  if (index === "savi") {
    const L = 0.5;
    return img
      .expression("((NIR - RED) / (NIR + RED + L)) * (1 + L)", {
        NIR: img.select("B8"),
        RED: img.select("B4"),
        L: L,
      })
      .rename(name);
  }
  if (index === "evi") {
    const G = 2.5,
      C1 = 6,
      C2 = 7.5,
      L = 1;
    return img
      .expression("G * ((NIR - RED) / (NIR + C1 * RED - C2 * BLUE + L))", {
        NIR: img.select("B8"),
        RED: img.select("B4"),
        BLUE: img.select("B2"),
        G,
        C1,
        C2,
        L,
      })
      .rename(name);
  }
  return img.normalizedDifference(BANDS[index]).rename(name);
}

function jsonResponse(
  body: unknown,
  status = 200,
  corsHeaders: Record<string, string>,
): Response {
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
        ee.initialize(
          null,
          null,
          () => resolve(),
          (e: string) => reject(new Error(e)),
        ),
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
async function getLastValidDate(
  geom: any,
  monthStart: any,
): Promise<string | null> {
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

async function getRadarVegetationIndex(
  geom: any,
  startDate: any,
  endDate: any,
) {
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
  const rvi = vhLinear.multiply(4).divide(vvLinear.add(vhLinear)).rename("RVI");
  const url = await getMapUrl(rvi, {
    min: 0,
    max: 1,
    palette: ["blue", "white", "green"],
  });
  return { count, url };
}

async function actionGetIndexTile(payload: any) {
  const index = payload.index && BANDS[payload.index] ? payload.index : "ndvi";
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
    const composite = applyIndex(
      cleanCollection.median().clip(geom),
      index,
      index.toUpperCase(),
    );
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
      return {
        mode: "radar_fallback",
        count: radar.count,
        url: radar.url,
        indexUsed: "RVI",
      };
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
    .map((f: any) => ({
      date: f.properties.date,
      cloudPct: f.properties.cloudPct,
    }))
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
      chosen = sameDate.reduce((a: any, b: any) =>
        b.cloudPct < a.cloudPct ? b : a,
      );
    }
  }
  if (!chosen) {
    chosen = scenes.reduce((a: any, b: any) =>
      b.cloudPct < a.cloudPct ? b : a,
    );
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
    return Array.from({ length: 10 }, (_, i) => ({
      lo: i * 0.1,
      hi: (i + 1) * 0.1,
    }));
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
    ee.Image(parts).reduceRegion({
      reducer: ee.Reducer.sum(),
      geometry: geom,
      scale: 10,
      maxPixels: 1e9,
      bestEffort: true,
    }),
  );
  if (!result) return null;
  return {
    buckets: buckets.map((b, i) => ({
      lo: b.lo,
      hi: b.hi,
      areaSqm: result["a" + i] || 0,
    })),
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
    const idxImg = applyIndex(img, index, index.toUpperCase());
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
        best = {
          estimatedDate: midpoint(prev.date, cur.date),
          deltaMagnitude: delta,
        };
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
    if (mm != null && mm < DRY_MONTH_THRESHOLD)
      dryMonths.push(f.properties.idx);
  });
  return { dryMonths };
}

// ── getFieldStatus ─────────────────────────────────────────────────────────
// NDVI status for a field geometry using the shared growth-stage logic (same
// source of truth as ee-alerts-worker): tight 14-day window first, widened to
// 90 days (low confidence) only when the short window has zero clean scenes.
async function computeNdviOverWindow(
  geom: any,
  days: number,
): Promise<number | null> {
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

// Generic per-index window compute (AIM · composite health score). Same 14- or
// 90-day median-over-clean-scenes approach as computeNdviOverWindow, but for
// ANY index (deliberately routed through applyIndex — the single place index
// math lives). Returns null when the window has no clean scenes at all.
async function computeIndexOverWindow(
  geom: any,
  index: string,
  days: number,
): Promise<number | null> {
  const end = ee.Date(Date.now());
  const start = end.advance(-days, "day");
  const collection = s2Collection(geom, start, end);
  const count = await evaluate(collection.size());
  if (!count) return null;
  const name = index.toUpperCase();
  const img = applyIndex(collection.median(), index, name);
  const result = await evaluate(
    img.reduceRegion({
      reducer: ee.Reducer.mean(),
      geometry: geom,
      scale: 10,
      maxPixels: 1e9,
    }),
  );
  const value = result && result[name] != null ? result[name] : null;
  return value;
}

// Normalize an index's raw value onto 0..1 using its OWN VIS min/max. Two
// indices with different natural ranges (ndwi -1..1 vs savi 0..1) can't be
// averaged raw, so every component is scaled before the weighted blend.
function normalizeToUnitRange(
  index: string,
  value: number | null,
): number | null {
  if (value == null) return null;
  const v = VIS[index] as { min?: number; max?: number } | undefined;
  if (!v || v.min == null || v.max == null) return null;
  const span = v.max - v.min || 1;
  return Math.max(0, Math.min(1, (value - v.min) / span));
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
    return {
      ndviValue: null,
      status: "no_data",
      stage: null,
      confidence,
      windowDays: 90,
    };
  }
  const { status, stage } = statusFromNdvi(ndvi, payload.plantingDate ?? null);
  // Plain-language band (AIM F1) + the growth-stage-aware headline index (AIM
  // F2, informational — the NDVI value here still drives the stage comparison
  // thresholds, the actual INDEX switch happens in getFieldHealthScore).
  const band = translateIndexValue("ndvi", ndvi);
  const primaryIndex = primaryIndexForStage(stage);
  return {
    ndviValue: ndvi,
    status,
    stage,
    confidence,
    windowDays: confidence === "low" ? 90 : 14,
    primaryIndex,
    ...band,
  };
}

// ── getFieldHealthScore ────────────────────────────────────────────────────
// AIM · Feature 2 + 3 + 4. One 0-100 composite on a 4-band plain-language
// verdict, blending the GROWTH-STAGE-APPROPRIATE indices:
//   early stages (Germination/Seedling) → savi + lswi
//   later stages / unknown              → ndvi + lswi + evi
// Each index is normalized to 0..1 against its OWN VIS range before the
// weighted average, so indices with different natural ranges can be combined.
// Returns the raw per-index values too so the discrepancy rules (F4) operate
// on un-normalized numbers.
async function actionGetFieldHealthScore(payload: any) {
  const geom = toEeGeometry(payload.geometry);
  const plantingDate = payload.plantingDate || null;

  let dayCount: number | null = null;
  if (plantingDate) {
    const days = Math.floor(
      (Date.now() - new Date(plantingDate).getTime()) / 86400000,
    );
    if (days >= 0) dayCount = days;
  }
  const stage = stageNameForDayCount(dayCount);
  const primaryIndex = primaryIndexForStage(stage);
  const weights = healthScoreWeights(stage);

  const raw: Record<string, number> = {};
  const normalized: Record<string, number> = {};
  let confidence: "high" | "low" = "high";
  for (const index of Object.keys(weights)) {
    let value = await computeIndexOverWindow(geom, index, 14);
    if (value === null) {
      value = await computeIndexOverWindow(geom, index, 90);
      confidence = "low";
    }
    if (value === null) {
      // A required index has no clean reading for scoring — return an honest
      // no-data state instead of a fabricated verdict.
      return {
        score: null,
        noData: true,
        stage,
        dayCount,
        primaryIndex,
        confidence,
      };
    }
    raw[index] = value;
    normalized[index] = normalizeToUnitRange(index, value);
  }

  const score = Math.round(
    Object.entries(weights).reduce(
      (sum, [i, w]) => sum + (normalized[i] ?? 0) * w,
      0,
    ) * 100,
  );
  const band = translateIndexValue("composite", score);
  const discrepancy = detectDiscrepancy(raw);
  return {
    score,
    noData: false,
    stage,
    dayCount,
    primaryIndex,
    primaryReasonKey: primaryIndexReasonKey(stage),
    confidence,
    weights,
    components: normalized,
    rawValues: raw,
    ...band,
    discrepancy,
  };
}

// ── getRecentIndexValue ────────────────────────────────────────────────────
// Port of getRecentIndexValue(): latest ≤90-day-old clean reading for a
// geometry, with a cloudBlocked flag derived from the freshest scene of the
// freshest day (least-cloudy twin orbit wins).
async function actionGetRecentIndexValue(payload: any) {
  const index = payload.index && BANDS[payload.index] ? payload.index : "ndvi";
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
  if (totalCount === 0)
    return { count: 0, value: null, date: null, cloudBlocked: false };

  // Resolve the freshest DAY first so a cloudier same-day duplicate orbit
  // can't flag the reading cloud-blocked when a clean scene of that date
  // exists.
  const ts = await evaluate(all.first().get("system:time_start"));
  const f = ts == null ? null : new Date(ts);
  const dayStart =
    f && !isNaN(f.getTime())
      ? new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth(), f.getUTCDate()))
      : null;
  if (!dayStart)
    return { count: 0, value: null, date: null, cloudBlocked: false };

  const freshestDay = all
    .filterDate(dayStart, new Date(dayStart.getTime() + 86400000))
    .sort("CLOUDY_PIXEL_PERCENTAGE");
  const cloudPct = await evaluate(
    freshestDay.first().get("CLOUDY_PIXEL_PERCENTAGE"),
  );
  const cloudBlocked = cloudPct != null && cloudPct >= 40;

  const clean = all.filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 40));
  const count = await evaluate(clean.size());
  if (count === 0) return { count: 0, value: null, date: null, cloudBlocked };

  const recent = clean.first();
  const date = tsToISO(await evaluate(recent.get("system:time_start")));
  const idxImg = applyIndex(recent, index, name);
  const result = await evaluate(
    idxImg.reduceRegion({
      reducer: ee.Reducer.mean(),
      geometry: geom,
      scale: 10,
      maxPixels: 1e9,
    }),
  );
  const value = result && result[name] != null ? result[name] : null;
  // Plain-language band (AIM F1) alongside the raw value — power users and the
  // trend chart still want the number; the phrase is for the field-view card.
  const band = value == null ? {} : translateIndexValue(index, value);
  return { count, value, date, cloudBlocked, ...band };
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
//
// Per-scene caching (§2 of the ee-cost-control directive): a scene that is
// already in ee_observation_cache (one row per field+scene_date, permanent)
// is never recomputed. Only scenes NEWER than the newest cached one are
// fetched from EE, so steady-state calls run a near-empty query. `status`
// depends on how old a scene is RELATIVE TO TODAY, so it is deliberately NOT
// cached — it is recomputed at read time for every row, cached and fresh.
async function actionGetObservations(payload: any) {
  const geom = toEeGeometry(payload.geometry);
  const fieldId = payload.fieldId || null;
  const endISO = payload.endISO;
  const startISO = payload.startISO;

  // Resolve the window in plain JS first so the cache query and the EE query
  // share the exact same bounds (no EE Date → ISO round-trip needed). The
  // relative default (now − 14 calendar months) gets a 1-day margin on the
  // front so an EE/JS month-arithmetic edge can never drop an in-window scene.
  const endTs = endISO && !isNaN(new Date(endISO).getTime())
    ? new Date(endISO).getTime()
    : Date.now();
  const startTs = startISO && !isNaN(new Date(startISO).getTime())
    ? new Date(startISO).getTime()
    : (() => {
        const d = new Date(endTs);
        d.setMonth(d.getMonth() - 14);
        return d.getTime() - 86400000;
      })();
  const iso = (ts: number) => new Date(ts).toISOString().slice(0, 10);
  const qStart = iso(startTs);
  const qEnd = iso(endTs);
  const end = ee.Date(endTs);
  const start = ee.Date(startTs);

  // 1. Read whatever scenes are already permanent-cached in this window.
  let cached: any[] = [];
  let cachedMax: string | null = null;
  if (fieldId) {
    try {
      const { data } = await supabase
        .from("ee_observation_cache")
        .select("scene_date, source, cloud_cover, ndvi")
        .eq("field_id", fieldId)
        .gte("scene_date", qStart)
        .lte("scene_date", qEnd);
      cached = (data as any[]) || [];
      for (const row of cached) {
        if (!cachedMax || row.scene_date > cachedMax) cachedMax = row.scene_date;
      }
    } catch (e) {
      // Cache read failed — fall back to computing the full window this call.
      console.error("[ee-data] ee_observation_cache read failed:", e);
    }
  }

  // 2. Restrict the EE query to scenes after the newest cached one. If nothing
  //    is cached yet (or the cache is skipped for lack of field_id), the query
  //    is the full window (first-time population / uncacheable fallback).
  let computeStart: any = start;
  let computeEnd = end;
  let needsCompute = true;
  if (cachedMax) {
    const next = new Date(cachedMax + "T00:00:00Z");
    next.setUTCDate(next.getUTCDate() + 1);
    if (next.getTime() > endTs) {
      needsCompute = false; // everything requested is already cached
    } else {
      computeStart = ee.Date(next.getTime());
    }
  }

  // 3. Fetch only the not-yet-cached tail of the window.
  const freshByDate = new Map<string, any>();
  if (needsCompute) {
    const collection = ee
      .ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
      .filterBounds(geom)
      .filterDate(computeStart, computeEnd);
    const series = collection.map((img: any) => {
      const cloudCover = ee.Number(img.get("CLOUDY_PIXEL_PERCENTAGE"));
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
        ndvi,
      });
    });
    const result = await evaluate(series);
    // The cache key is (field_id, scene_date), so same-day duplicate S2 orbits
    // must collapse here — keep the least-cloudy row (same rule the frontend's
    // dedupeLowestCloud applies to the final list).
    for (const feat of (result && result.features) || []) {
      const p = feat.properties;
      const existing = freshByDate.get(p.date);
      // Keep the best (lowest cloud) scene seen for this date; never replace a
      // known-cloud value with an unknown one (same rule the frontend's
      // dedupeLowestCloud applies to the final list).
      if (
        !existing ||
        (p.cloudCover != null &&
          (existing.cloudCover == null || p.cloudCover < existing.cloudCover))
      ) {
        freshByDate.set(p.date, {
          date: p.date,
          source: p.source,
          cloudCover: p.cloudCover,
          ndvi: p.ndvi,
        });
      }
    }
  }
  const fresh = [...freshByDate.values()];

  // 4. Persist the newly computed scenes (permanent — never recomputed after).
  if (fieldId && fresh.length) {
    try {
      const { error } = await supabase
        .from("ee_observation_cache")
        .upsert(
          fresh.map((r: any) => ({
            field_id: fieldId,
            scene_date: r.date,
            source: r.source || "Sentinel-2",
            cloud_cover: r.cloudCover,
            ndvi: r.ndvi,
          })),
          { onConflict: "field_id,scene_date" },
        );
      if (error) console.error("[ee-data] ee_observation_cache upsert failed:", error);
    } catch (e) {
      console.error("[ee-data] ee_observation_cache upsert failed:", e);
    }
  }

  // 5. Merge cached + fresh, then derive status AT READ TIME for every row —
  //    cached scenes age past the 21-day "low" line even though their
  //    cloud_cover/ndvi never change.
  const rows = [
    ...cached.map((r: any) => ({
      date: r.scene_date,
      source: r.source || "Sentinel-2",
      cloudCover: r.cloud_cover,
      ndvi: r.ndvi,
    })),
    ...fresh,
  ];
  for (const r of rows) {
    const ageDays = (Date.now() - new Date(r.date).getTime()) / 86400000;
    r.status = r.cloudCover >= 40 ? "blocked" : ageDays >= 21 ? "low" : "clear";
  }
  rows.sort((a: any, b: any) => a.date.localeCompare(b.date));
  return { rows };
}

// ── getAllFieldStatuses ────────────────────────────────────────────────────
// Batched replacement for N getRecentIndexValue calls on login: one
// FeatureCollection over all field geometries, one .map(), one evaluate().
// Mirrors actionGetRecentIndexValue's per-field logic (90-day lookback,
// least-cloudy scene of the freshest day, cloud-blocked flag, latest clean
// reading) as pure server-side EE operations.
//
// Empty-collection safety: EE's ee.Algorithms.If may evaluate BOTH branches,
// so an empty per-field collection can't be guarded with If (first() on an
// empty collection errors). Instead every field's collection is padded with a
// far-past sentinel image (system:time_start = -100000 days, i.e. sorts last)
// carrying the expected bands/properties. first() is therefore always
// defined; sentinel-derived outputs (value 0, cloud 100%, bogus date) are
// gated away client-side by `count === 0`, where count comes from the REAL
// (pre-pad) clean collection size.
async function actionGetAllFieldStatuses(payload: any) {
  const index = payload.index && BANDS[payload.index] ? payload.index : "ndvi";
  const bands = BANDS[index];
  const name = index.toUpperCase();
  const incoming = Array.isArray(payload.fields) ? payload.fields : [];
  if (!incoming.length) return { statuses: [] };

  const fc = ee.FeatureCollection(
    incoming.map((f: any) =>
      ee.Feature(toEeGeometry(f.geometry), { fid: String(f.id) }),
    ),
  );
  const base = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED");

  // Far-past sentinel: sorts last after desc-time sort, passes through
  // property gets, and its constant [1,1] bands yield a well-defined NDVI of
  // 0 instead of a divide-by-zero mask. -100000 days ≈ year 1696.
  const PAD_TS = -8640000000000;
  const pad = () =>
    ee.Image.constant([1, 1])
      .rename(bands)
      .set("system:time_start", PAD_TS)
      .set("CLOUDY_PIXEL_PERCENTAGE", 100);

  const statuses = fc.map((ft: any) => {
    const geom = ee.Feature(ft).geometry();
    const end = ee.Date(Date.now());
    const start = end.advance(-90, "day");
    const raw = base.filterBounds(geom).filterDate(start, end);
    const clean = raw.filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 40));

    // Cloud-blocked signal: cloud % of the LEAST-cloudy scene of the
    // freshest day (guards against a cloudier twin orbit flagging a reading
    // blocked when a clean same-day scene exists). Pad keeps first() defined
    // for scene-less fields.
    const allPad = raw
      .merge(ee.ImageCollection([pad()]))
      .sort("system:time_start", false);
    const freshestTs = ee.Number(allPad.first().get("system:time_start"));
    const dayStart = ee.Date(
      freshestTs.divide(86400000).floor().multiply(86400000),
    );
    const freshestDay = allPad
      .filterDate(dayStart, dayStart.advance(1, "day"))
      .sort("CLOUDY_PIXEL_PERCENTAGE");
    const cloudPct = ee.Number(
      freshestDay.first().get("CLOUDY_PIXEL_PERCENTAGE"),
    );

    // Latest clean reading (pad appended after filtering, so it can only win
    // when the field genuinely has zero clean scenes).
    const recent = clean
      .merge(ee.ImageCollection([pad()]))
      .sort("system:time_start", false)
      .first();
    const dateStr = ee
      .Date(ee.Number(recent.get("system:time_start")))
      .format("YYYY-MM-dd");
    const value = applyIndex(recent, index, name)
      .reduceRegion({
        reducer: ee.Reducer.mean(),
        geometry: geom,
        scale: 10,
        maxPixels: 1e9,
      })
      // Default null (not 0) so a fully-masked region surfaces as "no
      // reading" client-side instead of a false stressed value.
      .get(name, null);

    return ee.Feature(null, {
      fid: ft.get("fid"),
      count: clean.size(),
      value,
      date: dateStr,
      cloudBlocked: cloudPct.gte(40),
    });
  });

  const result = await evaluate(statuses);
  const rows = ((result && result.features) || []).map((f: any) => {
    const value = f.properties.value;
    const band =
      value == null ? {} : translateIndexValue(index, value);
    return {
      id: f.properties.fid,
      count: f.properties.count,
      value,
      date: f.properties.date,
      cloudBlocked: !!f.properties.cloudBlocked,
      ...band,
    };
  });
  return { statuses: rows };
}

// ── getAllFieldTrends ──────────────────────────────────────────────────────
// Batched replacement for N getIndexTimeSeriesForGeometry calls on login:
// outer FeatureCollection over fields, inner per-month series (the same
// mapping actionGetIndexTimeSeries does) nested as a property per field, all
// resolved in ONE evaluate. Heaviest action here — fields × months
// reduceRegions in a single graph.
//
// Closed-month caching (§1 of the ee-cost-control directive): every fully
// elapsed (closed) calendar month is permanent in ee_trend_cache, keyed on
// (field_id, index, year, month), and is served from there instead of being
// recomputed. Only the current (open) month — plus any closed month that has
// never been cached — is sent to Earth Engine, so steady-state calls hit EE
// for just the open month (~93% reduction). A month that _transitioned_ from
// open to closed since it was last written is treated as not-yet-cached: its
// stale mid-month row is ignored and one recompute "finalizes" it
// (is_closed_period flips to true and it is never touched again).
async function actionGetAllFieldTrends(payload: any) {
  const index = payload.index && BANDS[payload.index] ? payload.index : "ndvi";
  const name = index.toUpperCase();
  const months = payload.months || [];
  const incoming = Array.isArray(payload.fields) ? payload.fields : [];
  if (!incoming.length || !months.length) return { trends: [] };

  // 1. Split months into closed (fully elapsed → cacheable) vs open (still in
  //    progress → always recomputed). Plain-JS calendar math, no EE: month M
  //    is closed once the first day of M+1 has passed. Date.UTC is 0-indexed,
  //    so Date.UTC(year, month, 1) is the start of the NEXT real month.
  const monthKey = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;
  const now = Date.now();
  const closed = months.filter((m: any) => Date.UTC(m.year, m.month, 1) <= now);
  const open = months.filter((m: any) => Date.UTC(m.year, m.month, 1) > now);
  const closedKeys = new Set(closed.map((m: any) => monthKey(m.year, m.month)));

  // 2. Load every cached row for these fields + index in ONE query. Only rows
  //    flagged is_closed_period are served — an open-month row is interim, and
  //    a closed-marked month is the final, permanent one.
  const cacheMap = new Map<string, any[]>();
  try {
    const { data } = await supabase
      .from("ee_trend_cache")
      .select("field_id, year, month, points, is_closed_period")
      .eq("index", index)
      .in("field_id", incoming.map((f: any) => f.id));
    for (const row of data || []) {
      if (!row.is_closed_period) continue;
      const mk = monthKey(row.year, row.month);
      if (!closedKeys.has(mk)) continue;
      cacheMap.set(`${row.field_id}|${mk}`, row.points ?? []);
    }
  } catch (e) {
    // Cache read failed — recompute everything this call and try to write.
    console.error("[ee-data] ee_trend_cache read failed:", e);
  }

  // 3. Compute set = the open months + any closed month missing from the cache
  //    for AT LEAST one field (union across fields, per the directive §1 edge
  //    case — fields that already have such a month cached recompute it this
  //    one call; self-correcting on the next). Empty when everything is cached.
  const missing = new Set<string>();
  for (const m of closed) {
    const mk = monthKey(m.year, m.month);
    const anyFieldCached = incoming.some((f: any) =>
      cacheMap.has(`${f.id}|${mk}`),
    );
    if (!anyFieldCached) missing.add(mk);
  }
  for (const m of open) missing.add(monthKey(m.year, m.month));

  const computeMonths = months
    .filter((m: any) => missing.has(monthKey(m.year, m.month)))
    .sort((a: any, b: any) => a.year - b.year || a.month - b.month);

  const freshByField = new Map<string, Map<string, any[]>>();

  if (computeMonths.length) {
    // Every field shares the same window — compute it once, outside the map.
    const startDate = ee.Date.fromYMD(
      computeMonths[0].year,
      computeMonths[0].month,
      1,
    );
    const last = computeMonths[computeMonths.length - 1];
    const endDate = ee.Date.fromYMD(last.year, last.month, 1).advance(1, "month");

    const fc = ee.FeatureCollection(
      incoming.map((f: any) =>
        ee.Feature(toEeGeometry(f.geometry), { fid: String(f.id) }),
      ),
    );

    const trends = fc.map((ft: any) => {
      const geom = ee.Feature(ft).geometry();
      const all = ee
        .ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
        .filterBounds(geom)
        .filterDate(startDate, endDate)
        .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 40));
      const series = all
        .map((img: any) => {
          const idxImg = applyIndex(img, index, name);
          const value = idxImg.reduceRegion({
            reducer: ee.Reducer.mean(),
            geometry: geom,
            scale: 10,
            maxPixels: 1e9,
          });
          return ee.Feature(null, {
            date: img.date().format("YYYY-MM-dd"),
            cloudPct: ee.Number(img.get("CLOUDY_PIXEL_PERCENTAGE")),
            value: value.get(name),
          });
        })
        // Missing-key properties read as null here, so notNull cleanly drops
        // masked/no-data scenes (same as actionGetIndexTimeSeries).
        .filter(ee.Filter.notNull(["value"]));
      return ee.Feature(null, { fid: ft.get("fid"), points: series });
    });

    const result = await evaluate(trends);
    const rows = ((result && result.features) || []).map((f: any) => ({
      id: f.properties.fid,
      points: ((f.properties.points || {}).features || []).map(
        (p: any) => p.properties,
      ),
    }));

    // Bucket each field's flat 14-month series into per-month arrays
    // (YYYY-MM from the scene date) so each calendar month becomes one row.
    for (const r of rows) {
      const buckets = new Map<string, any[]>();
      for (const p of r.points) {
        const mk = p.date && p.date.slice(0, 7);
        if (!mk) continue;
        if (!buckets.has(mk)) buckets.set(mk, []);
        buckets.get(mk)!.push(p);
      }
      freshByField.set(r.id, buckets);
    }

    // 4. Persist per-(field, index, year, month). Closed months are marked
    //    permanent (is_closed_period = true, never recomputed again); the open
    //    month is overwritten on every call (false). Empty buckets are written
    //    too — a month with zero clean scenes must still converge, otherwise
    //    it would be re-queried as "missing" on every call forever.
    const upserts: any[] = [];
    for (const f of incoming) {
      const buckets = freshByField.get(String(f.id)) ?? new Map<string, any[]>();
      for (const m of computeMonths) {
        const mk = monthKey(m.year, m.month);
        upserts.push({
          field_id: f.id,
          index,
          year: m.year,
          month: m.month,
          points: (buckets.get(mk) || [])
            .slice()
            .sort((a: any, b: any) => a.date.localeCompare(b.date)),
          is_closed_period: closedKeys.has(mk),
        });
      }
    }
    try {
      const { error } = await supabase
        .from("ee_trend_cache")
        .upsert(upserts, { onConflict: "field_id,index,year,month" });
      if (error) console.error("[ee-data] ee_trend_cache upsert failed:", error);
    } catch (e) {
      console.error("[ee-data] ee_trend_cache upsert failed:", e);
    }
  }

  // 5. Merge, per field: seed each requested month from cache, overlay freshly
  //    computed months, flatten in the caller's month order and sort by date —
  //    the trend chart depends on the merged list being date-ordered.
  const trends = incoming.map((f: any) => {
    const idStr = String(f.id);
    const byMonth = new Map<string, any[]>();
    for (const m of months) {
      const mk = monthKey(m.year, m.month);
      const cached = cacheMap.get(`${idStr}|${mk}`);
      if (cached) byMonth.set(mk, cached);
    }
    const freshBuckets = freshByField.get(idStr);
    if (freshBuckets) {
      for (const [mk, pts] of freshBuckets) byMonth.set(mk, pts);
    }
    const points = months
      .flatMap((m: any) => byMonth.get(monthKey(m.year, m.month)) || [])
      .sort((a: any, b: any) => a.date.localeCompare(b.date));
    return { id: idStr, points };
  });

  return { trends };
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
  getFieldHealthScore: actionGetFieldHealthScore,
  getRecentIndexValue: actionGetRecentIndexValue,
  getAllFieldStatuses: actionGetAllFieldStatuses,
  getAllFieldTrends: actionGetAllFieldTrends,
  getRainfall: actionGetRainfall,
  getObservations: actionGetObservations,
};

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400, corsHeaders);
  }

  const handler = body && HANDLERS[body.action];
  if (!handler) {
    return jsonResponse(
      { ok: false, error: "unknown_action" },
      400,
      corsHeaders,
    );
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
    return jsonResponse({ ok: true, ...data }, 200, corsHeaders);
  } catch (e: any) {
    console.error(
      `[ee-data] ${body.action} failed after ${Math.round(performance.now() - started)}ms:`,
      e,
    );
    const status = typeof e?.code === "number" ? e.code : 500;
    const error =
      e?.message === "invalid_geometry"
        ? "invalid_geometry"
        : String(e?.message || e);
    return jsonResponse({ ok: false, error }, status, corsHeaders);
  }
});
