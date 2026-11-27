// Shared growth-stage logic — single source of truth for ee-alerts-worker and
// the ee-data Edge Function. The rice table is a VERBATIM copy of
// RICE_GROWTH_STAGES in src/config.js (the client is the source of truth; the
// browser cannot import this Deno module). Keep them identical — tests/stages.test.js
// asserts table + stageForDay parity for days 0–200.
export const RICE_GROWTH_STAGES = [
  { name: "Transplanting", maxDay: 10, min: -0.1, max: 0.3 },
  { name: "Tillering", maxDay: 30, min: 0.3, max: 0.55 },
  { name: "Stem Elongation / Booting", maxDay: 55, min: 0.5, max: 0.75 },
  { name: "Flowering / Heading", maxDay: 75, min: 0.6, max: 0.85 },
  { name: "Grain Filling / Maturity", maxDay: 100, min: 0.4, max: 0.7 },
  { name: "Harvest / Senescence", maxDay: 130, min: -0.1, max: 0.4 },
];

// Same day-based driver as RICE_GROWTH_STAGES but with a plain vegetative
// cycle and wider bands — used for fields whose crop isn't rice.
export const GENERIC_GROWTH_STAGES = [
  { name: "Vegetative", maxDay: 40, min: 0.15, max: 0.5 },
  { name: "Flowering / Fruiting", maxDay: 85, min: 0.35, max: 0.65 },
  { name: "Mature", maxDay: 130, min: 0.25, max: 0.55 },
];

export function stageForDay(day: number, useGeneric = false) {
  const table = useGeneric ? GENERIC_GROWTH_STAGES : RICE_GROWTH_STAGES;
  return table.find((s) => day <= s.maxDay) || table[table.length - 1];
}

export function statusFromNdvi(
  ndvi: number,
  plantingDate: string | null,
  useGeneric = false,
): { status: string; stage: string | null } {
  if (!plantingDate) {
    // flat fallback, same as the app
    if (ndvi >= 0.6) return { status: "healthy", stage: null };
    if (ndvi >= 0.3) return { status: "below_expected", stage: null };
    return { status: "stressed", stage: null };
  }
  const day = Math.floor(
    (Date.now() - new Date(plantingDate).getTime()) / 86400000,
  );
  const stage = stageForDay(day, useGeneric);
  const deficit = stage.min - ndvi;
  if (deficit > 0.15) return { status: "stressed", stage: stage.name };
  if (ndvi < stage.min) return { status: "below_expected", stage: stage.name };
  return { status: "healthy", stage: stage.name };
}
