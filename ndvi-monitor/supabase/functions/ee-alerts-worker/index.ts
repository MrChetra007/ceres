import { createClient } from "npm:@supabase/supabase-js@2";
import ee from "npm:@google/earthengine@0.1.395";
import { generateExplanation, languageLine } from "../_shared/llm.ts";
// Growth-stage thresholds live in _shared/growthStage.ts so this worker and
// the ee-data function stay in sync automatically.
import { statusFromNdvi } from "../_shared/growthStage.ts";
import { getWeatherContext } from "../_shared/weather.ts";
import type { WeatherContext } from "../_shared/weather.ts";

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

function computeNdviOverWindow(
  geom: any,
  days: number,
): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const end = ee.Date(Date.now());
    const start = end.advance(-days, "day");
    const collection = ee
      .ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
      .filterBounds(geom)
      .filterDate(start, end)
      .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 40));
    collection.size().evaluate((count: number, err: string) => {
      if (err) return reject(new Error(err));
      if (!count) return resolve(null);
      const img = collection.median().normalizedDifference(["B8", "B4"]);
      img
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
): Promise<string> {
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

  return `You are writing a short Telegram alert for a rice farmer in Battambang, Cambodia, about their field named "${field.name}".
Satellite data: NDVI ${ndvi.toFixed(2)} (${pctLine}), LSWI (moisture) ${lswi == null ? "n/a" : lswi.toFixed(2)}, rainfall (21 days) ${rainText}, growth stage: ${stageText}, current status: ${statusLabel}.
${forecastContextLine(weather)}

${langLine}
Write 2-3 short sentences. Describe what the numbers suggest about the likely cause of a stress signal (drought vs. flood vs. normal for this growth stage) and give ONE practical, cautious next step. Use the weather forecast to inform this: mention upcoming rain (or its absence) when it is relevant to the field's situation — e.g. warn that rain is expected soon if the field is dry, or note a dry spell ahead if the forecast shows little rain. IMPORTANT: this is guidance to inform the farmer, NOT a diagnosis — never state a cause with certainty. Always hedge with words like "likely" / "could be". Do not repeat the technical index names (NDVI, LSWI) in the reply itself.`;
}

Deno.serve(async (_req) => {
  try {
    await eeInit();

    const { data: fields, error } = await supabase
      .from("fields")
      .select(
        "id, name, geojson, planting_date, crop_english, centroid_lat, centroid_lng, owner_id, profiles!inner(telegram_chat_id, preferred_language)",
      )
      .not("profiles.telegram_chat_id", "is", null);

    if (error) throw error;

    const results = [];

    for (const field of fields || []) {
      try {
        const chatId = (field as any).profiles?.telegram_chat_id;
        const lang = (field as any).profiles?.preferred_language || "en";
        if (!chatId) continue;

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
        const useGeneric = !!(field as any).crop_english && (field as any).crop_english !== "rice";
        const { status, stage } = statusFromNdvi(ndvi, field.planting_date, useGeneric);

        // Always send — every run, regardless of whether status changed or
        // improved. (This intentionally removes the Part 5 dedup/"only on
        // worsening" guard — every field with a linked chat gets a message
        // on every worker run.)
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
        const prompt = await buildAdvisoryPrompt(
          field,
          ndvi,
          status,
          stage,
          rainfall,
          weather,
          lang,
        );
        const result = await generateExplanation(prompt);

        let modelUsed: string | null = null;
        let message: string;
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

        // Flag low-confidence (90-day fallback) readings so they're never
        // presented with the same certainty as a fresh 14-day reading.
        if (confidence === "low") {
          message +=
            lang === "km"
              ? " (ការវាយតម្លៃនេះផ្អែកលើទិន្នន័យចាស់ជាង ដោយសារគ្មានរូបភាពថ្មីច្បាស់លាស់)"
              : " (based on older data — no recent clear satellite scene)";
        }

        const telegramSent = await sendTelegram(chatId, message);

        await supabase.from("alerts_log").insert({
          field_id: field.id,
          status,
          ndvi_value: ndvi,
          message,
          chat_id: chatId,
          telegram_sent: telegramSent,
        });

        if (modelUsed)
          console.log(
            `Advisory served by: ${modelUsed} for field ${field.name}`,
          );
        results.push({
          field: field.name,
          status,
          sent: true,
          model: modelUsed,
          telegramSent,
          confidence,
          windowDays,
        });
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
