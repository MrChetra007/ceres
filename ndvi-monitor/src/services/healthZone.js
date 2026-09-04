import { ZONE_SCALE, FLAT_THRESHOLDS, STAGE_DEFICIT_BAD, MONTHS, RVI_VIS } from '../config'
import { getGrowthStage } from '../store'

export function clamp01(v) {
  return Math.max(0, Math.min(1, v))
}

// Max of the band family's value scale (RAW values range 0..1 for optical, but
// RVI is 0..2 — its formula 4*VH/(VV+VH) is bounded 0..4 and reads ~2 at dense
// canopy). Color ramps and swatches must normalize by this before lookup.
export function viewMax(view) {
  return view === 'rvi' ? RVI_VIS.max : 1
}

// 0.0, 0.1, ... 1.0 — the tick positions drawn under the Analysis-Scale bar.
export function makeTicks() {
  const out = []
  for (let v = ZONE_SCALE.min; v <= ZONE_SCALE.max + 1e-9; v += ZONE_SCALE.step) {
    out.push(Math.round(v * 10) / 10)
  }
  return out
}

// Value -> percentage along the bar (both band families live on the 0..1 scale).
export function tickLeft(value) {
  return ((clamp01(value) - ZONE_SCALE.min) / (ZONE_SCALE.max - ZONE_SCALE.min)) * 100
}

// The color ramp each band family renders on the map: NDVI is the classic
// red->amber->yellow->green vegetation ramp, RVI (radar fallback) is a
// blue->white->green structural signal. Stops match the map legend in style.css.
const NDVI_STOPS = [
  { pos: 0, rgb: [239, 91, 91] },
  { pos: 0.4, rgb: [245, 166, 35] },
  { pos: 0.62, rgb: [249, 217, 118] },
  { pos: 1, rgb: [34, 201, 142] },
]
const RVI_STOPS = [
  { pos: 0, rgb: [79, 168, 255] },
  { pos: 0.5, rgb: [255, 255, 255] },
  { pos: 1, rgb: [34, 201, 142] },
]

function lerp(a, b, t) { return Math.round(a + (b - a) * t) }

function rgbStr(c) { return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')' }

export function rampColor(view, value) {
  const stops = view === 'rvi' ? RVI_STOPS : NDVI_STOPS
  // `value` is a normalized 0..1 FRACTION on the ramp (callers that hold RAW
  // values — see bucketSwatchColor — normalize by viewMax before calling).
  const v = clamp01(value)
  if (v <= stops[0].pos) return rgbStr(stops[0].rgb)
  for (let i = 1; i < stops.length; i++) {
    if (v <= stops[i].pos) {
      const a = stops[i - 1], b = stops[i]
      const t = (v - a.pos) / (b.pos - a.pos)
      return rgbStr([lerp(a.rgb[0], b.rgb[0], t), lerp(a.rgb[1], b.rgb[1], t), lerp(a.rgb[2], b.rgb[2], t)])
    }
  }
  return rgbStr(stops[stops.length - 1].rgb)
}

export function bucketSwatchColor(bucket, view) {
  // Bucket lo/hi are RAW values; RVI raw values (bounded 0..2, not 0..1) must
  // be normalized onto the ramp's 0..1 fraction or every bucket above RVI 1.0
  // would clamp to solid green. viewMax is 1 for optical (no-op).
  return rampColor(view, (bucket.lo + bucket.hi) / 2 / viewMax(view))
}

// Good/Medium/Bad boundaries for the current view. NDVI with a planting date
// follows the growth stage exactly like buildStatusObject() in store.js so the
// markers, the health badge and this bar can never disagree: Good starts at the
// stage's expected min, Bad starts 0.15 below it. Without a planting date (or
// for the radar RVI view) it falls back to the flat 0.3/0.6 thresholds.
export function zoneThresholds(state, view) {
  const flat = { bad: FLAT_THRESHOLDS.bad, good: FLAT_THRESHOLDS.good, stageAware: false, rvi: view === 'rvi', stage: null, days: null }
  if (view !== 'ndvi') return flat
  const field = state.fields.find((f) => f.id === state.currentFieldId)
  const m = MONTHS[state.mainMonth]
  let days = null
  if (field && field.plantingDate && m) {
    const asOf = new Date(Date.UTC(m.year, m.month, 0)).getTime()
    days = Math.floor((asOf - new Date(field.plantingDate).getTime()) / 86400000)
  }
  if (!field || !field.plantingDate || days == null || days < 0) return flat
  const stage = getGrowthStage(days)
  if (!stage) return flat
  return {
    bad: clamp01(stage.min - STAGE_DEFICIT_BAD),
    good: clamp01(stage.min),
    stageAware: true,
    rvi: false,
    stage,
    days,
  }
}
