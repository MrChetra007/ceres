// ---------------------------------------------------------------------------
// Decision engine (Phase 1 — decision-ready advisories) — Deno port
// ---------------------------------------------------------------------------
// VERBATIM port of src/services/decision.js. The browser and the Edge Functions
// must reach the SAME tier/score from the same signals, so the two files are
// kept identical in logic (same pattern as _shared/growthStage.ts vs
// src/config.js). If you change a rule, change it in both files.
//
// The LLM may only PHRASE this result — never change the tier.
// ---------------------------------------------------------------------------

export const DECISION_TIERS = ["monitor", "scout", "act"] as const;
export type DecisionTier = (typeof DECISION_TIERS)[number];

export const DECISION_THRESHOLDS = {
  rainVeryLowMm21: 5,
  rainLowMm21: 10,
  lswiDry: 0.0,
  lswiWet: 0.3,
  declinePct: 15,
  declineFastPct: 25,
  rainSoonPct: 60,
  rviStress: 0.4,
};

export interface DecisionInput {
  index?: string;
  status?: string | null;
  stage?: string | null;
  dayCount?: number | null;
  prePlanting?: boolean;
  ndvi?: number | null;
  rvi?: number | null;
  lswi?: number | null;
  rainfallMm?: number | null;
  forecastDays?: Array<{ date?: string; rainPct?: number | null }> | null;
  precipProb?: number | null;
  confidenceTier?: string | null;
  observationAgeDays?: number | null;
  mode?: string | null;
  trendPct?: number | null;
  cropEnglish?: string | null;
}

export interface DecisionItem {
  key: string;
  params: Record<string, unknown> | null;
}

export interface Decision {
  tier: DecisionTier;
  severity: string;
  urgency: string;
  timeWindow: string;
  headline: DecisionItem;
  hypotheses: DecisionItem[];
  actions: DecisionItem[];
  verify: DecisionItem[];
  reason: DecisionItem;
  dataAgeDays: number | null;
  confidenceTier: string | null;
  flags: Record<string, boolean>;
  score: number;
}

function mk(key: string, params?: Record<string, unknown>): DecisionItem {
  return { key, params: params || null };
}

function stageFlags(stage: string | null | undefined) {
  const s = String(stage || "").toLowerCase();
  const harvest =
    /(^|[^a-z])mature([^a-z]|$)|maturation|senescence|harvest/.test(s);
  const sensitive = /flower|heading|reproductive/.test(s);
  const waterHungry =
    !harvest &&
    /booting|elongation|flower|heading|grain|fill|reproductive|vegetative|tiller|transplant|seedling/.test(
      s,
    );
  const early = /germinat|seedling|transplant/.test(s);
  return { sensitive, waterHungry, early, harvest };
}

function maxRainSoon(
  forecastDays: Array<{ rainPct?: number | null }> | null | undefined,
  precipProb: number | null | undefined,
): number | null {
  if (Array.isArray(forecastDays) && forecastDays.length) {
    let max: number | null = null;
    for (const d of forecastDays.slice(0, 3)) {
      const v = d && d.rainPct != null ? Number(d.rainPct) : null;
      if (v != null && isFinite(v)) max = max == null ? v : Math.max(max, v);
    }
    if (max != null) return max;
  }
  if (precipProb != null && isFinite(Number(precipProb))) return Number(precipProb);
  return null;
}

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}

export function buildDecision(inputIn: DecisionInput): Decision {
  const input = inputIn || {};
  const T = DECISION_THRESHOLDS;
  const stage = stageFlags(input.stage);
  const conf = input.confidenceTier || null;
  const confLow = conf === "low";
  const mode = input.mode || "optical";
  const status = input.status || "unknown";
  const ndvi = num(input.ndvi);
  const rvi = num(input.rvi);
  const lswi = num(input.lswi);
  const rain = num(input.rainfallMm);
  const trendPct = num(input.trendPct);
  const rainSoon = maxRainSoon(input.forecastDays, input.precipProb);

  const flags: Record<string, boolean> = {
    dry: false,
    wet: false,
    declining: false,
    decliningFast: false,
    stageSensitive: stage.sensitive,
    waterHungry: stage.waterHungry,
    earlyStage: stage.early,
    lowConfidence: confLow,
    noData: false,
    radar: mode === "radar" || rvi != null,
    prePlanting: !!input.prePlanting,
    rainSoon: rainSoon != null && rainSoon >= T.rainSoonPct,
  };

  const base: Decision = {
    tier: "monitor",
    severity: "none",
    urgency: "low",
    timeWindow: "next_pass",
    headline: mk("decision.h_healthy"),
    hypotheses: [],
    actions: [],
    verify: [],
    reason: mk("decision.reason_healthy"),
    dataAgeDays: input.observationAgeDays != null ? num(input.observationAgeDays) : null,
    confidenceTier: conf,
    flags,
    score: 0,
  };

  // 0. Pre-planting.
  if (flags.prePlanting) {
    return {
      ...base,
      tier: "monitor",
      severity: "none",
      urgency: "low",
      timeWindow: "none",
      headline: mk("decision.h_pre_planting"),
      hypotheses: [],
      actions: [mk("decision.act_pre_planting")],
      verify: [mk("decision.verify_none")],
      reason: mk("decision.reason_pre_planting"),
      score: 0,
    };
  }

  // 1. No reliable reading.
  const hasReading = ndvi != null || rvi != null;
  if (mode === "no_data" || status === "no_data" || !hasReading) {
    flags.noData = true;
    return {
      ...base,
      tier: "scout",
      severity: "unknown",
      urgency: "low",
      timeWindow: "next_pass",
      headline: mk("decision.h_no_data"),
      hypotheses: [mk("decision.hyp_cloud")],
      actions: [mk("decision.act_no_data"), mk("decision.act_retry")],
      verify: [mk("decision.verify_none")],
      reason: mk("decision.reason_no_data"),
      score: 1,
    };
  }

  // 2. Radar-only reading — never "act".
  if (flags.radar) {
    const possible = rvi != null && rvi < T.rviStress;
    return {
      ...base,
      tier: possible ? "scout" : "monitor",
      severity: "unknown",
      urgency: "low",
      timeWindow: "next_pass",
      headline: mk("decision.h_radar"),
      hypotheses: [mk("decision.hyp_cloud"), mk("decision.hyp_natural")],
      actions: [mk("decision.act_no_data"), mk("decision.act_photo")],
      verify: [mk("decision.verify_none")],
      reason: mk("decision.reason_radar"),
      score: possible ? 1 : 0,
    };
  }

  // 3. Context.
  const rainVeryLow = rain != null && rain < T.rainVeryLowMm21;
  const rainLow = rain != null && rain < T.rainLowMm21;
  const lswiDry = lswi != null && lswi < T.lswiDry;
  const lswiWet = lswi != null && lswi > T.lswiWet;
  flags.wet = lswiWet;
  // A <10 mm/21-day total with no moisture reading still counts as dry; a low
  // LSWI alone (no rain data) does too. High LSWI always vetoes "dry".
  flags.dry =
    !flags.wet &&
    (rainVeryLow ||
      (rainLow && (lswi == null || lswiDry)) ||
      (lswiDry && rain == null));
  flags.declining = trendPct != null && trendPct <= -T.declinePct;
  flags.decliningFast = trendPct != null && trendPct <= -T.declineFastPct;

  // 4. Severity score. Context/stage only raise a field that is ALREADY below
  // expected — a healthy crop in a dry spell is not a problem by itself.
  let score = status === "stressed" ? 2 : status === "below_expected" ? 1 : 0;
  if (flags.declining) score += 1;
  if (flags.decliningFast) score = Math.max(score, 2);
  const contextIssue = flags.dry || flags.wet;
  if (contextIssue && status !== "healthy") score += 1;
  if (stage.sensitive && status !== "healthy") score += 1;
  // Rain within ~3 days relieves a dry field that is not already stressed.
  if (flags.dry && flags.rainSoon && status !== "stressed") score = Math.max(0, score - 1);
  if (score === 0 && flags.decliningFast) score = 1;
  if (score > 3) score = 3;

  // 5. Tier gate — "act" only for a STRESSED field with a clear, time-sensitive
  // reason. Low confidence can never exceed "scout"; below-expected is a
  // "check the field" signal, never "act".
  let tier: DecisionTier;
  if (score === 0) {
    tier = "monitor";
  } else if (confLow) {
    tier = score >= 2 ? "scout" : "monitor";
  } else if (
    status === "stressed" &&
    (score >= 3 || stage.sensitive || (contextIssue && stage.waterHungry))
  ) {
    tier = "act";
  } else if (score >= 2) {
    tier = "scout";
  } else {
    tier = "monitor";
  }

  // Severity describes the strength of the signal AT this action level, so the
  // UI/LLM never call a "check the field" case "high severity".
  const severity =
    tier === "act" ? "high" : tier === "scout" ? (score >= 2 ? "moderate" : "low") : "none";

  // 6. Urgency + window.
  const urgency =
    tier === "act"
      ? stage.sensitive || flags.decliningFast
        ? "high"
        : "medium"
      : tier === "scout"
        ? score >= 2
          ? "medium"
          : "low"
        : "low";
  const timeWindow =
    tier === "act" ? (urgency === "high" ? "now" : "days3") : tier === "scout" ? "week" : "next_pass";

  // 7. Headline.
  let headlineKey: string;
  if (flags.dry && tier !== "monitor") headlineKey = "decision.h_dry";
  else if (flags.wet && tier !== "monitor") headlineKey = "decision.h_wet";
  else if (status === "stressed")
    headlineKey = stage.sensitive ? "decision.h_stressed_sensitive" : "decision.h_stressed";
  else if (status === "below_expected") headlineKey = "decision.h_below_expected";
  else if (flags.declining) headlineKey = "decision.h_healthy_declining";
  else headlineKey = "decision.h_healthy";

  // 8. Hypotheses.
  const hyps: DecisionItem[] = [];
  if (flags.dry) hyps.push(mk("decision.hyp_dry"));
  if (flags.wet) hyps.push(mk("decision.hyp_wet"));
  if (!flags.dry && !flags.wet && (flags.declining || status !== "healthy")) {
    hyps.push(mk("decision.hyp_nutrient"));
    if (flags.declining) hyps.push(mk("decision.hyp_pest"));
  }
  if (stage.early) hyps.push(mk("decision.hyp_early_stage"));
  if (confLow) hyps.push(mk("decision.hyp_cloud"));
  if (!hyps.length) hyps.push(mk("decision.hyp_natural"));

  // 9. Actions.
  const actions: DecisionItem[] = [];
  if (flags.dry) {
    actions.push(mk("decision.act_check_soil"));
    actions.push(mk(flags.rainSoon ? "decision.act_wait_rain" : "decision.act_irrigate"));
  } else if (flags.wet) {
    actions.push(mk("decision.act_drain"));
    actions.push(mk("decision.act_no_fertilizer"));
  } else if (tier === "monitor") {
    actions.push(mk("decision.act_monitor"));
  } else if (flags.declining || status !== "healthy") {
    actions.push(mk("decision.act_scout_pest"));
    if (!stage.early) actions.push(mk("decision.act_check_nutrients"));
  } else {
    actions.push(mk("decision.act_monitor"));
  }
  if (actions.length > 2) actions.length = 2;

  // 10. Verify.
  const verify: DecisionItem[] = [];
  if (flags.dry) verify.push(mk("decision.verify_soil"));
  else if (flags.wet) verify.push(mk("decision.verify_water"));
  else if (flags.declining || status !== "healthy") {
    verify.push(mk("decision.verify_pests"));
    verify.push(mk("decision.verify_yellow"));
  } else verify.push(mk("decision.verify_none"));
  if (verify.length > 2) verify.length = 2;

  // 11. Reason.
  let reasonKey: string;
  if (confLow) reasonKey = "decision.reason_low_conf";
  else if (flags.dry) reasonKey = "decision.reason_dry";
  else if (flags.wet) reasonKey = "decision.reason_wet";
  else if (flags.declining) reasonKey = "decision.reason_decline";
  else if (status !== "healthy") reasonKey = "decision.reason_stage";
  else reasonKey = "decision.reason_healthy";

  return {
    ...base,
    tier,
    severity,
    urgency,
    timeWindow,
    headline: mk(headlineKey),
    hypotheses: hyps,
    actions,
    verify,
    reason: mk(reasonKey),
    score,
  };
}

// ---------------------------------------------------------------------------
// Deterministic English rendering for LLM prompts / Telegram fallbacks.
// The Edge Functions have no i18n dictionary, so the handful of decision
// strings the worker needs are mapped here. Keep in sync with en.js `decision.*`.
// ---------------------------------------------------------------------------
const EN: Record<string, string> = {
  "decision.h_pre_planting": "No active crop yet — the planting date is in the future.",
  "decision.h_no_data": "No reliable satellite reading right now.",
  "decision.h_radar": "Clouds are blocking the optical view — using radar as a rough proxy.",
  "decision.h_dry": "Signals point to dryness or a water shortage.",
  "decision.h_wet": "Signals point to too much water.",
  "decision.h_stressed": "Greenness is well below expected for this growth stage.",
  "decision.h_stressed_sensitive": "Stress at a sensitive growth stage — act soon.",
  "decision.h_below_expected": "Greenness is a little below expected for this growth stage.",
  "decision.h_healthy_declining": "The field looks healthy, but greenness is falling.",
  "decision.h_healthy": "The field looks healthy for this growth stage.",
  "decision.act_pre_planting": "Check again after planting.",
  "decision.act_no_data": "Inspect the field directly if you can, or wait for a clearer satellite pass.",
  "decision.act_retry": "Try a recent month with a clearer satellite view.",
  "decision.act_photo": "Take a photo and send it to the Telegram bot for a field record.",
  "decision.act_check_soil": "Check soil moisture 5–10 cm below the surface.",
  "decision.act_wait_rain": "Rain is likely within 3 days — you may wait and re-check after it.",
  "decision.act_irrigate": "If the soil is dry and water is available, irrigate lightly.",
  "decision.act_drain": "Check and clear drains, and avoid adding fertilizer until the water drops.",
  "decision.act_no_fertilizer": "Avoid adding fertilizer while water is standing.",
  "decision.act_monitor": "Keep normal practices and check again after the next satellite pass.",
  "decision.act_scout_pest": "Walk the field and look for pests, disease or weeds.",
  "decision.act_check_nutrients": "Look for yellowing patterns; consider a light nutrient top-up if confirmed.",
  "decision.hyp_dry": "not enough water",
  "decision.hyp_wet": "too much water or poor drainage",
  "decision.hyp_nutrient": "possible nutrient deficiency",
  "decision.hyp_pest": "possible pest or disease",
  "decision.hyp_early_stage": "low greenness can be normal early in the season",
  "decision.hyp_cloud": "the recent view is cloud-blocked or old",
  "decision.hyp_natural": "natural change for this growth stage",
  "decision.verify_soil": "cracked or dry soil; leaves rolling or wilting in the afternoon",
  "decision.verify_water": "standing water, blocked drains or waterlogging",
  "decision.verify_pests": "chewed leaves, spots, insects or spreading patches",
  "decision.verify_yellow": "yellowing between veins or uneven yellow patches",
  "decision.verify_none": "nothing specific — a quick visual check is enough",
  "decision.window_none": "no action window",
  "decision.window_next_pass": "next satellite pass (2–5 days)",
  "decision.window_week": "this week",
  "decision.window_days3": "within 3–5 days",
  "decision.window_now": "within 1–2 days",
  "decision.tier_monitor": "Monitor",
  "decision.tier_scout": "Check field",
  "decision.tier_act": "Act now",
};

export function decisionText(item: DecisionItem | null | undefined): string {
  if (!item) return "";
  const base = EN[item.key] || item.key;
  if (!item.params) return base;
  return base.replace(/\{(\w+)\}/g, (m, k) =>
    item.params && item.params[k] != null ? String(item.params[k]) : m,
  );
}

// A compact, deterministic guidance block for an LLM prompt. Returns plain
// English so the model can phrase it in the farmer's language without having to
// interpret our i18n keys.
export function decisionPromptBlock(decision: Decision): string {
  const actions = decision.actions.map(decisionText).filter(Boolean);
  const verify = decision.verify.map(decisionText).filter(Boolean);
  const hyps = decision.hypotheses.map(decisionText).filter(Boolean);
  return [
    `DECISION (already computed — do not change the tier, severity or urgency):`,
    `- Tier: ${decision.tier} (${decisionText(
      { key: `decision.tier_${decision.tier}`, params: null },
    )})`,
    `- Severity: ${decision.severity}; urgency: ${decision.urgency}`,
    `- Action window: ${decisionText({
      key: `decision.window_${decision.timeWindow}`,
      params: null,
    })}`,
    `- Headline: ${decisionText(decision.headline)}`,
    `- Likely causes (hypotheses, not a diagnosis): ${hyps.join("; ") || "n/a"}`,
    `- Recommended next step(s): ${actions.join("; ") || "n/a"}`,
    `- Ask the farmer to verify: ${verify.join("; ") || "n/a"}`,
    `Follow this decision exactly. Phrase it naturally for the farmer; never upgrade or downgrade the action tier and never present a hypothesis as certain.`,
  ].join("\n");
}
