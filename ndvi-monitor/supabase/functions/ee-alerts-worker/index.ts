import { createClient } from "npm:@supabase/supabase-js@2";
import ee from "npm:@google/earthengine@0.1.395";

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
  const geometry = geojson && geojson.type === "Feature"
    ? geojson.geometry
    : geojson;
  return ee.Geometry(geometry);
}

function getNdviForGeometry(geojson: any): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const geom = toEeGeometry(geojson);
    const end = ee.Date(Date.now());
    const start = end.advance(-30, "day");
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

async function sendTelegram(chatId: string, text: string) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

const SEVERITY: Record<string, number> = {
  healthy: 0,
  below_expected: 1,
  stressed: 2,
};

Deno.serve(async (_req) => {
  try {
    await eeInit();

    const { data: fields, error } = await supabase
      .from("fields")
      .select(
        "id, name, geojson, planting_date, owner_id, profiles!inner(telegram_chat_id)",
      )
      .not("profiles.telegram_chat_id", "is", null);

    if (error) throw error;

    const results = [];
    for (const field of fields || []) {
      const chatId = (field as any).profiles?.telegram_chat_id;
      if (!chatId) continue;

      const ndvi = await getNdviForGeometry(field.geojson);
      if (ndvi === null) {
        await supabase.from("alerts_log").insert({
          field_id: field.id,
          status: "no_data",
          ndvi_value: null,
          message: null,
          chat_id: chatId,
        });
        results.push({ field: field.name, status: "no_data", sent: false });
        continue;
      }
      const { status, stage } = statusFromNdvi(ndvi, field.planting_date);

      const { data: lastAlert } = await supabase
        .from("alerts_log")
        .select("status")
        .eq("field_id", field.id)
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const lastStatus = lastAlert?.status ?? null;
      const changed = status !== lastStatus;
      const worse =
        lastStatus === null
          ? status !== "healthy"
          : SEVERITY[status] > SEVERITY[lastStatus];

      let message = null;
      if (changed && worse) {
        const rainfall = await getRainfallMm(field.geojson);
        const rainText = rainfall === null ? "n/a" : `${rainfall.toFixed(0)}mm`;
        message = `${field.name}: ${status.replace("_", " ")}${stage ? ` (${stage})` : ""} — NDVI ${ndvi.toFixed(2)}, ${rainText} rain (21d)`;
        await sendTelegram(chatId, message);
      }

      await supabase.from("alerts_log").insert({
        field_id: field.id,
        status,
        ndvi_value: ndvi,
        message,
        chat_id: chatId,
      });

      results.push({ field: field.name, status, sent: !!message });
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
