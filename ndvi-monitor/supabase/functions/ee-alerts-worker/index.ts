import { createClient } from "npm:@supabase/supabase-js@2";
import ee from "npm:@google/earthengine@0.1.395";
import { generateExplanation, languageLine } from "../_shared/llm.ts";
// Growth-stage thresholds live in _shared/growthStage.ts so this worker and
// the ee-data function stay in sync automatically.
import { statusFromNdvi } from "../_shared/growthStage.ts";
// Phase 1 decision engine — the deterministic tier/action the LLM may only
// phrase, shared with consult-ai and the client (src/services/decision.js).
import {
  buildDecision,
  decisionPromptBlock,
  decisionText,
} from "../_shared/decision.ts";
import { getWeatherContext } from "../_shared/weather.ts";
import type { WeatherContext } from "../_shared/weather.ts";
import {
  getProvinceWeather,
  provinceWeatherLine,
} from "../_shared/dataef.ts";
import {
  addCloudProbability,
  validPixelMask,
  validPixelFraction,
  CLOUD_RESILIENCE,
} from "../_shared/cloudMask.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
const EE_KEY = JSON.parse(Deno.env.get("EE_SERVICE_ACCOUNT_KEY") || "{}");

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

function eeInit(): Promise<void> {
  return new Promise((resolve, reject) => {
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
}

function toEeGeometry(geojson: any) {
  const geometry =
    geojson && geojson.type === "Feature" ? geojson.geometry : geojson;
  return ee.Geometry(geometry);
}

// ── NDVI: tight-window-first, widen-on-empty ────────────────────────────
// A single flat 90-day median masks recent-onset stress (e.g. healthy for
// 75 days + stressed for the last 10 still reads "healthy" after median).
// So: try a tight 14-day window first (reflects *current* health). Only
// widen to 90 days — and mark the result low-confidence — when the short
// window has zero clean scenes at all (this is what the wide window is
// legitimately for: coverage during a cloudy stretch, not "current status").

// ── Cloud-masked NDVI over a window ──────────────────────────────────────
// Applies per-pixel cloud masking (s2cloudless probability, matching the
// standard approach used across the app) before compositing, then checks
// what fraction of the field actually has valid (unmasked) pixels. A scene
// can pass the 40% scene-level CLOUDY_PIXEL_PERCENTAGE filter while still
// being mostly cloud-covered over this specific field — the coverage check
// catches that case and returns null (same as "no clean scene"), which
// correctly triggers the existing 90-day widen / radar fallback chain in
// getFieldReading().
// Small promisified wrapper so validPixelFraction (which expects an
// `evaluate` callback-style function, matching ee-data's usage) works here
// too, since this worker otherwise uses raw ee .evaluate() callbacks.
function eeEvaluate(obj: any): Promise<any> {
  return new Promise((resolve, reject) => {
    obj.evaluate((result: any, err: string) => {
      if (err) reject(new Error(err));
      else resolve(result);
    });
  });
}

// ── NDVI: tight-window-first, widen-on-empty ────────────────────────────
// Now uses the SAME per-pixel cloud mask as ee-data's map-tile pipeline
// (_shared/cloudMask.ts) instead of raw unmasked reflectance, plus a
// field-coverage check (CLOUD_RESILIENCE.MIN_VALID_PIXEL_FRACTION) so a
// scene that passes the scene-level CLOUDY_PIXEL_PERCENTAGE filter but is
// still mostly cloud-covered over THIS field returns null — which
// getFieldReading() already treats as "try the next fallback" (90-day
// window, then radar).
function computeNdviOverWindow(
  geom: any,
  days: number,
): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const end = ee.Date(Date.now());
    const start = end.advance(-days, "day");

    const s2Raw = ee
      .ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
      .filterBounds(geom)
      .filterDate(start, end)
      .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 40));

    const s2WithProb = addCloudProbability(s2Raw, ee);

    const masked = s2WithProb.map((img: any) => {
      const mask = validPixelMask(img, ee);
      return img.updateMask(mask);
    });

    masked.size().evaluate(async (count: number, err: string) => {
      if (err) return reject(new Error(err));
      if (!count) return resolve(null);

      try {
        const composite = masked.median();
        const ndviImg = composite
          .normalizedDifference(["B8", "B4"])
          .rename("nd");

        const validFraction = await validPixelFraction(
          ndviImg,
          "nd",
          geom,
          10,
          ee,
          eeEvaluate,
        );

        if (
          validFraction == null ||
          validFraction < CLOUD_RESILIENCE.MIN_VALID_PIXEL_FRACTION
        ) {
          console.log(
            `[DEBUG-RVI] computeNdviOverWindow low coverage: validFraction=${validFraction}, days=${days}, threshold=${CLOUD_RESILIENCE.MIN_VALID_PIXEL_FRACTION}`,
          );
          return resolve(null);
        }

        ndviImg
          .reduceRegion({
            reducer: ee.Reducer.mean(),
            geometry: geom,
            scale: 10,
            maxPixels: 1e9,
          })
          .evaluate((result: any, e: string) => {
            if (e) reject(new Error(e));
            else resolve(result?.nd ?? 0);
          });
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
  });
}

// ── Sentinel-1 RVI (radar) fallback ─────────────────────────────────────
// Ported from ee-data.ts's getRadarVegetationIndex — same math, same ±15-day
// window around "now" (S1's ~6-12 day revisit needs that much slack). Backscatter
// arrives in dB (log scale); RVI must be computed on LINEAR power or the ratio
// saturates into a flat, meaningless image — see the dB→linear fix already
// validated for the cement-factory AOI.
function getRadarVegetationIndex(geom: any): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const end = ee.Date(Date.now()).advance(15, "day");
    const start = ee.Date(Date.now()).advance(-15, "day");
    const s1 = ee
      .ImageCollection("COPERNICUS/S1_GRD")
      .filterBounds(geom)
      .filterDate(start, end)
      .filter(ee.Filter.eq("instrumentMode", "IW"))
      .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VV"))
      .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VH"));
    s1.size().evaluate((count: number, err: string) => {
      if (err) return reject(new Error(err));
      if (!count) return resolve(null);
      const composite = s1.median().clip(geom);
      const vvLinear = ee.Image(10).pow(composite.select("VV").divide(10));
      const vhLinear = ee.Image(10).pow(composite.select("VH").divide(10));
      const rvi = vhLinear
        .multiply(4)
        .divide(vvLinear.add(vhLinear))
        .rename("RVI");
      rvi
        .reduceRegion({
          reducer: ee.Reducer.mean(),
          geometry: geom,
          scale: 10,
          maxPixels: 1e9,
        })
        .evaluate((result: any, e: string) => {
          if (e) reject(new Error(e));
          else resolve(result?.RVI ?? null);
        });
    });
  });
}

// PLACEHOLDER threshold, not yet calibrated against real paired NDVI/RVI
// readings — see the note in getFieldReading() below. Treat any radar-only
// reading as directional, never as precise as an optical growth-stage call.
const RVI_STRESS_THRESHOLD = 0.4;

type FieldReading =
  | {
      source: "ndvi";
      ndvi: number;
      confidence: "high" | "low";
      windowDays: number;
    }
  | { source: "radar"; rvi: number }
  | { source: "none" };

// Single entry point the worker loop calls: optical NDVI (tight, then wide),
// and ONLY when optical has nothing at all in 90 days, try Sentinel-1 RVI as
// a "can we say anything at all" fallback. This mirrors the map view's
// cloud-blocked → radar fallback order in ee-data.ts's getIndexTile, but here
// it feeds an alert message instead of a tile, so the radar branch is kept
// separate from statusFromNdvi() rather than merged into it: RVI's 0–1 scale
// and its "stressed" cutoff are NOT the same as NDVI's — they haven't been
// calibrated against this app's growth-stage thresholds yet (that needs a
// side-by-side comparison on a few clear-sky days where both NDVI and RVI
// exist for the same field). Until that calibration happens, a radar reading
// is reported as a directional, unconfirmed signal only — never as a precise
// growth-stage classification.
async function getFieldReading(geojson: any): Promise<FieldReading> {
  const geom = toEeGeometry(geojson);
  const ndvi14 = await computeNdviOverWindow(geom, 14);
  if (ndvi14 !== null) {
    return { source: "ndvi", ndvi: ndvi14, confidence: "high", windowDays: 14 };
  }
  const ndvi90 = await computeNdviOverWindow(geom, 90);
  if (ndvi90 !== null) {
    return { source: "ndvi", ndvi: ndvi90, confidence: "low", windowDays: 90 };
  }
  const rvi = await getRadarVegetationIndex(geom).catch((e) => {
    console.warn(
      `Radar fallback failed: ${e instanceof Error ? e.message : String(e)}`,
    );
    return null;
  });
  if (rvi !== null) {
    return { source: "radar", rvi };
  }
  return { source: "none" };
}

function getRainfallMm(geojson: any): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const geom = toEeGeometry(geojson);
    const end = ee.Date(Date.now());
    const start = end.advance(-21, "day");
    ee.ImageCollection("UCSB-CHG/CHIRPS/DAILY")
      .filterDate(start, end)
      .sum()
      .reduceRegion({
        reducer: ee.Reducer.mean(),
        geometry: geom,
        scale: 5000,
        maxPixels: 1e9,
      })
      .evaluate((result: any, err: string) => {
        if (err) reject(new Error(err));
        else resolve(result?.precipitation ?? 0);
      });
  });
}

// LSWI (B8/B11) for the same 90-day window — moisture/flooding context for the
// advisory text. Returns null (not crash) on an empty/noise collection.
function getLswiForGeometry(geojson: any): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const geom = toEeGeometry(geojson);
    const end = ee.Date(Date.now());
    const start = end.advance(-90, "day");
    const collection = ee
      .ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
      .filterBounds(geom)
      .filterDate(start, end)
      .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 40));
    collection.size().evaluate((count: number, err: string) => {
      if (err) return reject(new Error(err));
      if (!count) return resolve(null);
      const img = collection.median().normalizedDifference(["B8", "B11"]);
      img
        .reduceRegion({
          reducer: ee.Reducer.mean(),
          geometry: geom,
          scale: 10,
          maxPixels: 1e9,
        })
        .evaluate((result: any, e: string) => {
          if (e) reject(new Error(e));
          else resolve(result?.nd ?? null);
        });
    });
  });
}

// NDVI today vs. ~14+ days earlier, expressed as a % change (mirrors the app's
// stress-window logic), so the advisory can say "NDVI fell X%". Returns null
// when we can't compare two points cleanly.
function getNdviTrendPct(geojson: any): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const geom = toEeGeometry(geojson);
    const end = ee.Date(Date.now());
    const start = end.advance(-90, "day");
    const collection = ee
      .ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
      .filterBounds(geom)
      .filterDate(start, end)
      .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 40))
      .sort("system:time_start", false);
    const series = collection.map((img: any) => {
      const ndvi = img.normalizedDifference(["B8", "B4"]).rename("ndvi");
      const value = ndvi.reduceRegion({
        reducer: ee.Reducer.mean(),
        geometry: geom,
        scale: 10,
        maxPixels: 1e9,
      });
      return ee.Feature(null, {
        date: img.date().format("YYYY-MM-dd"),
        value: value.get("ndvi"),
      });
    });
    series
      .filter(ee.Filter.notNull(["value"]))
      .evaluate((result: any, err: string) => {
        if (err) return reject(new Error(err));
        const pts = (result?.features || [])
          .map((f: any) => ({
            date: f.properties.date,
            value: f.properties.value,
          }))
          .sort((a: any, b: any) => a.date.localeCompare(b.date));
        if (pts.length < 2) return resolve(null);
        const recent = pts[pts.length - 1].value;
        let earlier = null;
        for (let i = pts.length - 2; i >= 0; i--) {
          const d = pts[i];
          if (d.value != null) {
            const diffDays =
              (new Date(pts[pts.length - 1].date).getTime() -
                new Date(d.date).getTime()) /
              86400000;
            if (diffDays >= 14) {
              earlier = d.value;
              break;
            }
          }
        }
        if (earlier === null || !earlier) return resolve(null);
        resolve(((earlier - recent) / earlier) * 100);
      });
  });
}

// The original flat template — still the fallback if every LLM provider fails,
// so a worker run never sends nothing or crashes just because the LLM is down.
function buildAlertMessage(
  fieldName: string,
  status: string,
  stage: string | null,
  ndvi: number,
  rainfall: number | null,
  weather: WeatherContext | null,
  lang: string,
): string {
  const stageText = stage ? ` (${stage})` : "";
  const rainText = rainfall === null ? "n/a" : `${rainfall.toFixed(0)}mm`;
  const statusLabel =
    lang === "km"
      ? status === "stressed"
        ? "កំពុងមានស្ត្រេស"
        : status === "below_expected"
          ? "ទាបជាងការរំពឹងទុក"
          : status === "healthy"
            ? "ល្អ"
            : status.replace("_", " ")
      : status.replace("_", " ");
  const wxText =
    weather?.precipitation_probability == null
      ? ""
      : lang === "km"
        ? ` — ឱកាសភ្លៀងបន្ទាប់ 5 ថ្ងៃ ~${Math.round(weather.precipitation_probability)}%`
        : ` — next-5-day rain ~${Math.round(weather.precipitation_probability)}%`;
  if (lang === "km") {
    return `វាល ${fieldName}: ${statusLabel}${stageText} — NDVI ${ndvi.toFixed(2)}, ទឹកភ្លៀង ${rainText} (21 ថ្ងៃ)${wxText}`;
  }
  return `${fieldName}: ${statusLabel}${stageText} — NDVI ${ndvi.toFixed(2)}, ${rainText} rain (21d)${wxText}`;
}

// Radar-derived message — deliberately simpler and more hedged than the
// optical template. No growth-stage claim, no precise NDVI-style number:
// just "possible stress" vs "no anomaly" framed as unconfirmed, plus a note
// that this is a photo-free (radar) reading, so farmers/co-ops know it's a
// weaker signal than a normal alert and shouldn't be read as a diagnosis.
function buildRadarAlertMessage(
  fieldName: string,
  rvi: number,
  lang: string,
): string {
  const possibleStress = rvi < RVI_STRESS_THRESHOLD;
  if (lang === "km") {
    const verdict = possibleStress
      ? "ប្រហែលជាមានស្ត្រេស (មិនទាន់បញ្ជាក់)"
      : "មិនឃើញភាពមិនប្រក្រតីច្បាស់លាស់ (មិនទាន់បញ្ជាក់)";
    return `វាល ${fieldName}: ${verdict} — ផ្អែកលើទិន្នន័យរ៉ាដា ដោយសារគ្មានរូបភាពផ្កាយរណបច្បាស់លាស់ក្នុងរយៈពេល 90 ថ្ងៃ។`;
  }
  const verdict = possibleStress
    ? "possible stress (unconfirmed)"
    : "no clear anomaly detected (unconfirmed)";
  return `${fieldName}: ${verdict} — based on radar data, since no clear satellite photo has been available in over 90 days.`;
}

async function sendTelegram(chatId: string, text: string): Promise<boolean> {
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text }),
      },
    );
    if (!res.ok) {
      const body = await res.text();
      console.error(
        `Telegram send failed for chat ${chatId}: ${res.status} ${body}`,
      );
      return false;
    }
    return true;
  } catch (e) {
    console.error(`Telegram send threw for chat ${chatId}:`, e);
    return false;
  }
}

// Guard against a provider returning empty/whitespace text.
function safeText(text: string | null, fallback: string): string {
  return text && text.trim().length > 0 ? text.trim() : fallback;
}

// ── Phase 1: deterministic tier tag + fallback action line ─────────────────
// The tier comes from buildDecision(), never from the LLM. The tag makes the
// action level explicit in every Telegram message; the action line is only
// used when the LLM fails and the flat template is sent, so the farmer still
// gets a concrete next step instead of just a status number.
const DECISION_TIER_EN: Record<string, string> = {
  monitor: "Monitor",
  scout: "Check field",
  act: "Act now",
};
const DECISION_TIER_KM: Record<string, string> = {
  monitor: "តាមដាន",
  scout: "ពិនិត្យវាល",
  act: "ធ្វើសកម្មភាពឥឡូវ",
};
const DECISION_ACTION_KM: Record<string, string> = {
  "decision.act_pre_planting": "ពិនិត្យម្តងទៀតបន្ទាប់ពីដាំ។",
  "decision.act_check_soil": "ពិនិត្យសំណើមដីនៅជម្រៅ ៥–១០ សង់ទីម៉ែត្រ។",
  "decision.act_wait_rain":
    "ភ្លៀងអាចនឹងធ្លាក់ក្នុងរយៈពេល ៣ ថ្ងៃ — អ្នកអាចរង់ចាំ ហើយពិនិត្យម្តងទៀតបន្ទាប់ពីភ្លៀង។",
  "decision.act_irrigate": "ប្រសិនបើដីស្ងួត ហើយមានទឹក សូមស្រោចទឹកស្រាលៗ។",
  "decision.act_drain": "ពិនិត្យ និងសម្អាតប្រឡាយ ហើយកុំដាក់ជីរហូតទឹកស្រក។",
  "decision.act_no_fertilizer": "កុំដាក់ជីនៅពេលមានទឹកឈរ។",
  "decision.act_monitor":
    "បន្តធ្វើដូចធម្មតា ហើយពិនិត្យម្តងទៀតបន្ទាប់ពីផ្កាយរណបឆ្លងកាត់បន្ទាប់។",
  "decision.act_scout_pest": "ដើរពិនិត្យវាល ហើយមើលសត្វល្អិត ជំងឺ ឬស្មៅ។",
  "decision.act_check_nutrients":
    "មើលពណ៌លឿង; ពិចារណាបន្ថែមជីបន្តិច ប្រសិនបើបញ្ជាក់បាន។",
};

function decisionTag(decision: any, lang: string): string {
  const labels = lang === "km" ? DECISION_TIER_KM : DECISION_TIER_EN;
  const label = decision && labels[decision.tier];
  return label ? `[${label}] ` : "";
}

function decisionActionLine(decision: any, lang: string): string {
  const item = decision && decision.actions && decision.actions[0];
  if (!item) return "";
  const text = lang === "km" ? DECISION_ACTION_KM[item.key] || "" : decisionText(item);
  if (!text) return "";
  return lang === "km" ? `ជំហានបន្ទាប់៖ ${text}` : `Next step: ${text}`;
}

// Phase 2 — should a repeat alert be skipped because the farmer already
// acknowledged the previous one? Mirrors the UI's Done / Snooze / Dismiss
// buttons (field_actions rows):
//   snoozed   -> skip until snooze_until
//   dismissed -> skip for 7 days
//   done      -> skip for 3 days
//   rated     -> never suppresses (feedback only)
function shouldSuppressAlert(lastAction: any, now = Date.now()): boolean {
  if (!lastAction) return false;
  const created = lastAction.created_at
    ? new Date(lastAction.created_at).getTime()
    : 0;
  if (lastAction.status === "snoozed" && lastAction.snooze_until) {
    return new Date(lastAction.snooze_until).getTime() > now;
  }
  if (lastAction.status === "dismissed")
    return created > 0 && now - created < 7 * 86400000;
  if (lastAction.status === "done")
    return created > 0 && now - created < 3 * 86400000;
  return false;
}

// Builds the prompt for the advisory LLM (Phase 13 Feature 1). Kept as its own
// function so the "reasoning task" is explicit and easy to tune/adjust.
function forecastContextLine(weather: WeatherContext | null): string {
  if (!weather || !weather.forecast_days?.length)
    return "weather forecast: n/a";
  const days = weather.forecast_days
    .map(
      (d) =>
        `${d.date.split("T")[0]}: rain ${d.rainPct == null ? "n/a" : `${d.rainPct}%`}, max ${d.tMax == null ? "n/a" : `${Math.round(d.tMax)}°C`}, min ${d.tMin == null ? "n/a" : `${Math.round(d.tMin)}°C`}`,
    )
    .join("; ");
  return `weather forecast (next ~5 days): ${days}`;
}

async function buildAdvisoryPrompt(
  field: any,
  ndvi: number,
  status: string,
  stage: string | null,
  rainfall: number | null,
  weather: WeatherContext | null,
  lang: string,
  officialLine = "",
  confidence: string | null = null,
): Promise<{ prompt: string; decision: ReturnType<typeof buildDecision> }> {
  const lswi = await getLswiForGeometry(field.geojson).catch(() => null);
  const pct = await getNdviTrendPct(field.geojson).catch(() => null);
  const pctLine =
    pct == null || !isFinite(pct)
      ? "n/a"
      : pct >= 0
        ? `fell about ${pct.toFixed(0)}%`
        : `rose about ${Math.abs(pct).toFixed(0)}%`;
  const stageText = stage ?? "unknown";
  const rainText = rainfall === null ? "n/a" : `${rainfall.toFixed(0)}mm`;
  const statusLabel = status.replace("_", " ");
  const langLine = languageLine(lang);

  // Day count for the decision (pre-planting guard) — planting_date can be in
  // the future, in which case there is no crop to advise on yet.
  let dayCount: number | null = null;
  if (field.planting_date) {
    dayCount = Math.floor(
      (Date.now() - new Date(field.planting_date).getTime()) / 86400000,
    );
  }

  // Deterministic decision — the LLM must only phrase this. trendPct is signed
  // (negative = declining); the worker's `pct` is a positive "fall" amount.
  const decision = buildDecision({
    index: "ndvi",
    status,
    stage,
    dayCount,
    prePlanting: dayCount != null && dayCount < 0,
    ndvi,
    rvi: null,
    lswi,
    rainfallMm: rainfall,
    forecastDays: weather?.forecast_days || null,
    // The 14-day vs 90-day window confidence. A low-confidence (90-day) reading
    // must never be graded as "act" by the decision engine.
    confidenceTier: confidence,
    observationAgeDays: null,
    mode: "optical",
    trendPct: pct == null ? null : -pct,
    cropEnglish: (field as any).crop_english || null,
  });
  const decisionBlock = decisionPromptBlock(decision);

  const prompt = `You are writing a short Telegram alert for a rice farmer in Battambang, Cambodia, about their field named "${field.name}".
Satellite data: NDVI ${ndvi.toFixed(2)} (${pctLine}), LSWI (moisture) ${lswi == null ? "n/a" : lswi.toFixed(2)}, rainfall (21 days) ${rainText}, growth stage: ${stageText}, current status: ${statusLabel}.
${forecastContextLine(weather)}
${officialLine ? `${officialLine}\nCurrent conditions describe now, not a prediction; the 5-day forecast above is the only forecast.` : ""}

${decisionBlock}

${langLine}
Write 2-3 short sentences. Describe what the numbers suggest about the likely cause of a stress signal (drought vs. flood vs. normal for this growth stage) and give ONE practical, cautious next step. Use the weather forecast to inform this: mention upcoming rain (or its absence) when it is relevant to the field's situation — e.g. warn that rain is expected soon if the field is dry, or note a dry spell ahead if the forecast shows little rain. IMPORTANT: this is guidance to inform the farmer, NOT a diagnosis — never state a cause with certainty. Always hedge with words like "likely" / "could be". Do not repeat the technical index names (NDVI, LSWI) in the reply itself. Finish with the recommended next step from the DECISION block, phrased naturally — do NOT change the action tier, urgency or recommended step.`;

  return { prompt, decision };
}

// ── Phase 3: per-chat digest ───────────────────────────────────────────────
// A farmer with several fields currently gets one Telegram message per field.
// Buffer the optical advisories per chat and send one digest instead. Telegram
// caps messages at 4096 chars, so cap well under that, truncate long items, and
// turn overflow into "…and N more field(s)".
const DIGEST_MAX_CHARS = 3800;
const DIGEST_ITEM_MAX_CHARS = 500;

interface DigestItem {
  fieldId: string;
  fieldName: string;
  status: string;
  ndviValue: number | null;
  message: string;
  result: any;
}
interface DigestBucket {
  chatId: string;
  lang: string;
  items: DigestItem[];
}

function digestItemLine(item: DigestItem): string {
  let text = String(item.message || "");
  if (text.length > DIGEST_ITEM_MAX_CHARS) {
    text = text.slice(0, DIGEST_ITEM_MAX_CHARS - 1).trimEnd() + "\u2026";
  }
  // The tier tag (e.g. "[Check field] ") is authoritative and sits at the
  // front. Detect a leading field name after it so fallback messages (which
  // already start with "Field name:") are not double-prefixed.
  const tagMatch = text.match(/^\[[^\]]+\]\s*/);
  const tag = tagMatch ? tagMatch[0] : "";
  const body = tag ? text.slice(tag.length) : text;
  const hasName =
    body.startsWith(item.fieldName + ":") ||
    body.startsWith(item.fieldName + " \u2014");
  return hasName
    ? `\u2022 ${text}`
    : `\u2022 ${tag}${item.fieldName}: ${body}`;
}

function buildDigestMessage(
  lang: string,
  items: DigestItem[],
): { text: string; included: Set<string> } {
  const header =
    lang === "km"
      ? `ព័ត៌មានវាលថ្ងៃនេះ (${items.length} វាល):`
      : `Today's field update (${items.length} fields):`;
  const out: string[] = [header, ""];
  const includedIds = new Set<string>();
  let used = header.length + 1;
  for (const item of items) {
    const line = digestItemLine(item);
    if (used + line.length + 1 > DIGEST_MAX_CHARS) break;
    out.push(line);
    used += line.length + 1;
    includedIds.add(item.fieldId);
  }
  const remaining = items.length - includedIds.size;
  if (remaining > 0) {
    out.push(
      lang === "km"
        ? `…និងវាលចំនួន ${remaining} ទៀត`
        : `…and ${remaining} more field(s)`,
    );
  }
  return { text: out.join("\n"), included: includedIds };
}

Deno.serve(async (_req) => {
  try {
    await eeInit();

    // Official admin names for the DataEF weather lookup. Loaded once per run;
    // the table is tiny and this avoids a query per field.
    const provinceNames = new Map<string, string>();
    try {
      const { data: provinces } = await supabase
        .from("admin_provinces")
        .select("code, name_en");
      for (const p of provinces || []) {
        if (p?.code && p?.name_en) {
          provinceNames.set(String(p.code), String(p.name_en));
        }
      }
    } catch (e) {
      console.warn(
        `[dataef] province name load failed: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }

    const { data: fields, error } = await supabase
      .from("fields")
      .select(
        "id, name, geojson, planting_date, crop_english, centroid_lat, centroid_lng, province_code, owner_id, profiles!inner(telegram_chat_id, preferred_language)",
      )
      .not("profiles.telegram_chat_id", "is", null);

    if (error) throw error;

    const results = [];
    // Phase 3: optical advisories buffered per chat, flushed as one digest
    // after every field has been processed.
    const pendingByChat = new Map<string, DigestBucket>();

    for (const field of fields || []) {
      try {
        const chatId = (field as any).profiles?.telegram_chat_id;
        const lang = (field as any).profiles?.preferred_language || "en";
        if (!chatId) continue;

        // Phase 2: respect an explicit acknowledgement (Done / Snooze / Dismiss)
        // before spending any Earth Engine compute or sending another message.
        // A missing table (migration 020 not applied yet) is non-fatal.
        let lastAction: any = null;
        {
          const { data, error: faErr } = await supabase
            .from("field_actions")
            .select("status, snooze_until, created_at")
            .eq("field_id", field.id)
            // Only acknowledgements matter; a later usefulness rating must not
            // cancel a snooze/dismiss.
            .in("status", ["done", "snoozed", "dismissed"])
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (!faErr && data) lastAction = data;
        }
        if (shouldSuppressAlert(lastAction)) {
          results.push({
            field: field.name,
            skipped: true,
            reason: "acknowledged",
          });
          continue;
        }

        const reading = await getFieldReading(field.geojson);

        if (reading.source === "none") {
          // No optical scene in 90 days AND no S1 coverage either. Look up
          // the last logged status so we still only send the "can't
          // monitor" notice once on transition into no_data, not every run
          // — this stays deliberately quiet on repeat, unlike the
          // always-send policy below, because a daily "still can't see
          // your field" message adds no information after the first one.
          const { data: lastAlert } = await supabase
            .from("alerts_log")
            .select("status")
            .eq("field_id", field.id)
            .order("sent_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          const lastStatus = lastAlert?.status ?? null;
          const sendNoDataMsg = lastStatus !== "no_data";
          const message = sendNoDataMsg
            ? lang === "km"
              ? `វាល ${field.name}: មិនទាន់មានរូបភាពផ្កាយរណបច្បាស់លាស់នៃវាលរបស់អ្នកលើសពី 3 សប្តាហ៍ ដូច្នេះមិនអាចបញ្ជាក់ស្ថានភាពសុខភាពបច្ចុប្បន្នបានទេ។`
              : `${field.name}: We haven't had a clear satellite view of your field in over 3 weeks, so we can't confirm its current health.`
            : null;

          const telegramSent = sendNoDataMsg
            ? await sendTelegram(chatId, message!)
            : false;

          await supabase.from("alerts_log").insert({
            field_id: field.id,
            status: "no_data",
            ndvi_value: null,
            message,
            chat_id: chatId,
            telegram_sent: telegramSent,
          });
          results.push({
            field: field.name,
            status: "no_data",
            sent: sendNoDataMsg,
            telegramSent,
          });
          continue;
        }

        if (reading.source === "radar") {
          // Radar-only reading: optical had nothing for 90 days. Send the
          // simpler, explicitly-hedged radar message directly — no LLM call,
          // no growth-stage classification, since RVI thresholds aren't
          // calibrated against this app's stage system yet (see the note on
          // getFieldReading). Logged as its own "radar_flag" status so it's
          // easy to filter these out of any accuracy analysis later, and so
          // the no_data dedup check above never confuses a radar_flag with a
          // true no_data.
          const message = buildRadarAlertMessage(field.name, reading.rvi, lang);
          const telegramSent = await sendTelegram(chatId, message);

          await supabase.from("alerts_log").insert({
            field_id: field.id,
            status: "radar_flag",
            ndvi_value: null,
            message,
            chat_id: chatId,
            telegram_sent: telegramSent,
          });
          results.push({
            field: field.name,
            status: "radar_flag",
            rvi: reading.rvi,
            sent: true,
            telegramSent,
          });
          continue;
        }

        // reading.source === "ndvi" — unchanged optical path below.
        const { ndvi, confidence, windowDays } = reading;
        const useGeneric =
          !!(field as any).crop_english &&
          (field as any).crop_english !== "rice";
        const { status, stage } = statusFromNdvi(
          ndvi,
          field.planting_date,
          useGeneric,
        );

        // Send on every run UNLESS the farmer acknowledged the previous alert
        // (handled above via field_actions: done/snoozed/dismissed). This keeps
        // the old "only on worsening" dedup removed while respecting explicit
        // acknowledgements.
        const rainfall = await getRainfallMm(field.geojson);
        // Weather forecast for the field centroid (never blocks the alert — null
        // on failure means the advisory simply runs without a forecast line).
        let weather: WeatherContext | null = null;
        try {
          const lat = (field as any).centroid_lat;
          const lng = (field as any).centroid_lng;
          if (lat != null && lng != null) {
            weather = await getWeatherContext(lat, lng);
          } else {
            console.warn(
              `No centroid for field ${field.name} (${field.id}) — skipping weather forecast`,
            );
          }
        } catch (e) {
          console.warn(
            `Weather fetch failed for field ${field.name}: ${
              e instanceof Error ? e.message : String(e)
            } — continuing with stress data only`,
          );
        }
        // Official current province conditions. Never blocks the alert: no
        // province, missing admin row, or DataEF failure simply means the
        // advisory runs without the official line.
        let officialLine = "";
        const provinceCode = (field as any).province_code;
        const provinceName = provinceCode
          ? provinceNames.get(String(provinceCode))
          : null;
        if (provinceName) {
          try {
            officialLine = provinceWeatherLine(
              await getProvinceWeather(provinceName),
            );
          } catch (e) {
            console.warn(
              `[dataef] weather failed for ${provinceName}: ${
                e instanceof Error ? e.message : String(e)
              }`,
            );
          }
        }

        const { prompt, decision } = await buildAdvisoryPrompt(
          field,
          ndvi,
          status,
          stage,
          rainfall,
          weather,
          lang,
          officialLine,
          confidence,
        );
        const result = await generateExplanation(prompt);

        let modelUsed: string | null = null;
        let message: string;
        let usedFallback = false;
        if (result && !result.truncated) {
          modelUsed = result.model;
          message = safeText(
            result.text,
            buildAlertMessage(
              field.name,
              status,
              stage,
              ndvi,
              rainfall,
              weather,
              lang,
            ),
          );
        } else {
          if (result?.truncated) {
            modelUsed = result.model;
            console.log(
              `Advisory truncated (${modelUsed}) — using flat template`,
            );
          } else {
            console.log(
              "Advisory fell back to flat template (no LLM provider returned text)",
            );
          }
          usedFallback = true;
          message = buildAlertMessage(
            field.name,
            status,
            stage,
            ndvi,
            rainfall,
            weather,
            lang,
          );
        }

        // Flat template has no action — append the deterministic next step so
        // an LLM outage never leaves the farmer with only a status number.
        if (usedFallback) {
          const actionLine = decisionActionLine(decision, lang);
          if (actionLine) message += `\n${actionLine}`;
        }

        // The tier tag is authoritative and comes from buildDecision(), not the
        // LLM, so it can never be talked up into "act now" by the model.
        message = decisionTag(decision, lang) + message;

        // Flag low-confidence (90-day fallback) readings so they're never
        // presented with the same certainty as a fresh 14-day reading.
        if (confidence === "low") {
          message +=
            lang === "km"
              ? " (ការវាយតម្លៃនេះផ្អែកលើទិន្នន័យចាស់ជាង ដោយសារគ្មានរូបភាពថ្មីច្បាស់លាស់)"
              : " (based on older data — no recent clear satellite scene)";
        }

        // Buffer the optical advisory per chat; it is sent (as-is for one
        // field, as a digest for several) after the whole loop completes.
        const resultObj = {
          field: field.name,
          status,
          sent: true,
          model: modelUsed,
          telegramSent: false, // updated after the per-chat flush
          confidence,
          windowDays,
        };
        let bucket = pendingByChat.get(chatId);
        if (!bucket) {
          bucket = { chatId, lang, items: [] };
          pendingByChat.set(chatId, bucket);
        }
        bucket.items.push({
          fieldId: field.id,
          fieldName: field.name,
          status,
          ndviValue: ndvi,
          message,
          result: resultObj,
        });
        results.push(resultObj);

        if (modelUsed)
          console.log(
            `Advisory served by: ${modelUsed} for field ${field.name}`,
          );
      } catch (fieldErr) {
        console.error(
          `Failed processing field ${field.name} (${field.id}):`,
          fieldErr,
        );
        results.push({
          field: field.name,
          status: "error",
          sent: false,
          error: String(fieldErr),
        });
      }
    }

    // Phase 3: send one message, or one digest, per chat. The per-field
    // alerts_log rows are written AFTER the send so telegram_sent reflects the
    // real delivery result. `message` stays the individual field message (for
    // per-field history/audit), not the combined digest text.
    for (const bucket of pendingByChat.values()) {
      if (!bucket.items.length) continue;
      const digested = bucket.items.length > 1;
      let text = bucket.items[0].message;
      let included: Set<string> | null = null;
      if (digested) {
        const built = buildDigestMessage(bucket.lang, bucket.items);
        text = built.text;
        included = built.included;
      }
      const telegramSent = await sendTelegram(bucket.chatId, text);
      for (const item of bucket.items) {
        // A field omitted from an over-long digest was NOT delivered.
        const delivered =
          telegramSent && (!included || included.has(item.fieldId));
        item.result.telegramSent = delivered;
        item.result.digested = digested;
        item.result.digestSize = bucket.items.length;
      }
      const rows = bucket.items.map((item) => ({
        field_id: item.fieldId,
        status: item.status,
        ndvi_value: item.ndviValue,
        message: item.message,
        chat_id: bucket.chatId,
        telegram_sent: item.result.telegramSent,
      }));
      const { error: logErr } = await supabase.from("alerts_log").insert(rows);
      if (logErr) {
        console.error("[digest] alerts_log insert failed", logErr);
      }
    }

    return new Response(
      JSON.stringify({ ok: true, checked: results.length, results }),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
