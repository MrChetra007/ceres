// Rice + generic growth-stage tables.
//
// Kept in a pure module (no import.meta.env / store imports) so the Node parity
// test can import it directly. src/config.js re-exports these, and the Deno
// copy lives in supabase/functions/_shared/growthStage.ts — keep all three
// names/ranges identical (tests/stages.test.js asserts client/server parity).

export const RICE_GROWTH_STAGES = [
  { maxDay: 10, stage: 'Transplanting', min: -0.1, max: 0.3 },
  { maxDay: 30, stage: 'Tillering', min: 0.3, max: 0.55 },
  { maxDay: 55, stage: 'Stem Elongation / Booting', min: 0.5, max: 0.75 },
  { maxDay: 75, stage: 'Flowering / Heading', min: 0.6, max: 0.85 },
  { maxDay: 100, stage: 'Grain Filling / Maturity', min: 0.4, max: 0.7 },
  { maxDay: 130, stage: 'Harvest / Senescence', min: -0.1, max: 0.4 },
]

// Day-based generic vegetative cycle for crops without rice-specific tables
// (mango, cassava, banana, ...). Wider bands than rice and fewer stages — the
// same day-since-planting driver, but with thresholds that don't assume the
// flood-and-recede cycle of a paddy.
export const GENERIC_GROWTH_STAGES = [
  { maxDay: 40, stage: 'Vegetative', min: 0.15, max: 0.5 },
  { maxDay: 85, stage: 'Flowering / Fruiting', min: 0.35, max: 0.65 },
  { maxDay: 130, stage: 'Mature', min: 0.25, max: 0.55 },
]
