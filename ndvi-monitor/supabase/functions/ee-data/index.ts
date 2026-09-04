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
import {
  addCloudProbability,
  validPixelMask,
  validPixelFraction,
  CLOUD_RESILIENCE,
} from "../_shared/cloudMask.ts";

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
  // RVI = 4*VH/(VV+VH) is mathematically bounded [0, 4]; VV>=VH for
  // vegetated surfaces keeps realistic dense-canopy values below ~2. Must stay
  // in sync with src/config.js RVI_VIS (legend, chart y-axis, ramp) so the
  // server tile and the client display never drift. Note: RVI is deliberately
  // NOT in healthScoreWeights(), so this range only affects visualization.
  rvi: { min: 0, max: 2, palette: ["blue", "white", "green"] },
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

// ── Pixel-level optical composite builder (cloud-resilience core) ──────────
// Turn a set of S2 scenes over a date window into ONE pixel-masked index
// composite, with field-level validity stats and the ACTUAL window used.
//
// Each scene is cloud/shadow-masked at the pixel level (s2cloudless +
// SCL + cloud-edge buffer, see _shared/cloudMask.ts) so cloudy pixels are NaN
// and never colored. The robust median is then taken over VALID pixels only —
// cloud pixels in one scene don't poison a clear pixel in another. Finally the
// fraction of valid pixels over the geometry is measured for honest confidence.
//
// Returns null when no scene survives (no optical data at all for the window).
async function buildMaskedComposite(
  geom: any,
  start: any,
  end: any,
  index: string,
): Promise<{
  img: any; // masked index composite (band named index.toUpperCase()), clouds NaN
  clearSceneCount: number;
  validFraction: number | null;
  compositeStart: string;
  compositeEnd: string;
}> {
  const name = index.toUpperCase();
  const raw = ee
    .ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
    .filterBounds(geom)
    .filterDate(start, end);
  const withProb = addCloudProbability(raw, ee);

  // Per scene: compute the index over the (unmasked) band, then updateMask to
  // the valid-pixel mask so cloud/shadow/border pixels become NoData.
  const maskedIndices = withProb.map((scene: any) => {
    const idx = applyIndex(scene, index, name);
    return idx.updateMask(validPixelMask(scene, ee));
  });

  const count = await evaluate(maskedIndices.size());
  if (!count || count === 0) {
    return Promise.resolve({ img: null, clearSceneCount: 0, validFraction: null, compositeStart: "", compositeEnd: "" });
  }

  const composite = maskedIndices.median().rename(name);
  // Field-level valid fraction over the geometry (fraction of pixels carrying a
  // non-NaN index value = pixel survived cloud/shadow mask AND has data).
  const validFraction = await validPixelFraction(composite, name, geom, 10, ee, evaluate);

  const iso = (d: any) => new Date(d.millis() as unknown as number).toISOString().slice(0, 10);
  const compositeStart = iso(start);
  const compositeEnd = iso(end);
  return Promise.resolve({ img: composite, clearSceneCount: count, validFraction, compositeStart, compositeEnd });
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
  // Scene-level cloud filter is a cheap pre-drop for almost-certain clouds; the
  // real decision is per-pixel (s2cloudless + SCL + cloud-edge buffer) so a
  // field that's clear under a nominally-cloudy scene still resolves. Each scene
  // is index-agnostically masked only where it's safe to compute — the caller
  // computes the index from the masked scene, and collection.median() combines
  // ONLY the valid (non-masked) pixels.
  const raw = ee
    .ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
    .filterBounds(geom)
    .filterDate(start, end)
    .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 40));
  const withProb = addCloudProbability(raw, ee);
  return withProb.map((scene: any) => scene.updateMask(validPixelMask(scene, ee)));
}

function tsToISO(ts: any): string | null {
  return ts == null ? null : new Date(ts).toISOString().slice(0, 10);
}

// ── Tile cache helpers (§1 of the ee-cost-control directive) ───────────────
// actionGetIndexTile mints signed Earth Engine MAP URLs that are time-limited,
// so the cache stores the URL + the facts the map renders, keyed on a stable
// hash of the input geometry, and refreshes it on a TTL — it can never hold a
// closed month permanently (the token would expire), unlike ee_trend_cache.
function geometryHash(geojson: any): string {
  const s = JSON.stringify(geojson && geojson.type === "Feature" ? geojson.geometry : geojson);
  // FNV-1a 32-bit — deterministic, stable across restarts, not crypto.
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function tileIsClosed(year: number, month: number): boolean {
  // Month has fully elapsed once the first day of the *next* month has passed.
  // Date.UTC is 0-indexed, so Date.UTC(year, month, 1) is the next real month.
  return Date.UTC(year, month, 1) <= Date.now();
}

// Closed-month tiles are deterministic and can be served long (the composite
// never changes) — but the signed URL still lapses, so cap at 12h. Open-month
// tiles get a short window so newly-arrived scenes surface quickly.
function tileCacheTtlMs(closed: boolean): number {
  return closed ? 12 * 60 * 60 * 1000 : 20 * 60 * 1000;
}

async function readTileCache(
  index: string,
  year: number,
  month: number,
  geomHash: string,
  mode: string,
  closed: boolean,
): Promise<any | null> {
  try {
    const before = Date.now() - tileCacheTtlMs(closed);
    const { data } = await supabase
      .from("ee_tile_cache")
      .select(
        "mode, url, count, index_used, cloud_pct, last_valid_date, clear_scene_count, valid_fraction, composite_start, composite_end, days_since_observation, computed_at",
      )
      .eq("index", index)
      .eq("year", year)
      .eq("month", month)
      .eq("geometry_hash", geomHash)
      .eq("mode", mode)
      .gt("computed_at", new Date(before).toISOString())
      .maybeSingle();
    if (!data) return null;
    return {
      mode: data.mode,
      url: data.url,
      count: data.count ?? 0,
      indexUsed: data.index_used || undefined,
      cloudPct: data.cloud_pct != null ? data.cloud_pct : undefined,
      lastValidDate: data.last_valid_date || undefined,
      clearSceneCount: data.clear_scene_count != null ? data.clear_scene_count : undefined,
      validFraction: data.valid_fraction != null ? data.valid_fraction : undefined,
      compositeStart: data.composite_start || undefined,
      compositeEnd: data.composite_end || undefined,
      daysSinceObservation: data.days_since_observation != null ? data.days_since_observation : undefined,
    };
  } catch (e) {
    console.error("[ee-data] ee_tile_cache read failed:", e);
    return null;
  }
}

async function writeTileCache(row: any) {
  try {
    const { error } = await supabase
      .from("ee_tile_cache")
      .upsert(row, { onConflict: "index,year,month,geometry_hash,mode" });
    if (error) console.error("[ee-data] ee_tile_cache upsert failed:", error);
  } catch (e) {
    console.error("[ee-data] ee_tile_cache upsert failed:", e);
  }
}

// ── getRadarVegetationIndex ────────────────────────────────────────────────
// Sentinel-1 radar RVI composite over a date window — the radar fallback
// and the direct RVI band tab.
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
  const url = await getMapUrl(rvi, VIS.rvi as Record<string, unknown>);
  return { count, url };
}

// Numeric mean RVI over a date window for a geometry (the radar twin of
// getRadarVegetationIndex, which returns a tile URL — here we return the mean
// VALUE the sidebar can grade). Same dB→linear-power conversion required (S1_GRD
// backscatter arrives in dB; RVI on raw dB saturates flat). Returns null when
// there's no usable pass in the window.
async function getRadarRviValue(geom: any, startDate: any, endDate: any): Promise<number | null> {
  const s1 = ee
    .ImageCollection("COPERNICUS/S1_GRD")
    .filterBounds(geom)
    .filterDate(startDate, endDate)
    .filter(ee.Filter.eq("instrumentMode", "IW"))
    .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VV"))
    .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VH"));
  const count = await evaluate(s1.size());
  if (!count) return null;
  const composite = s1.median().clip(geom);
  const vvLinear = ee.Image(10).pow(composite.select("VV").divide(10));
  const vhLinear = ee.Image(10).pow(composite.select("VH").divide(10));
  const rvi = vhLinear.multiply(4).divide(vvLinear.add(vhLinear)).rename("RVI");
  const result = await evaluate(
    rvi.reduceRegion({
      reducer: ee.Reducer.mean(),
      geometry: geom,
      scale: 10,
      maxPixels: 1e9,
    }),
  );
  return result && result.RVI != null ? result.RVI : null;
}

// Growth-stage name as-of a specific SCENE date (not "now"), so the sidebar's
// stage for a clicked observation matches the era of that scene. Returns null
// when there's no valid planting date.
function stageNameAsOf(sceneDate: string, plantingDate: string | null): string | null {
  if (!plantingDate) return null;
  const days = Math.floor(
    (new Date(sceneDate + "T00:00:00Z").getTime() - new Date(plantingDate).getTime()) / 86400000,
  );
  return stageNameForDayCount(days >= 0 ? days : null);
}

async function actionGetIndexTile(payload: any) {
  // RVI is deliberately resolved BEFORE the BANDS gate: it has no optical band
  // pair, and selecting it means "show me the radar view", not "fall back to
  // NDVI silently". Unlike the automatic radar_fallback (used when optical is
  // cloud-blocked), a direct RVI request returns no data rather than quietly
  // showing an optical index under an RVI tab.
  const rawIndex = payload.index;
  const index =
    rawIndex === "rvi"
      ? "rvi"
      : rawIndex && BANDS[rawIndex]
        ? rawIndex
        : "ndvi";
  const vis = VIS[index];
  const geom = toEeGeometry(payload.geometry);
  const start = ee.Date.fromYMD(payload.year, payload.month, 1);
  const end = start.advance(1, "month");

  // ── Tile cache hit (§1 of the ee-cost-control directive) ────────────────
  // A repeat visit to an already-computed (index, month, area) returns the
  // cached mode/URL plus the facts the map renders, skipping Earth Engine
  // entirely. TTL differs for closed vs open months (see tileCacheTtlMs) —
  // closed months are deterministic but the signed URL still lapses, so both
  // are TTL'd, never permanent.
  const geomHash = geometryHash(payload.geometry);
  const closed = tileIsClosed(payload.year, payload.month);
  // Mode-aware cache: the optical row is a distinct cache unit from any radar
  // fallback row for the same index+month (cloud conditions change which source
  // is valid). We look up the `optical` unit — an optical request must never be
  // served a radar fallback's cached tile, and vice versa.
  const cached = await readTileCache(index, payload.year, payload.month, geomHash, "optical", closed);
  if (cached) return cached;

  let result: any;

  // 0. Per-scene RVI: the user clicked a specific Browse Observations date while
  //    on the RVI tab. Radar is the explicit ask, so center a ±15-day Sentinel-1
  //    window on THAT exact date (not the scrubbed month) and bypass the month-
  //    level tile cache — the cached rows are keyed to (index, month) with no
  //    date column, so a per-scene request must never resolve to a different
  //    date's cached composite. Returns an honest no_data when no radar pass
  //    lands near the clicked date.
  if (index === "rvi" && payload.sceneDate) {
    const day = ee.Date(payload.sceneDate);
    const radar = await getRadarVegetationIndex(
      geom,
      day.advance(-15, "day"),
      day.advance(15, "day"),
    );
    if (radar.count > 0 && radar.url) {
      return {
        mode: "radar_index",
        count: radar.count,
        url: radar.url,
        indexUsed: "RVI",
        sceneDate: payload.sceneDate,
      };
    }
    return { mode: "no_data", count: 0, url: null, sceneDate: payload.sceneDate };
  }

  if (index === "rvi") {
    const radar = await getRadarVegetationIndex(
      geom,
      start.advance(-15, "day"),
      end.advance(15, "day"),
    );
    if (radar.count > 0 && radar.url) {
      result = {
        mode: "radar_index",
        count: radar.count,
        url: radar.url,
        indexUsed: "RVI",
      };
    } else {
      result = { mode: "no_data", count: 0, url: null };
    }
    await writeTileCache({
      index,
      year: payload.year,
      month: payload.month,
      geometry_hash: geomHash,
      mode: result.mode,
      url: result.url,
      count: result.count ?? 0,
      index_used: result.indexUsed || null,
      is_closed_period: closed,
    });
    return result;
  }

  // 0. Per-scene index: the user clicked a specific observation date in the
  //    strip. Render that exact scene's index (least-cloudy same-day orbit),
  //    NOT the month's median composite — so the map tile follows the selected
  //    date instead of staying locked on the month's clearest date. The tile
  //    cache is bypassed: its rows are keyed to (index, month, area) with no
  //    date column, so a per-scene tile must never be served from the
  //    month-composite cache.
  //
  //    If that exact date has NO clean (cloud < 40%) optical scene, we do NOT
  //    silently fall through to the month composite (that was the old bug).
  //    Instead we honor the clicked date: try Sentinel-1 RVI centered on THAT
  //    date (radar_scene_fallback), and if there's no radar pass nearby either,
  //    return an honest "no data for this scene" (no_data_for_scene). This
  //    matches the frontend store-patch that no longer nulls out sceneDate for
  //    cloud-blocked observations.
  if (index !== "rvi" && payload.sceneDate) {
    const day = ee.Date(payload.sceneDate);
    const dayRaw = ee
      .ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
      .filterBounds(geom)
      .filterDate(day, day.advance(1, "day"))
      .sort("CLOUDY_PIXEL_PERCENTAGE");
    const dayCount = await evaluate(dayRaw.size());

    // Scene-level pre-filter is non-binding: even a scene with high overall
    // cloud may have clear pixels over THIS field, so the pixel-level mask
    // decides. Use the masked single-day composite; only use it if it actually
    // has valid pixels over the geometry.
    const masked = await buildMaskedComposite(geom, day, day.advance(1, "day"), index);
    if (masked.clearSceneCount > 0 && masked.img) {
      const img = masked.img.clip(geom);
      const url = await getMapUrl(img, vis);
      return {
        mode: "optical",
        count: dayCount,
        url,
        sceneDate: payload.sceneDate,
        clearSceneCount: masked.clearSceneCount,
        validFraction: masked.validFraction,
        compositeStart: masked.compositeStart,
        compositeEnd: masked.compositeEnd,
      };
    }

    // No clean optical scene on that exact date (no capture, or the only
    // same-day scenes are cloud-blocked). Try radar centered on THAT date so
    // the clicked date stays meaningful. Capture the cloud % of the least
    // cloudy optical scene (if any) so the UI can tell the user why optical
    // was skipped.
    let sceneCloudPct: number | null = null;
    if (dayCount > 0) {
      try {
        sceneCloudPct = await evaluate(dayRaw.first().get("CLOUDY_PIXEL_PERCENTAGE"));
      } catch (e) {
        console.error("scene cloud% read failed:", e);
      }
    }
    try {
      const radar = await getRadarVegetationIndex(
        geom,
        day.advance(-15, "day"),
        day.advance(15, "day"),
      );
      if (radar.count > 0 && radar.url) {
        return {
          mode: "radar_scene_fallback",
          count: radar.count,
          url: radar.url,
          indexUsed: "RVI",
          sceneDate: payload.sceneDate,
          cloudPct: sceneCloudPct,
        };
      }
    } catch (e) {
      console.error("per-scene radar fallback failed:", e);
    }

    // No clean optical AND no radar pass near the clicked date — be honest.
    return {
      mode: "no_data_for_scene",
      count: dayCount,
      url: null,
      sceneDate: payload.sceneDate,
      cloudPct: sceneCloudPct,
    };
  }

  // 1. Exact requested month, pixel-masked clean optical scenes — the ideal
  //    case. Each scene is cloud/shadow-masked per-pixel (s2cloudless + SCL +
  //    cloud-edge buffer, see _shared/cloudMask.ts), so only valid surface
  //    pixels compose the median and no cloud pixel is ever colored. The
  //    metadata (clearSceneCount, validFraction, actual window) is returned so
  //    the UI can label confidence honestly.
  const masked = await buildMaskedComposite(geom, start, end, index);
  const clearSceneCount = masked.clearSceneCount;
  if (clearSceneCount > 0 && masked.img) {
    const composite = masked.img.clip(geom);
    const url = await getMapUrl(composite, vis);
    result = {
      mode: "optical",
      count: clearSceneCount,
      url,
      clearSceneCount,
      validFraction: masked.validFraction,
      compositeStart: masked.compositeStart,
      compositeEnd: masked.compositeEnd,
    };
    await writeTileCache({
      index,
      year: payload.year,
      month: payload.month,
      geometry_hash: geomHash,
      mode: result.mode,
      url: result.url,
      count: result.count ?? 0,
      clear_scene_count: clearSceneCount,
      valid_fraction: masked.validFraction,
      composite_start: masked.compositeStart,
      composite_end: masked.compositeEnd,
      index_used: null,
      is_closed_period: closed,
    });
    return result;
  }

  // 2. No clean scene THIS month (either none captured yet, or all too
  //    cloudy) — try Sentinel-1 radar. It has its own independent revisit
  //    schedule, so it doesn't care whether S2 has anything yet this month.
  try {
    const radar = await getRadarVegetationIndex(
      geom,
      start.advance(-15, "day"),
      end.advance(15, "day"),
    );
    if (radar.count > 0 && radar.url) {
      result = {
        mode: "radar_fallback",
        count: radar.count,
        url: radar.url,
        indexUsed: "RVI",
      };
      await writeTileCache({
        index,
        year: payload.year,
        month: payload.month,
        geometry_hash: geomHash,
        mode: result.mode,
        url: result.url,
        count: result.count ?? 0,
        index_used: result.indexUsed || null,
        is_closed_period: closed,
      });
      return result;
    }
  } catch (e) {
    console.error("radar fallback failed:", e);
  }

  // 3. No radar either — widen the OPTICAL search backward up to 90 days,
  //    not bound to the calendar month, and show the least-cloudy scene
  //    found in that window as true color. Covers BOTH "current month has
  //    zero captures yet" (early-month case) AND genuine cloud-heavy months
  //    with the same one code path.
  const lookbackStart = start.advance(-90, "day");
  const widenedRaw = ee
    .ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
    .filterBounds(geom)
    .filterDate(lookbackStart, end);
  const widenedCount = await evaluate(widenedRaw.size());
  if (widenedCount === 0) {
    result = { mode: "no_data", count: 0, url: null };
  } else {
    const bestScene = widenedRaw.sort("CLOUDY_PIXEL_PERCENTAGE").first();
    const cloudPct = await evaluate(bestScene.get("CLOUDY_PIXEL_PERCENTAGE"));
    const lastValidDate = tsToISO(
      await evaluate(bestScene.get("system:time_start")),
    );
    let url: string | null = null;
    try {
      url = await getMapUrl(bestScene.clip(geom), {
        bands: TRUE_COLOR_BANDS,
        ...TRUE_COLOR_VIS,
      });
    } catch (e) {
      console.error("cloud-blocked true-color getMap failed:", e);
    }
    result = { mode: "cloud_blocked", count: 0, url, cloudPct, lastValidDate };
  }
  await writeTileCache({
    index,
    year: payload.year,
    month: payload.month,
    geometry_hash: geomHash,
    mode: result.mode,
    url: result.url,
    count: result.count ?? 0,
    index_used: result.indexUsed || null,
    cloud_pct: result.cloudPct != null ? result.cloudPct : null,
    last_valid_date: result.lastValidDate || null,
    is_closed_period: closed,
  });
  return result;
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
    // RVI spans 0..VIS.rvi.max (2); divide the FULL range into 10 equal buckets
    // so dense-canopy values above the old 1.0 ceiling no longer fall outside
    // every bucket (they previously vanished from per-bucket areaSqm while
    // still counting toward totalAreaSqm, under-summing the percentages).
    const max = (VIS.rvi as { max: number }).max;
    const step = max / 10;
    return Array.from({ length: 10 }, (_, i) => ({
      lo: i * step,
      hi: (i + 1) * step,
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

// ── getRviTimeSeries ──────────────────────────────────────────────────────
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
  month?: { year: number; month: number },
): Promise<number | null> {
  if (month) {
    // Calendar-month window — mirrors the exact scene window the map tile and
    // hero NDVI use for the scrubbed month, so the score and badge agree.
    const start = ee.Date.fromYMD(month.year, month.month, 1);
    return reduceIndexMean(geom, index, start, start.advance(1, "month"));
  }
  const end = ee.Date(Date.now());
  return reduceIndexMean(geom, index, end.advance(-days, "day"), end);
}

// Shared window→value reduce for index scoring: clean S2 median within [start,
// end), then mean over the geometry. Returns null when no clean scene exists.
async function reduceIndexMean(
  geom: any,
  index: string,
  start: any,
  end: any,
): Promise<number | null> {
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

  // ── Scene-anchored status (sidebar fix-fallback) ─────────────────────────
  // When the caller pins a specific observation date (a clicked observation in
  // the strip, including a cloud-blocked one), answer for THAT exact date:
  //   mode 'optical' -> a clean (cloud < 40%) Sentinel-2 scene that day,
  //                     with ndviValue
  //   mode 'radar'   -> no clean optical that day, but a Sentinel-1 RVI pass
  //                     within ±15 days (radar fallback), with rviValue
  //   mode 'no_data' -> neither (honest, no silent substitution to another date)
  // This is what lets the sidebar (hero value / growth stage / confidence)
  // follow the exact clicked date, exactly like the map tile's per-scene branch.
  const sceneDate = payload.sceneDate || null;
  if (sceneDate) {
    const day = ee.Date(sceneDate);
    // forceRadar — the RVI tab makes radar the explicit ask, so skip the optical
    // clean-scene check entirely and grade the exact date by Sentinel-1 RVI even
    // when a clean optical scene exists.
    const forceRadar = !!payload.forceRadar;
    if (!forceRadar) {
      // Pixel-level mask decides optically valid coverage over THIS field; the
      // single-day composite is used only if it has valid pixels over the geom.
      const masked = await buildMaskedComposite(geom, day, day.advance(1, "day"), "ndvi");
      if (masked.clearSceneCount > 0 && masked.img) {
        const result = await evaluate(
          masked.img.reduceRegion({
            reducer: ee.Reducer.mean(),
            geometry: geom,
            scale: 10,
            maxPixels: 1e9,
          }),
        );
        const name = "ndvi".toUpperCase();
        const value = result && result[name] != null ? result[name] : null;
        if (value != null) {
          const daysSince = Math.round(
            (Date.now() - new Date(sceneDate).getTime()) / 86400000,
          );
          return {
            mode: "optical",
            ndviValue: value,
            rviValue: null,
            status: "optical",
            stage: stageNameAsOf(sceneDate, payload.plantingDate ?? null),
            confidence: "high",
            windowDays: 0,
            clearSceneCount: masked.clearSceneCount,
            validFraction: masked.validFraction,
            compositeStart: masked.compositeStart,
            compositeEnd: masked.compositeEnd,
            observationDate: sceneDate,
            daysSinceObservation: daysSince,
          };
        }
      }
    }

    // No clean optical scene that exact date (or radar is forced on the RVI
    // tab) — grade by radar centered on it.
    try {
      const radar = await getRadarRviValue(geom, day.advance(-15, "day"), day.advance(15, "day"));
      if (radar != null) {
        return {
          mode: "radar",
          ndviValue: null,
          rviValue: radar,
          status: "radar",
          stage: stageNameAsOf(sceneDate, payload.plantingDate ?? null),
          confidence: "medium",
          windowDays: 30,
        };
      }
    } catch (e) {
      console.error("per-scene radar status failed:", e);
    }

    return {
      mode: "no_data",
      ndviValue: null,
      rviValue: null,
      status: "no_data",
      stage: null,
      confidence: "low",
      windowDays: 0,
    };
  }

  let ndvi = await computeNdviOverWindow(geom, 14);
  let confidence: "high" | "low" = "high";
  if (ndvi === null) {
    ndvi = await computeNdviOverWindow(geom, 90);
    confidence = "low";
  }
  if (ndvi === null) {
    return {
      mode: "no_data",
      ndviValue: null,
      rviValue: null,
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
    mode: "optical",
    ndviValue: ndvi,
    rviValue: null,
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

  // Score is scoped to the SAME month the map tile / hero NDVI badge show for
  // the scrubbed slider position (payload {year, month}, matching getIndexTile/
  // getFieldBundle). If the caller omits it (legacy), fall back to the current
  // calendar month so the call still answers "current health".
  const now = new Date();
  const year = payload.year != null ? payload.year : now.getUTCFullYear();
  const month = payload.month != null ? payload.month : now.getUTCMonth() + 1;

  let dayCount: number | null = null;
  if (plantingDate) {
    // Growth stage is as-of the SCRUBBED MONTH (month end), not "today" — so
    // the stage/per-verdict stays consistent with the month the indices are
    // read from, exactly like the hero badge. Date.UTC(year, month, 1) is the
    // start of the NEXT month; subtract one ms for month-end.
    const monthEndMs = Date.UTC(year, month, 1) - 1;
    const days = Math.floor((monthEndMs - new Date(plantingDate).getTime()) / 86400000);
    if (days >= 0) dayCount = days;
  }
  const stage = stageNameForDayCount(dayCount);
  const primaryIndex = primaryIndexForStage(stage);
  const baseWeights = healthScoreWeights(stage);

  // The trailing lookback used when the exact month has no clean scene. It ends
  // at the MONTH END (not "now") so scrubbing to an older month never leaks in
  // scenes from later months — the score always reflects the era the slider is
  // on, exactly like the map tile's 90-day fallback.
  const monthStart = ee.Date.fromYMD(year, month, 1);
  const monthEnd = monthStart.advance(1, "month");

  const raw: Record<string, number> = {};
  const normalized: Record<string, number | null> = {};
  let confidence: "high" | "low" = "high";
  for (const index of Object.keys(baseWeights)) {
    // Tier 1: the exact scrubbed month (matches the hero NDVI + tile window).
    let value = await computeIndexOverWindow(geom, index, 0, { year, month });
    if (value === null) {
      // Tier 2: no clean scene that month — widen to a 90-day lookback ending
      // at month-end (low confidence, same spirit as the map's fallback).
      value = await reduceIndexMean(geom, index, monthEnd.advance(-90, "day"), monthEnd);
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

  // Defensive weight renormalization: the score blend must ALWAYS sum to 1.0.
  // Drop any index that ended up without a usable normalized value (e.g. a
  // VIS range gap) and redistribute its weight proportionally across the
  // indices that DO have one, so the returned `weights` (and the combined
  // score) never silently under-count or vanish a missing component.
  const present = Object.keys(normalized).filter((i) => normalized[i] != null);
  const weights: Record<string, number> = {};
  if (present.length) {
    const presentWeight = present.reduce(
      (sum, i) => sum + (baseWeights[i] ?? 0),
      0,
    );
    const scale = presentWeight > 0 ? 1 / presentWeight : 1;
    for (const i of present) weights[i] = (baseWeights[i] ?? 0) * scale;
  }

  const score = Math.round(
    Object.entries(weights).reduce(
      (sum, [i, w]) => sum + (normalized[i] ?? 0) * w,
      0,
    ) * 100,
  );
  const band = translateIndexValue("composite", score);
  const discrepancy = detectDiscrepancy(raw, {
    score,
    primaryIndex,
    stage,
  });
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

// ── getFieldBundle ──────────────────────────────────────────────────────────
// Consolidates the several per-field reads that fire together when a field
// is selected (tile, ndvi dashboard trend, current-tab trend, rainfall,
// benchmark) into ONE request. Runs them concurrently INSIDE this single
// already-authenticated isolate — the earlier per-action version fired
// each as a separate ee-data invocation, paying EE auth/isolate-cold-start
// latency N times instead of once. See field-bundle-fix-guide.md.
async function actionGetFieldBundle(payload: any) {
  const currentIndex = payload.currentIndex && BANDS[payload.currentIndex]
    ? payload.currentIndex
    : "ndvi";
  const months = payload.months || [];
  const year = payload.year;
  const month = payload.month;

  const tilePromise = actionGetIndexTile({
    index: currentIndex,
    year,
    month,
    geometry: payload.geometry,
  });
  const ndviTrendPromise = actionGetIndexTimeSeries({
    index: "ndvi",
    months,
    geometry: payload.geometry,
  });
  // Skip a duplicate call if the current tab IS ndvi — reuse the same trend.
  // RVI is radar (Sentinel-1), not an optical band pair — it must go through
  // the radar series, not actionGetIndexTimeSeries (which resolves unknown
  // indices back to ndvi).
  let chartTrendPromise: Promise<any>;
  if (currentIndex === "ndvi") {
    chartTrendPromise = ndviTrendPromise;
  } else if (currentIndex === "rvi") {
    chartTrendPromise = actionGetRviTimeSeries({
      months,
      geometry: payload.geometry,
    });
  } else {
    chartTrendPromise = actionGetIndexTimeSeries({
      index: currentIndex,
      months,
      geometry: payload.geometry,
    });
  }
  const rainfallPromise = actionGetRainfall({
    geometry: payload.geometry,
    daysBack: 21,
  });
  const benchmarkPromise = actionGetRecentIndexValue({
    index: "ndvi",
    geometry: payload.geometry,
  });

  const [tile, ndviTrend, chartTrend, rainfall, benchmark] = await Promise.all([
    tilePromise,
    ndviTrendPromise,
    chartTrendPromise,
    rainfallPromise,
    benchmarkPromise,
  ]);

  return { tile, ndviTrend, chartTrend, rainfall, benchmark };
}

// ── Router ─────────────────────────────────────────────────────────────────
type Handler = (payload: any) => Promise<Record<string, unknown>>;
const HANDLERS: Record<string, Handler> = {
  getIndexTile: actionGetIndexTile,
  getTrueColorScene: actionGetTrueColorScene,
  getLatestTrueColor: actionGetLatestTrueColor,
  getZoneBreakdown: actionGetZoneBreakdown,
  getIndexTimeSeries: actionGetIndexTimeSeries,
  getRviTimeSeries: actionGetRviTimeSeries,
  detectPlantingDate: actionDetectPlantingDate,
  getDryMonths: actionGetDryMonths,
  getFieldStatus: actionGetFieldStatus,
  getFieldHealthScore: actionGetFieldHealthScore,
  getRecentIndexValue: actionGetRecentIndexValue,
  getAllFieldStatuses: actionGetAllFieldStatuses,
  getAllFieldTrends: actionGetAllFieldTrends,
  getRainfall: actionGetRainfall,
  getObservations: actionGetObservations,
  getFieldBundle: actionGetFieldBundle,
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
