// ---------------------------------------------------------------------------
// Decision engine (Phase 1 — decision-ready advisories)
// ---------------------------------------------------------------------------
// Turns the satellite/weather signals the app already has into ONE structured,
// deterministic recommendation:
//   tier      - 'monitor' | 'scout' | 'act'
//   severity  - 'none' | 'low' | 'moderate' | 'high' | 'unknown'
//   urgency   - 'low' | 'medium' | 'high'
//   timeWindow- 'none' | 'next_pass' | 'week' | 'days3' | 'now'
//   headline / hypotheses / actions / verify - { key, params } objects the UI
//             resolves through i18n, and the Edge Functions resolve to text.
//
// IMPORTANT CONTRACT: this module is the ONLY place the action tier is decided.
// The LLM (consult-ai, ee-alerts-worker) is only allowed to PHRASE the result —
// it must never upgrade/downgrade the tier. That keeps a confident "act" from
// ever being invented by a language model from a weak signal, and keeps the app
// and Telegram saying the same thing.
//
// The algorithm is pure and dependency-free so it can be duplicated verbatim in
// supabase/functions/_shared/decision.ts (Deno cannot import from src/). When
// changing rules here, change them there too — same pattern as growthStage.ts
// vs src/config.js.
//
// Research basis (see docs/decision-research notes): separate the measurement
// from the action trigger; grade by likelihood x severity x time-sensitivity;
// never turn a low-confidence / radar / no-data reading into an "act"; tie every
// recommendation to the crop's growth stage and the rainfall/forecast context.
// ---------------------------------------------------------------------------

export const DECISION_TIERS = ['monitor', 'scout', 'act']

// Thresholds kept here so both the browser and the worker reason identically.
export const DECISION_THRESHOLDS = {
  rainVeryLowMm21: 5,
  rainLowMm21: 10,
  lswiDry: 0.0,
  lswiWet: 0.3,
  declinePct: 15,
  declineFastPct: 25,
  rainSoonPct: 60,
  rviStress: 0.4,
}

function mk(key, params) {
  return { key, params: params || null }
}

// Both the client stage table (Transplanting, Stem Elongation / Booting, ...)
// and the worker stage table (Germination, Reproductive, Maturation, ...) feed
// this function, so classify by keyword rather than by one exact enum.
function stageFlags(stage) {
  const s = String(stage || '').toLowerCase()
  const harvest = /(^|[^a-z])mature([^a-z]|$)|maturation|senescence|harvest/.test(s)
  const sensitive = /flower|heading|reproductive/.test(s)
  const waterHungry =
    !harvest &&
    /booting|elongation|flower|heading|grain|fill|reproductive|vegetative|tiller|transplant|seedling/.test(s)
  const early = /germinat|seedling|transplant/.test(s)
  return { sensitive, waterHungry, early, harvest }
}

function maxRainSoon(forecastDays, precipProb) {
  if (Array.isArray(forecastDays) && forecastDays.length) {
    let max = null
    for (const d of forecastDays.slice(0, 3)) {
      const v = d && d.rainPct != null ? Number(d.rainPct) : null
      if (v != null && isFinite(v)) max = max == null ? v : Math.max(max, v)
    }
    if (max != null) return max
  }
  if (precipProb != null && isFinite(Number(precipProb))) return Number(precipProb)
  return null
}

function num(v) {
  if (v == null) return null
  const n = Number(v)
  return isFinite(n) ? n : null
}

/**
 * @param {object} input
 * @param {'ndvi'|'ndwi'|'lswi'|'rvi'} [input.index]
 * @param {'healthy'|'below_expected'|'stressed'|'unknown'|'no_data'} [input.status]
 * @param {string|null} [input.stage] canonical growth-stage name (any table)
 * @param {number|null} [input.dayCount]
 * @param {boolean} [input.prePlanting]
 * @param {number|null} [input.ndvi]
 * @param {number|null} [input.rvi] Sentinel-1 RVI when optical is cloud-blocked
 * @param {number|null} [input.lswi]
 * @param {number|null} [input.rainfallMm] 21-day rainfall total
 * @param {Array<{date:string,rainPct:number|null}>|null} [input.forecastDays]
 * @param {number|null} [input.precipProb] aggregate forecast rain probability
 * @param {'high'|'medium'|'low'|null} [input.confidenceTier]
 * @param {number|null} [input.observationAgeDays]
 * @param {'optical'|'radar'|'no_data'} [input.mode]
 * @param {number|null} [input.trendPct] % change recent vs ~14d earlier (negative = decline)
 * @param {string|null} [input.cropEnglish]
 * @returns {object} decision
 */
export function buildDecision(input) {
  input = input || {}
  const T = DECISION_THRESHOLDS
  const stage = stageFlags(input.stage)
  const conf = input.confidenceTier || null
  const confLow = conf === 'low'
  const mode = input.mode || 'optical'
  const status = input.status || 'unknown'
  const ndvi = num(input.ndvi)
  const rvi = num(input.rvi)
  const lswi = num(input.lswi)
  const rain = num(input.rainfallMm)
  const trendPct = num(input.trendPct)
  const rainSoon = maxRainSoon(input.forecastDays, input.precipProb)

  const flags = {
    dry: false,
    wet: false,
    declining: false,
    decliningFast: false,
    stageSensitive: stage.sensitive,
    waterHungry: stage.waterHungry,
    earlyStage: stage.early,
    lowConfidence: confLow,
    noData: false,
    radar: mode === 'radar' || rvi != null,
    prePlanting: !!input.prePlanting,
    rainSoon: rainSoon != null && rainSoon >= T.rainSoonPct,
  }

  const base = {
    tier: 'monitor',
    severity: 'none',
    urgency: 'low',
    timeWindow: 'next_pass',
    headline: mk('decision.h_healthy'),
    hypotheses: [],
    actions: [],
    verify: [],
    reason: mk('decision.reason_healthy'),
    dataAgeDays: input.observationAgeDays != null ? num(input.observationAgeDays) : null,
    confidenceTier: conf,
    flags,
    score: 0,
  }

  // 0. Pre-planting — there is no crop to judge yet.
  if (flags.prePlanting) {
    return {
      ...base,
      tier: 'monitor',
      severity: 'none',
      urgency: 'low',
      timeWindow: 'none',
      headline: mk('decision.h_pre_planting'),
      hypotheses: [],
      actions: [mk('decision.act_pre_planting')],
      verify: [mk('decision.verify_none')],
      reason: mk('decision.reason_pre_planting'),
      score: 0,
    }
  }

  // 1. No reliable reading at all. Never guess a diagnosis — ask for a field
  // check or a clearer pass.
  const hasReading = ndvi != null || rvi != null
  if (mode === 'no_data' || status === 'no_data' || !hasReading) {
    flags.noData = true
    return {
      ...base,
      tier: 'scout',
      severity: 'unknown',
      urgency: 'low',
      timeWindow: 'next_pass',
      headline: mk('decision.h_no_data'),
      hypotheses: [mk('decision.hyp_cloud')],
      actions: [mk('decision.act_no_data'), mk('decision.act_retry')],
      verify: [mk('decision.verify_none')],
      reason: mk('decision.reason_no_data'),
      score: 1,
    }
  }

  // 2. Radar-only reading. RVI is a rough proxy through cloud, so it can raise
  // a "check the field" flag but must never become an "act now".
  if (flags.radar) {
    const possible = rvi != null && rvi < T.rviStress
    return {
      ...base,
      tier: possible ? 'scout' : 'monitor',
      severity: 'unknown',
      urgency: 'low',
      timeWindow: 'next_pass',
      headline: mk('decision.h_radar'),
      hypotheses: [mk('decision.hyp_cloud'), mk('decision.hyp_natural')],
      actions: [mk('decision.act_no_data'), mk('decision.act_photo')],
      verify: [mk('decision.verify_none')],
      reason: mk('decision.reason_radar'),
      score: possible ? 1 : 0,
    }
  }

  // 3. Context: is this likely a water problem?
  const rainVeryLow = rain != null && rain < T.rainVeryLowMm21
  const rainLow = rain != null && rain < T.rainLowMm21
  const lswiDry = lswi != null && lswi < T.lswiDry
  const lswiWet = lswi != null && lswi > T.lswiWet
  flags.wet = lswiWet
  // A <10 mm/21-day total with no moisture reading still counts as dry; a low
  // LSWI alone (no rain data) does too. High LSWI always vetoes "dry".
  flags.dry =
    !flags.wet &&
    (rainVeryLow ||
      (rainLow && (lswi == null || lswiDry)) ||
      (lswiDry && rain == null))
  flags.declining = trendPct != null && trendPct <= -T.declinePct
  flags.decliningFast = trendPct != null && trendPct <= -T.declineFastPct

  // 4. Deterministic severity score (0..3) from status + trend + context + stage.
  // Context/stage only raise a field that is ALREADY below expected — a
  // healthy crop in a dry spell is not a problem by itself.
  let score = status === 'stressed' ? 2 : status === 'below_expected' ? 1 : 0
  if (flags.declining) score += 1
  if (flags.decliningFast) score = Math.max(score, 2)
  const contextIssue = flags.dry || flags.wet
  if (contextIssue && status !== 'healthy') score += 1
  if (stage.sensitive && status !== 'healthy') score += 1
  // Rain within ~3 days relieves a dry field that is not already stressed:
  // waiting and re-checking is the proportionate response, not spending money.
  if (flags.dry && flags.rainSoon && status !== 'stressed') score = Math.max(0, score - 1)
  if (score === 0 && flags.decliningFast) score = 1
  if (score > 3) score = 3

  // 5. Tier gate. "act" is deliberately narrow: only a STRESSED field with a
  // clear, time-sensitive reason (high severity, a sensitive stage, or a water
  // problem at a water-hungry stage). Low confidence can never exceed "scout";
  // below-expected never reaches "act" — it is a "check the field" signal.
  let tier
  if (score === 0) {
    tier = 'monitor'
  } else if (confLow) {
    tier = score >= 2 ? 'scout' : 'monitor'
  } else if (
    status === 'stressed' &&
    (score >= 3 || stage.sensitive || (contextIssue && stage.waterHungry))
  ) {
    tier = 'act'
  } else if (score >= 2) {
    tier = 'scout'
  } else {
    tier = 'monitor'
  }

  // Severity describes the strength of the signal AT this action level, so the
  // UI/LLM never call a "check the field" case "high severity".
  const severity =
    tier === 'act' ? 'high' : tier === 'scout' ? (score >= 2 ? 'moderate' : 'low') : 'none'

  // 6. Urgency + action window.
  const urgency =
    tier === 'act'
      ? stage.sensitive || flags.decliningFast
        ? 'high'
        : 'medium'
      : tier === 'scout'
        ? score >= 2
          ? 'medium'
          : 'low'
        : 'low'
  const timeWindow =
    tier === 'act' ? (urgency === 'high' ? 'now' : 'days3') : tier === 'scout' ? 'week' : 'next_pass'

  // 7. Headline: a water problem outranks the generic status wording.
  let headlineKey
  if (flags.dry && tier !== 'monitor') headlineKey = 'decision.h_dry'
  else if (flags.wet && tier !== 'monitor') headlineKey = 'decision.h_wet'
  else if (status === 'stressed')
    headlineKey = stage.sensitive ? 'decision.h_stressed_sensitive' : 'decision.h_stressed'
  else if (status === 'below_expected') headlineKey = 'decision.h_below_expected'
  else if (flags.declining) headlineKey = 'decision.h_healthy_declining'
  else headlineKey = 'decision.h_healthy'

  // 8. Likely causes — always hypotheses, never a diagnosis.
  const hyps = []
  if (flags.dry) hyps.push(mk('decision.hyp_dry'))
  if (flags.wet) hyps.push(mk('decision.hyp_wet'))
  if (!flags.dry && !flags.wet && (flags.declining || status !== 'healthy')) {
    hyps.push(mk('decision.hyp_nutrient'))
    if (flags.declining) hyps.push(mk('decision.hyp_pest'))
  }
  if (stage.early) hyps.push(mk('decision.hyp_early_stage'))
  if (confLow) hyps.push(mk('decision.hyp_cloud'))
  if (!hyps.length) hyps.push(mk('decision.hyp_natural'))

  // 9. Practical next steps (max 2).
  const actions = []
  if (flags.dry) {
    actions.push(mk('decision.act_check_soil'))
    actions.push(mk(flags.rainSoon ? 'decision.act_wait_rain' : 'decision.act_irrigate'))
  } else if (flags.wet) {
    actions.push(mk('decision.act_drain'))
    actions.push(mk('decision.act_no_fertilizer'))
  } else if (tier === 'monitor') {
    actions.push(mk('decision.act_monitor'))
  } else if (flags.declining || status !== 'healthy') {
    actions.push(mk('decision.act_scout_pest'))
    if (!stage.early) actions.push(mk('decision.act_check_nutrients'))
  } else {
    actions.push(mk('decision.act_monitor'))
  }
  if (actions.length > 2) actions.length = 2

  // 10. What to verify in the field (max 2) — the trust-building step.
  const verify = []
  if (flags.dry) verify.push(mk('decision.verify_soil'))
  else if (flags.wet) verify.push(mk('decision.verify_water'))
  else if (flags.declining || status !== 'healthy') {
    verify.push(mk('decision.verify_pests'))
    verify.push(mk('decision.verify_yellow'))
  } else verify.push(mk('decision.verify_none'))
  if (verify.length > 2) verify.length = 2

  // 11. One-line "why this tier".
  let reasonKey
  if (confLow) reasonKey = 'decision.reason_low_conf'
  else if (flags.dry) reasonKey = 'decision.reason_dry'
  else if (flags.wet) reasonKey = 'decision.reason_wet'
  else if (flags.declining) reasonKey = 'decision.reason_decline'
  else if (status !== 'healthy') reasonKey = 'decision.reason_stage'
  else reasonKey = 'decision.reason_healthy'

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
  }
}

// Flatten the { key, params } items to localized strings with a `t` function.
export function localizeDecision(decision, t) {
  if (!decision) return null
  const one = (item) => (item ? t(item.key, item.params) : '')
  return {
    ...decision,
    headlineText: one(decision.headline),
    reasonText: one(decision.reason),
    hypothesisTexts: (decision.hypotheses || []).map(one),
    actionTexts: (decision.actions || []).map(one),
    verifyTexts: (decision.verify || []).map(one),
  }
}
