// Guided comparison — surface index disagreement (AIM · Feature 4).
//
// Deliberately a SHORT, explicit rules list, not a generic scoring formula:
// the value here is catching specific, diagnostically-meaningful contradictions
// (e.g. "canopy reads healthy but moisture is dropping"), not flagging every
// minor numeric difference between indices (which would produce noise).
//
// Rules are keyed by i18n keys so the frontend can localize; `message` is the
// English fallback (km entries may be empty).
export interface Discrepancy {
  messageKey: string;
  message: string;
}

export function detectDiscrepancy(
  raw: Record<string, number>,
): Discrepancy | null {
  // Canopy looks fine (NDVI healthy) but soil moisture is dropping (LSWI low)
  // → irrigation is the likely next step. Most common and most actionable;
  // expand the table as more rules prove useful.
  if (raw.ndvi != null && raw.lswi != null && raw.ndvi >= 0.5 && raw.lswi < 0) {
    return {
      messageKey: "aim.disc_irrigate",
      message:
        "Canopy looks healthy, but soil moisture is low — consider irrigation soon.",
    };
  }
  return null;
}