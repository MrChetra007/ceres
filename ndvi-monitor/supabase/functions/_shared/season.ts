// ---------------------------------------------------------------------------
// Seasonal timing nudges — Deno port
// ---------------------------------------------------------------------------
// VERBATIM port of src/services/season.js (same phase rules and English copy).
// Keep both files in sync — same pattern as decision.js / decision.ts.
// ---------------------------------------------------------------------------

export const SEASON_PHASES = [
  "establishment",
  "vegetative",
  "reproductive",
  "grainfill",
  "maturity",
] as const;
export type SeasonPhase = (typeof SEASON_PHASES)[number];

export interface SeasonNudge {
  phase: SeasonPhase;
  isRice: boolean;
  tipKey: string;
  windowKey: string;
}

export function seasonPhase(stage: string | null | undefined): SeasonPhase | null {
  const s = String(stage || "").toLowerCase();
  if (/germinat|seedling|transplant/.test(s)) return "establishment";
  // Check grain/fill before "matur" so "Grain Filling / Maturity" lands here.
  if (/grain|fill/.test(s)) return "grainfill";
  if (/tiller|vegetative/.test(s)) return "vegetative";
  if (/booting|elongation|flower|heading|reproductive|fruiting/.test(s)) return "reproductive";
  if (/harvest|senescence|(^|[^a-z])mature([^a-z]|$)|maturation/.test(s)) return "maturity";
  return null;
}

function isRiceCrop(cropEnglish: string | null | undefined): boolean {
  const c = String(cropEnglish || "").trim().toLowerCase();
  return !c || c === "rice" || c === "paddy";
}

export function seasonNudge(input: {
  stage?: string | null;
  cropEnglish?: string | null;
}): SeasonNudge | null {
  const phase = seasonPhase(input.stage);
  if (!phase) return null;
  const rice = isRiceCrop(input.cropEnglish);
  return {
    phase,
    isRice: rice,
    tipKey: `season.tip_${phase}_${rice ? "rice" : "generic"}`,
    windowKey: `season.window_${phase}`,
  };
}

// English copy for LLM prompts (the app resolves the i18n keys instead).
export const SEASON_EN: Record<string, string> = {
  "season.tip_establishment_rice":
    "Seedlings are establishing — keep the soil moist but avoid deep water over young plants.",
  "season.tip_establishment_generic":
    "Young plants are establishing — keep the soil consistently moist and check for missing plants.",
  "season.tip_vegetative_rice":
    "This is the usual window for a first top-dressing and weeding; keep shallow water in the paddy.",
  "season.tip_vegetative_generic":
    "This is the usual window to weed and check for pests; keep the soil consistently moist.",
  "season.tip_reproductive_rice":
    "The most water-sensitive weeks — keep shallow water and avoid disturbing the crop; scout for pests.",
  "season.tip_reproductive_generic":
    "The most water-sensitive weeks — keep moisture steady and avoid spraying during flowering.",
  "season.tip_grainfill_rice":
    "Grains are filling — maintain moisture until about two weeks before harvest.",
  "season.tip_grainfill_generic":
    "Fruit and grain are filling — keep moisture steady until close to harvest.",
  "season.tip_maturity_rice":
    "Drain the field about 1–2 weeks before harvest and plan harvest timing.",
  "season.tip_maturity_generic": "Ease off watering and prepare for harvest.",
};

export function seasonText(nudge: SeasonNudge | null | undefined): string {
  if (!nudge) return "";
  return SEASON_EN[nudge.tipKey] || "";
}

// A prompt line that explicitly subordinates the timing note to the decision.
export function seasonPromptBlock(nudge: SeasonNudge | null | undefined): string {
  const text = seasonText(nudge);
  if (!text) return "";
  return `SEASON NOTE (timing guidance only — never override the DECISION block): ${text}`;
}
