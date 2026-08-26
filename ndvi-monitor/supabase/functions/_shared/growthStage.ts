// Shared growth-stage logic — single source of truth for ee-alerts-worker and
// the ee-data Edge Function. Ported verbatim from the original inline copy in
// ee-alerts-worker (which itself was a port of the app's app.js thresholds) so
// the two functions can never drift out of sync.
export const RICE_GROWTH_STAGES = [
  { name: "Germination", maxDay: 10, min: 0.05, max: 0.15 },
  { name: "Seedling", maxDay: 25, min: 0.15, max: 0.3 },
  { name: "Vegetative", maxDay: 55, min: 0.3, max: 0.55 },
  { name: "Reproductive", maxDay: 90, min: 0.55, max: 0.75 },
  { name: "Maturation", maxDay: 110, min: 0.35, max: 0.55 },
  { name: "Harvest", maxDay: Infinity, min: 0.1, max: 0.3 },
];

export function stageForDay(day: number) {
  return (
    RICE_GROWTH_STAGES.find((s) => day <= s.maxDay) ||
    RICE_GROWTH_STAGES[RICE_GROWTH_STAGES.length - 1]
  );
}

export function statusFromNdvi(
  ndvi: number,
  plantingDate: string | null,
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
  const stage = stageForDay(day);
  const deficit = stage.min - ndvi;
  if (deficit > 0.15) return { status: "stressed", stage: stage.name };
  if (ndvi < stage.min) return { status: "below_expected", stage: stage.name };
  return { status: "healthy", stage: stage.name };
}
