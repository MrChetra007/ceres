// Guided comparison — surface index disagreement (AIM · Feature 4).
//
// The composite health score is a WEIGHTED BLEND of indices. When the headline
// index (the one shown as the badge) reads healthy but the blended score lands
// meaningfully lower, that's a genuine, worth-surfacing disagreement — usually
// because a secondary index (LSWI moisture, EVI vigour) is weak. We surface
// that explicitly instead of silently blending, so the user understands why
// the two numbers on the same card differ.
//
// Deliberately a SHORT, explicit rules list (not a generic scoring formula):
// the value is catching specific, diagnostically-meaningful contradictions
// (e.g. "canopy reads healthy but moisture is dropping"), not flagging every
// minor numeric difference (which would produce noise).
//
// Rules run against the MONTH-SCOPED raw values (actionGetFieldHealthScore),
// keyed by i18n keys so the frontend can localize; `message` is the English
// fallback (km entries may be empty).
import { translateIndexValue } from "./indexTranslations.ts";

export interface Discrepancy {
  messageKey: string;
  message: string;
}

export interface DiscrepancyContext {
  score: number;
  primaryIndex: string; // "ndvi" | "savi" — the headline index shown as the badge
  stage: string | null;
}

export function detectDiscrepancy(
  raw: Record<string, number>,
  ctx?: DiscrepancyContext,
): Discrepancy | null {
  // Rule 1 — canopy healthy but soil moisture dropping → irrigation is the
  // likely next step. NDVI's healthy boundary is 0.55; LSWI's "unhealthy"
  // ceiling is 0.15 (see INDEX_BANDS).
  if (
    raw.ndvi != null &&
    raw.lswi != null &&
    raw.ndvi >= 0.5 &&
    raw.lswi < 0.15
  ) {
    return {
      messageKey: "aim.disc_irrigate",
      message:
        "Canopy looks healthy, but soil moisture (LSWI) is low — consider irrigation soon.",
    };
  }

  // Rule 2 — the headline index reads healthy/moderate while the blended score
  // is materially worse → a secondary index is dragging the composite down.
  // This is the "25/100 poor" vs "0.70 healthy" case: don't silently blend.
  if (ctx && ctx.score != null) {
    const comp = translateIndexValue("composite", ctx.score);
    if (comp.label === "dead" || comp.label === "unhealthy") {
      const head = raw[ctx.primaryIndex];
      const headBand =
        head != null ? translateIndexValue(ctx.primaryIndex, head) : null;
      if (headBand && (headBand.label === "healthy" || headBand.label === "moderate")) {
        if (raw.lswi != null && raw.lswi < 0.15) {
          return {
            messageKey: "aim.disc_lswi_pulls",
            message:
              "The headline index reads healthy, but low soil moisture (LSWI) is pulling the overall score down.",
          };
        }
        if (raw.evi != null && raw.evi < 0.5) {
          return {
            messageKey: "aim.disc_evi_pulls",
            message:
              "The headline index reads healthy, but lower vegetation vigour (EVI) is pulling the overall score down.",
          };
        }
        return {
          messageKey: "aim.disc_mixed",
          message:
            "The headline index reads healthy, but a weaker secondary index is pulling the blended score down.",
        };
      }
    }
  }
  return null;
}
