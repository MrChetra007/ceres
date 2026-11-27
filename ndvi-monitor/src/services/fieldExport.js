// ---------------------------------------------------------------------------
// Per-field export (Phase 4 — clean machine-readable snapshot)
// ---------------------------------------------------------------------------
// Builds ONE clean, stable JSON document for the selected field instead of
// dumping internal state. Canonical values (status/tier/indices) are kept
// alongside the human-readable localized text. Async bits (forecast, location
// names, field checks) are best-effort and never block the export.
// ---------------------------------------------------------------------------

import {
  state,
  fieldStatus,
  fieldTrends,
  getGrowthStage,
  getOrComputeArea,
  fieldConfidence,
} from '../store'
import { buildDecision } from './decision'
import { calcTrendChange } from './trend'
import { seasonNudge } from './season'
import { loadFieldObservations } from './supabase'
import { getWeatherContext } from './weatherService'
import { resolveLocation } from './adminBoundaries'

export const FIELD_EXPORT_SCHEMA = 'ceres.field.v2'

function num(v) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function round(v, digits = 3) {
  const n = num(v)
  if (n === null) return null
  const f = 10 ** digits
  return Math.round(n * f) / f
}

function dateOnly(v) {
  if (!v) return null
  const s = String(v)
  return s.length >= 10 ? s.slice(0, 10) : s
}

function isoTimestamp(v) {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function fileSlug(v) {
  return (
    String(v || 'field')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'field'
  )
}

function statusKeyOf(status) {
  if (!status) return 'unknown'
  if (status.badgeClass === 'stressed') return 'stressed'
  if (status.badgeClass === 'moderate') return 'below_expected'
  if (status.badgeClass === 'healthy') return 'healthy'
  return 'unknown'
}

function cleanPoints(points) {
  return (Array.isArray(points) ? points : [])
    .filter((p) => p && p.date && num(p.value) !== null)
    .map((p) => ({ date: dateOnly(p.date), value: round(p.value, 3) }))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
}

function currentIndexName() {
  const i = state.currentIndex
  return i && i !== 'truecolor' ? i : 'ndvi'
}

/**
 * Build the export object. `extras` lets the field panel pass richer local data
 * (AIM card, forecast, official weather, resolved location names, decision text)
 * so the JSON matches what the farmer is looking at.
 */
export async function buildFieldExport(field, extras = {}) {
  if (!field) throw new Error('no field selected')

  const status = extras.status || fieldStatus[field.id] || null
  const confidence = extras.confidence || fieldConfidence(field) || null
  const dayCount = field.plantingDate
    ? Math.floor((Date.now() - new Date(field.plantingDate).getTime()) / 86400000)
    : null
  const stage = dayCount !== null && dayCount >= 0 ? getGrowthStage(dayCount, field).stage : null
  // The field panel passes the live chart series (whatever band is open); the
  // menu path has no live series, so it exports the canonical NDVI trend.
  const index = Array.isArray(extras.trend) ? currentIndexName() : 'ndvi'
  // Compute the change from the RAW series (it carries cloudPct/status needed
  // for the shared cloud filter); cleanPoints() below is only for the export.
  const trendSeries = extras.trend || fieldTrends[field.id] || []
  const trend = cleanPoints(trendSeries)
  const change = calcTrendChange(trendSeries)
  const changePct = change ? change.pct : null
  const latest = trend.length ? trend[trend.length - 1] : null

  const decision =
    extras.decision ||
    buildDecision({
      index,
      status: statusKeyOf(status),
      stage,
      dayCount,
      prePlanting: dayCount !== null && dayCount < 0,
      ndvi: status && status.value != null ? status.value : null,
      rainfallMm: state.rainfallMm,
      confidenceTier: confidence ? confidence.tier : null,
      mode: status && status.cloudBlocked ? 'no_data' : 'optical',
      trendPct: changePct,
      cropEnglish: field.cropEnglish || null,
    })
  const season = extras.season || seasonNudge({ stage, cropEnglish: field.cropEnglish })

  let observations = extras.observations
  if (!Array.isArray(observations)) {
    try {
      observations = await loadFieldObservations(field.id, 50)
    } catch (e) {
      observations = []
    }
  }

  let forecast = extras.forecast
  if (!Array.isArray(forecast)) {
    const lat = field.centroidLat
    const lng = field.centroidLng
    if (lat != null && lng != null) {
      try {
        const ctx = await getWeatherContext(lat, lng)
        forecast = ctx.days
      } catch (e) {
        forecast = []
      }
    } else {
      forecast = []
    }
  }

  let location = extras.locationNames
  if (!location) {
    try {
      location = await resolveLocation(
        {
          province_code: field.provinceCode,
          district_code: field.districtCode,
          commune_code: field.communeCode,
          village_code: field.villageCode,
        },
        state.preferredLanguage,
      )
    } catch (e) {
      location = null
    }
  }

  const official = extras.officialWeather || null
  const geometry = field.geojson && (field.geojson.geometry || field.geojson)
  const decisionText = extras.decisionText || null
  const seasonText = extras.seasonText || null

  return {
    schema: FIELD_EXPORT_SCHEMA,
    generated_at: new Date().toISOString(),
    app: 'Ceres',
    units: { area: 'ha', rainfall: 'mm', temperature: 'degC', index: 'dimensionless' },
    field: {
      id: field.id,
      name: field.name,
      crop: field.cropName || field.cropEnglish || null,
      crop_english: field.cropEnglish || null,
      area_ha: round(getOrComputeArea(field), 2),
      planting_date: dateOnly(field.plantingDate),
      planting_date_source: field.plantingDateSource || null,
      created_at: isoTimestamp(field.createdAt),
      notes: field.notes || null,
      share_with_authorities: !!field.shareWithAuthorities,
      location: {
        province_code: field.provinceCode || null,
        district_code: field.districtCode || null,
        commune_code: field.communeCode || null,
        village_code: field.villageCode || null,
        province: location && location.province ? location.province : null,
        district: location && location.district ? location.district : null,
        commune: location && location.commune ? location.commune : null,
        village: location && location.village ? location.village : null,
        centroid:
          field.centroidLat != null && field.centroidLng != null
            ? { lat: round(field.centroidLat, 6), lng: round(field.centroidLng, 6) }
            : null,
      },
      geometry: geometry || null,
    },
    current: {
      index,
      as_of: latest ? latest.date : dateOnly(status && status.date),
      value: latest ? latest.value : round(status && status.value, 3),
      status: statusKeyOf(status),
      status_label: status && status.badgeText ? status.badgeText : null,
      growth_stage: stage,
      day_since_planting: dayCount,
      confidence: confidence
        ? { tier: confidence.tier || null, reason: confidence.reason || null }
        : null,
      scene_count: status && status.count != null ? status.count : null,
      cloud_blocked: status ? !!status.cloudBlocked : null,
      radar_fallback: !!state.radarFallback.main,
    },
    decision: {
      tier: decision.tier,
      severity: decision.severity,
      urgency: decision.urgency,
      action_window: decision.timeWindow,
      headline: decisionText ? decisionText.headlineText : null,
      likely_causes: decisionText ? decisionText.hypothesisTexts : [],
      next_steps: decisionText ? decisionText.actionTexts : [],
      field_checks: decisionText ? decisionText.verifyTexts : [],
      reason: decisionText ? decisionText.reasonText : null,
    },
    season_note: season
      ? {
          phase: season.phase,
          window: seasonText ? seasonText.window : null,
          tip: seasonText ? seasonText.tip : null,
        }
      : null,
    aim: extras.aim
      ? {
          score: num(extras.aim.score),
          label: extras.aim.label || null,
          primary_index: extras.aim.primaryIndex || null,
          phrase: extras.aimPhrase || null,
          // v2: `components` are the normalized 0..1 values actually blended
          // into the score; `raw_values` are the un-normalized index readings.
          components: extras.aim.components || null,
          raw_values: extras.aim.rawValues || null,
          weights: extras.aim.weights || null,
        }
      : null,
    weather: {
      rainfall_21d_mm: round(state.rainfallMm, 1),
      forecast: Array.isArray(forecast)
        ? forecast.map((d) => ({
            date: dateOnly(d.date),
            rain_pct: num(d.rainPct),
            tmax_c: round(d.tMax, 1),
            tmin_c: round(d.tMin, 1),
          }))
        : [],
      official_current: official
        ? {
            temperature_c: round(official.tempC, 1),
            condition: official.condition || null,
            humidity_pct: round(official.humidity, 0),
            precipitation_mm: round(official.precipMm, 1),
            updated_at: isoTimestamp(official.lastUpdated),
            stale: !!official.stale,
          }
        : null,
    },
    trend: {
      index,
      change_14d_pct: changePct === null ? null : round(changePct, 1),
      compared_from: change ? change.comparedFrom : null,
      compared_to: change ? change.comparedTo : null,
      gap_days: change ? change.gapDays : null,
      points: trend,
    },
    observations: (Array.isArray(observations) ? observations : []).map((o) => ({
      observed_on: dateOnly(o.observed_on),
      tags: Array.isArray(o.tags) ? o.tags : [],
      outcome: o.outcome || 'unknown',
      notes: o.notes || null,
      has_photo: !!o.photo_path,
      source: o.source || 'app',
    })),
  }
}

export async function downloadFieldJson(field, extras = {}) {
  const payload = await buildFieldExport(field, extras)
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${fileSlug(field.name)}_${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return payload
}
