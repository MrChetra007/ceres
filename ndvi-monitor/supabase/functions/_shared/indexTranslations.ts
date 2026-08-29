// Plain-language translation layer for raw index values (AIM · Feature 1).
//
// Every index gets the same 4-band structure the app already uses for NDVI
// (dead / unhealthy / moderate / healthy). Band boundaries are quartiles of
// each index's own VIS min..max (ee-data aliases src/config.js INDICES), so
// indices with different natural ranges (savi/evi 0..1, ndwi -1..1) are NOT
// forced onto ndvi's scale.
//
// Source of truth: this module runs SERVER-side (imported by ee-data). The
// frontend receives `label` + `phraseKey` + `phrase` and looks the translated
// text up in its i18n dictionaries (km entries may be empty → falls back to
// the English `phrase` here). Keep the band arrays in sync with the vis in
// ee-data/index.ts and src/config.js — they are deliberately the SAME module
// family of thresholds (read them, don't copy values by hand).

const BAND_LABELS = ["dead", "unhealthy", "moderate", "healthy"] as const;

export interface IndexBand {
  max: number;
  label: (typeof BAND_LABELS)[number];
  phraseKey: string;
  phrase: string;
}

// Thresholds (exclusive-of-band-inclusive of `max`). Quartiles of VIS:
//   ndvi/gndvi  [-0.2, 0.8] → 0.05 / 0.30 / 0.55
//   ndwi        [-1, 1]     → -0.5 / 0 / 0.5
//   lswi        [-0.3, 0.6] → -0.075 / 0.15 / 0.375
//   savi/evi    [0, 1]      → 0.25 / 0.5 / 0.75
export const INDEX_BANDS: Record<string, IndexBand[]> = {
  ndvi: [
    { max: 0.05, label: "dead", phraseKey: "aim.p_ndvi_dead", phrase: "No living vegetation detected." },
    { max: 0.3, label: "unhealthy", phraseKey: "aim.p_ndvi_unhealthy", phrase: "Canopy is sparse or stressed." },
    { max: 0.55, label: "moderate", phraseKey: "aim.p_ndvi_moderate", phrase: "Canopy is moderately developed." },
    { max: Infinity, label: "healthy", phraseKey: "aim.p_ndvi_healthy", phrase: "Canopy is dense and healthy." },
  ],
  ndwi: [
    { max: -0.5, label: "dead", phraseKey: "aim.p_ndwi_dead", phrase: "No water detected — the field looks dry." },
    { max: 0, label: "unhealthy", phraseKey: "aim.p_ndwi_unhealthy", phrase: "Little or no surface water." },
    { max: 0.5, label: "moderate", phraseKey: "aim.p_ndwi_moderate", phrase: "Some surface water present." },
    { max: Infinity, label: "healthy", phraseKey: "aim.p_ndwi_healthy", phrase: "Standing water detected — the field is wet." },
  ],
  lswi: [
    { max: -0.075, label: "dead", phraseKey: "aim.p_lswi_dead", phrase: "Very dry soil and vegetation." },
    { max: 0.15, label: "unhealthy", phraseKey: "aim.p_lswi_unhealthy", phrase: "Soil moisture is low." },
    { max: 0.375, label: "moderate", phraseKey: "aim.p_lswi_moderate", phrase: "Moisture levels are adequate." },
    { max: Infinity, label: "healthy", phraseKey: "aim.p_lswi_healthy", phrase: "Soil and canopy are well-watered." },
  ],
  savi: [
    { max: 0.25, label: "dead", phraseKey: "aim.p_savi_dead", phrase: "No vegetation signal over the soil." },
    { max: 0.5, label: "unhealthy", phraseKey: "aim.p_savi_unhealthy", phrase: "Sparse, soil-dominated cover." },
    { max: 0.75, label: "moderate", phraseKey: "aim.p_savi_moderate", phrase: "Moderate vegetation cover over the soil." },
    { max: Infinity, label: "healthy", phraseKey: "aim.p_savi_healthy", phrase: "Dense healthy canopy." },
  ],
  evi: [
    { max: 0.25, label: "dead", phraseKey: "aim.p_evi_dead", phrase: "No vegetation signal." },
    { max: 0.5, label: "unhealthy", phraseKey: "aim.p_evi_unhealthy", phrase: "Sparse or stressed vegetation." },
    { max: 0.75, label: "moderate", phraseKey: "aim.p_evi_moderate", phrase: "Moderate vegetation density." },
    { max: Infinity, label: "healthy", phraseKey: "aim.p_evi_healthy", phrase: "Dense, vigorous vegetation." },
  ],
  gndvi: [
    { max: 0.05, label: "dead", phraseKey: "aim.p_gndvi_dead", phrase: "No live green vegetation." },
    { max: 0.3, label: "unhealthy", phraseKey: "aim.p_gndvi_unhealthy", phrase: "Weak chlorophyll / greenness signal." },
    { max: 0.55, label: "moderate", phraseKey: "aim.p_gndvi_moderate", phrase: "Moderate greenness." },
    { max: Infinity, label: "healthy", phraseKey: "aim.p_gndvi_healthy", phrase: "Strong green canopy." },
  ],
  // The composite health score (0-100) reuses the same 4-band language.
  composite: [
    { max: 25, label: "dead", phraseKey: "aim.s_dead", phrase: "The field is in poor condition." },
    { max: 50, label: "unhealthy", phraseKey: "aim.s_unhealthy", phrase: "The field is under stress." },
    { max: 75, label: "moderate", phraseKey: "aim.s_moderate", phrase: "The field is developing, but worth watching." },
    { max: Infinity, label: "healthy", phraseKey: "aim.s_healthy", phrase: "The field looks healthy." },
  ],
};

export function translateIndexValue(
  index: string,
  value: number,
): { label: string; phraseKey: string; phrase: string } {
  const bands = INDEX_BANDS[index] || INDEX_BANDS.ndvi;
  const band = bands.find((b) => value <= b.max) ?? bands[bands.length - 1];
  return { label: band.label, phraseKey: band.phraseKey, phrase: band.phrase };
}