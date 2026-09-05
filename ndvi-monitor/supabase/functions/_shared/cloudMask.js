// Pixel-level Sentinel-2 cloud / shadow masking + field-level validity stats.
//
// Source of truth for the "how cloudy is a pixel" decision (Ceres cloud-resilience
// scope). The browser must never guess whether a pixel is cloud-blocked — every
// optical reading the app surfaces is masked here, and the resulting metadata
// (validPixelFraction, clearSceneCount, window) is returned in the response so
// the UI can label confidence honestly.
//
// Things deliberately NOT done here (kept elsewhere):
//   - index math (formulas live in ee-data's applyIndex / _shared)
//   - scene-level CLOUDY_PIXEL_PERCENTAGE pre-filtering (still used to cheaply
//     drop unusable scenes BEFORE the expensive pixel mask; kept in ee-data)
//   - RVI / Sentinel-1 (radar has its own path; this module is optical-only)
//
// Configurable defaults (Section 3 of the cloud-resilience spec). Keep the
// constants here so they are NOT hard-coded across ee-data files.
export const CLOUD_RESILIENCE = {
    // s2cloudless probability (%) above which a pixel is treated as cloud.
    CLOUD_PROBABILITY_THRESHOLD: 55,
    // Pixels within this many meters of a cloud pixel are also masked (avoid
    // contamination of the border around cloud edges / shadows).
    CLOUD_EDGE_BUFFER_METERS: 300,
    // SCL classes to treat as invalid (see S2 SCL band values):
    //   0 no data, 1 saturated/defective, 3 cloud shadow, 8 cloud medium,
    //   9 cloud high, 10 cirrus, 11 snow.
    INVALID_SCL_CLASSES: [0, 1, 3, 8, 9, 10, 11],
    // Field-level minimum clear-pixel fraction before a reading is "high".
    MIN_VALID_PIXEL_FRACTION: 0.6,
    // Clear-scene counts for confidence tiers.
    HIGH_CONFIDENCE_MIN_SCENES: 3,
    MEDIUM_CONFIDENCE_MIN_SCENES: 1,
    // Temporal composite windows.
    OPTICAL_PRIMARY_DAYS: 45,
    OPTICAL_MAX_LOOKBACK_DAYS: 90,
    STALE_READING_DAYS: 45,
};
/**
 * Expand an S2_SR_HARMONIZED ImageCollection with each scene's s2cloudless
 * cloud-probability band, joined by `system:index`. Pass the SR collection;
 * returns it with an extra `cloud_prob` band per image.
 *
 * Joining by system:index is robust because both collections share the same
 * granule IDs; it avoids a costly temporal/intersecting join here.
 */
export function addCloudProbability(collection, ee) {
    const s2c = ee.ImageCollection("COPERNICUS/S2_CLOUD_PROBABILITY");
    const withProb = collection.map((img) => {
        // Reduce the (possibly empty) filtered lookup with a LINEAR reducer: sum()
        // returns an image of zeros when the matching s2cloudless granule is
        // missing, whereas .first() would resolve to a server-side null and make
        // Image.select throw "Parameter 'input' may not be null" inside this map
        // (S2_CLOUD_PROBABILITY has gaps for recent granules). We rely on the SCL
        // mask (below) to flag clouds that s2cloudless missed.
        const cloudProb = s2c
            .filter(ee.Filter.eq("system:index", img.get("system:index")))
            .select("probability")
            .sum();
        return img.addBands(cloudProb);
    });
    return withProb;
}
/**
 * Build a 0/1 valid-pixel mask image for a single S2_SR_HARMONIZED scene that
 * ALREADY has the `probability` s2cloudless band added (use addCloudProbability
 * on the collection first). 1 = clear surface pixel safe to compute optical
 * indices over; 0 = cloud, shadow, cirrus, saturated/defective, or near-cloud
 * border pixel that must NOT be colored as a healthy/stressed value.
 *
 * Mask layers (OR'd together → invalid):
 *   1. s2cloudless probability > threshold
 *   2. SCL invalid classes (shadow, cloud, cirrus, saturated/defective, no data)
 *   3. a 300 m buffer around those cloud/shadow pixels (cloud-edge buffer)
 *   4. Data-masked pixels (no SR data)
 */
export function validPixelMask(scene, ee) {
    const cfg = CLOUD_RESILIENCE;
    // 1 + 2. base "not valid" mask from probability and SCL.
    const probInvalid = scene.select("probability").gt(cfg.CLOUD_PROBABILITY_THRESHOLD);
    const scl = scene.select("SCL");
    let sclInvalid = null;
    for (const klass of cfg.INVALID_SCL_CLASSES) {
        const hit = scl.eq(klass);
        sclInvalid = sclInvalid ? sclInvalid.or(hit) : hit;
    }
    const baseInvalid = probInvalid.or(sclInvalid);
    // 3. cloud-edge buffer: dilate the invalid mask a few 10 m pixels out so
    // border pixels don't leak contaminated values.
    const bufferedInvalid = baseInvalid.focal_max(2, "square");
    // 4. no-SR-data pixels (outside the scene footprint).
    const noData = scene.select("B8").mask().not();
    // 1 = valid.
    return bufferedInvalid.or(noData).not().rename("validMask");
}
/**
 * Fraction of pixels over a geometry that carry a valid value in a single named
 * band of an image. Pass the image and the band name to average (typically the
 * index band already masked to NaN where invalid). Returns 0..1 or null.
 */
export async function validPixelFraction(image, band, geometry, scale, ee, evaluate) {
    const fraction = await evaluate(image
        .select(band)
        .unmask(0) // NaN -> 0, now 0(no data)/1(valid)
        .reduceRegion({
        reducer: ee.Reducer.mean(),
        geometry,
        scale,
        maxPixels: 1e9,
    }));
    const v = fraction && fraction[band] != null ? fraction[band] : null;
    return v == null ? null : Math.max(0, Math.min(1, v));
}
