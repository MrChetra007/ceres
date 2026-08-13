import { createClient } from "npm:@supabase/supabase-js@2";
import ee from "npm:@google/earthengine@0.1.395";
import { generateExplanation, languageLine } from "../_shared/llm.ts";

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

// Port of your existing growth-stage thresholds from app.js — same 6 stages.
const RICE_GROWTH_STAGES = [
  { name: "Germination", maxDay: 10, min: 0.05, max: 0.15 },
  { name: "Seedling", maxDay: 25, min: 0.15, max: 0.3 },
  { name: "Vegetative", maxDay: 55, min: 0.3, max: 0.55 },
  { name: "Reproductive", maxDay: 90, min: 0.55, max: 0.75 },
  { name: "Maturation", maxDay: 110, min: 0.35, max: 0.55 },
  { name: "Harvest", maxDay: Infinity, min: 0.1, max: 0.3 },
];

function stageForDay(day: number) {
  return (
    RICE_GROWTH_STAGES.find((s) => day <= s.maxDay) ||
    RICE_GROWTH_STAGES[RICE_GROWTH_STAGES.length - 1]
  );
}

function statusFromNdvi(
  ndvi: number,
  plantingDate: string | null,
): { status: string; stage: string | null } {
  if (!plantingDate) {
    // flat fallback, same as app.js
    if (ndvi >= 0.6) return { status: "healthy", stage: null };
    if (ndvi >= 0.3) return { status: "below_expected", stage: null };
    return { status: "stressed", stage: null };
  }
  const day = Math.floor(
    (Date.now() - new Date(plantingDate).getTime()) / 86400000,
  );
  const stage = stageForDay(day);
  const deficit = stage.min - ndvi;
  if (deficit > 0.15) return { status: "stressed", stage: stage.name };
  if (ndvi < stage.min) return { status: "below_expected", stage: stage.name };
  return { status: "healthy", stage: stage.name };
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

function getNdviForGeometry(
  geojson: any,
): Promise<{
  ndvi: number | null;
  confidence: "high" | "low";
  windowDays: number;
}> {
  const geom = toEeGeometry(geojson);
  return computeNdviOverWindow(geom, 14).then((ndvi) => {
    if (ndvi !== null) {
      return { ndvi, confidence: "high" as const, windowDays: 14 };
    }
    return computeNdviOverWindow(geom, 90).then((wideNdvi) => ({
      ndvi: wideNdvi,
      confidence: "low" as const,
      windowDays: 90,
    }));
  });
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
  if (lang === "km") {
    return `វាល ${fieldName}: ${statusLabel}${stageText} — NDVI ${ndvi.toFixed(2)}, ទឹកភ្លៀង ${rainText} (21 ថ្ងៃ)`;
  }
  return `${fieldName}: ${statusLabel}${stageText} — NDVI ${ndvi.toFixed(2)}, ${rainText} rain (21d)`;
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
async function buildAdvisoryPrompt(
  field: any,
  ndvi: number,
  status: string,
  stage: string | null,
  rainfall: number | null,
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

${langLine}
Write 2-3 short sentences. Describe what the numbers suggest about the likely cause of a stress signal (drought vs. flood vs. normal for this growth stage) and give ONE practical, cautious next step. IMPORTANT: this is guidance to inform the farmer, NOT a diagnosis — never state a cause with certainty. Always hedge with words like "likely" / "could be". Do not repeat the technical index names (NDVI, LSWI) in the reply itself.`;
}

Deno.serve(async (_req) => {
  try {
    await eeInit();

    const { data: fields, error } = await supabase
      .from("fields")
      .select(
        "id, name, geojson, planting_date, owner_id, profiles!inner(telegram_chat_id, preferred_language)",
      )
      .not("profiles.telegram_chat_id", "is", null);

    if (error) throw error;

    const results = [];

    for (const field of fields || []) {
      try {
        const chatId = (field as any).profiles?.telegram_chat_id;
        const lang = (field as any).profiles?.preferred_language || "en";
        if (!chatId) continue;

        const { ndvi, confidence, windowDays } = await getNdviForGeometry(
          field.geojson,
        );

        if (ndvi === null) {
          // No clean scene even in the widened 90-day window. Look up the
          // last logged status so we still only send the "can't monitor"
          // notice once on transition into no_data, not every run — this
          // one stays deliberately quiet on repeat, unlike the always-send
          // policy below, because a daily "still can't see your field"
          // message adds no information after the first one.
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

        const { status, stage } = statusFromNdvi(ndvi, field.planting_date);

        // Always send — every run, regardless of whether status changed or
        // improved. (This intentionally removes the Part 5 dedup/"only on
        // worsening" guard — every field with a linked chat gets a message
        // on every worker run.)
        const rainfall = await getRainfallMm(field.geojson);
        const prompt = await buildAdvisoryPrompt(
          field,
          ndvi,
          status,
          stage,
          rainfall,
          lang,
        );
        const result = await generateExplanation(prompt);

        let modelUsed: string | null = null;
        let message: string;
        if (result && !result.truncated) {
          modelUsed = result.model;
          message = safeText(
            result.text,
            buildAlertMessage(field.name, status, stage, ndvi, rainfall, lang),
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
