// Growth-stage-aware index selection (AIM · Feature 2) and composite scoring
// weights (AIM · Feature 3).
//
// Key insight: NDVI is unreliable on bare soil or newly flooded fields, so the
// "main reading" for a young paddy should be a soil-corrected index instead.
// This module maps the REAL rice stages from growthStage.ts (Germination →
// Harvest) — NOT the placeholder stage names in the original AIM guide — to a
// primary index, a one-line reason, and the weights used to blend indices into
// the composite health score.
//
// NOTE: the weights are a sensible default, not a scientifically tuned model.
// Revisit once real field outcomes (farmer-reported yield, ground-truth
// stress) are available to validate against.
//
// Source of truth pattern matches _shared/indexTranslations.ts: ee-data owns
// the computation, the frontend receives keys/values, and i18n dictionaries
// (km may be empty → English fallback) resolve display text.
import { stageForDay } from "./growthStage.ts";
const EARLY_STAGES = new Set(["Germination", "Seedling"]);
// Soil is still clearly visible through the canopy in Germination/Seedling →
// use SAVI (L=0.5, corrects for soil brightness). Once the canopy closes over
// (Vegetative onward), plain NDVI is the reliable standard again.
export function primaryIndexForStage(stageName) {
    if (stageName && EARLY_STAGES.has(stageName))
        return "savi";
    return "ndvi";
}
// One-line reason shown when the auto-selected index is NOT ndvi, so the UI
// doesn't look like a bug — it's deliberate. Why fits alongside the mapping
// (not as freeform English in a Vue component) so they can never drift.
export function primaryIndexReasonKey(stageName) {
    if (stageName && EARLY_STAGES.has(stageName))
        return "aim.reason_savi_early";
    return null;
}
// Index blend for the composite health score, keyed by the same stages.
// Early: soil-corrected canopy dominance + water presence, 2 indices.
// Later: canopy health dominates with a water-stress cross-check + a
// saturation-resistant indicator, 3 indices.
export function healthScoreWeights(stageName) {
    if (stageName && EARLY_STAGES.has(stageName)) {
        return { savi: 0.6, lswi: 0.4 };
    }
    return { ndvi: 0.6, lswi: 0.3, evi: 0.1 };
}
// Days-since-planting → stage name, reusing growthStage.ts as the single
// source of rice stage boundaries (null when no valid planting date).
export function stageNameForDayCount(dayCount) {
    if (dayCount == null || dayCount < 0)
        return null;
    return stageForDay(dayCount).name;
}
