// Earth Engine data proxy — all satellite computation runs server-side in the
// `ee-data` Edge Function (service-account auth); the browser never talks to
// Earth Engine or holds an EE OAuth client.
export const EE_DATA_URL = 'https://wopwwtnvqyomiwbsxiks.functions.supabase.co/ee-data';
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://wopwwtnvqyomiwbsxiks.supabase.co'
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndvcHd3dG52cXlvbWl3YnN4aWtzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NjAyMzcsImV4cCI6MjA5NTEzNjIzN30.2Wl7erPZYi5iuqrF-4UvMObDEYMmt6M86Pg3p89YGeU'

// Telegram alerts (Phase 8.3)
export const TELEGRAM_BOT_USERNAME = import.meta.env.VITE_TELEGRAM_BOT_USERNAME || 'ndvi_monitor_bot'
export const TELEGRAM_LINK_TTL_MS = 10 * 60 * 1000

// AI agronomist (Consult AI) — Supabase Edge Function, requires a logged-in JWT
export const CONSULT_AI_URL = 'https://wopwwtnvqyomiwbsxiks.functions.supabase.co/consult-ai'
export const CONSULT_AI_LANG = 'en'

export const DEFAULT_AOI = [102.985, 12.845, 103.048, 12.898]
export const MAP_CENTER = [12.8715, 103.0165]
export const MAP_ZOOM = 14

export const NDVI_VIS = { min: -0.2, max: 0.8, palette: ['red', 'yellow', 'green'] }
export const NDWI_VIS = { min: -1, max: 1, palette: ['brown', 'tan', '#e0f0ff', '#4a90d9', '#003366'] }
export const LSWI_VIS = { min: -0.3, max: 0.6, palette: ['tan', 'lightblue', 'darkblue'] }
// SAVI/EVI/GNDVI are visual/exploratory tabs only (they do NOT feed the
// growth-stage stress-alert scoring). Palettes below are starter breakpoints
// for the user to tune. Keep in sync with ee-data's VIS.
export const SAVI_VIS = { min: 0, max: 1, palette: ['brown', 'yellow', 'green'] }
export const EVI_VIS = { min: 0, max: 1, palette: ['red', 'orange', 'green'] }
export const GNDVI_VIS = { min: -0.2, max: 0.8, palette: ['red', 'purple', 'green'] }
export const RVI_VIS = { min: 0, max: 2, palette: ['blue', 'white', 'green'] }

// True Color photo mode — real Sentinel-2 RGB (B4·B3·B2), not an index.
// Deliberately NOT in INDICES: the trend functions normalizeDifference() over
// cfg.bands, which would break for a 3-band RGB triplet. Store/store guard
// routes around it.
export const TRUE_COLOR_VIS = { min: 0, max: 5000 }

export const TRUE_COLOR = {
  name: 'True Color',
  bands: ['B4', 'B3', 'B2'],
  label: 'Photo',
  color: '#ffffff',
  full: 'True Color Photo',
  fullKhm: 'រូបថតពណ៌ពិត',
  explain: 'Real Sentinel-2 RGB photo (Bands 4·3·2) — what the field actually looks like, no index colors. Clouds and haze show as-is.',
  explainKhm: 'រូបថតផ្កាយរណបពណ៌ពិត (Bands 4·3·2) — អ្វីដែលវាលពិតជាមើលទៅ គ្មានពណ៌សន្ទស្សន៍។ ពពក និងអ័ព្ទនឹងបង្ហាញដូចដើម។',
}

export const INDICES = {
  ndvi: {
    name: 'NDVI', bands: ['B8', 'B4'], vis: NDVI_VIS, label: 'Vegetation',
    color: '#22c55e',
    full: 'Vegetation Health Index',
    fullKhm: 'សន្ទស្សន៍សុខភាពដំណាំ',
    explain: 'High values (green) mean dense, healthy vegetation. Low values (red) mean bare soil, water, or stressed crops.',
    explainKhm: 'តម្លៃខ្ពស់ (បៃតង) មានន័យថារុក្ខជាតិក្រាស់និងល្អ។ តម្លៃទាប (ក្រហម) ជាដីទទេ ទឹក ឬដំណាំប៉ះពាល់។',
  },
  ndwi: {
    name: 'NDWI', bands: ['B3', 'B8'], vis: NDWI_VIS, label: 'Water',
    color: '#3b82f6',
    full: 'Water Index',
    fullKhm: 'សន្ទស្សន៍ទឹក',
    explain: 'High values (blue) mean standing surface water, such as flooded paddies. Low values (brown) mean dry land with little or no water.',
    explainKhm: 'តម្លៃខ្ពស់ (ខៀវ) ជាផ្ទៃទឹកដូចជាស្រែជន់លិច។ តម្លៃទាប (ត្នោត) ជាដីស្ងួតដែលមិនសូវមានទឹក។',
  },
  lswi: {
    name: 'LSWI', bands: ['B8', 'B11'], vis: LSWI_VIS, label: 'Water/Moisture',
    color: '#0ea5e9',
    full: 'Land Surface Water Index',
    fullKhm: 'សន្ទស្សន៍ទឹកលើផ្ទៃដី',
    explain: 'High values (dark blue) mean moist soil and water-saturated plant canopies. Low values (tan) mean dry soil and dry vegetation.',
    explainKhm: 'តម្លៃខ្ពស់ (ខៀវចាស់) ជាដីមានសំណើម និងរុក្កជាតិដែលឆ្អែតដោយទឹក។ តម្លៃទាប (ត្នោតស្រាល) ជាដីនិងរុក្កជាតិស្ងួត។',
  },
  savi: {
    name: 'SAVI', bands: ['B8', 'B4'], vis: SAVI_VIS, label: 'Soil-Adjusted',
    color: '#84cc16',
    full: 'Soil-Adjusted Vegetation Index (L=0.5)',
    fullKhm: 'សន្ទស្សន៍រុក្ខជាតិកែតម្រូវដី (L=0.5)',
    explain: 'Accounts for bare-soil background brightness (L=0.5), so low-cover or early-season fields read more accurately than raw NDVI. Placeholder scale — tune the breakpoints.',
    explainKhm: 'គិតគូរពីពន្លឺដីទទេ (L=0.5) ដើម្បីឱ្យវាលដែលមានគម្របតិច ឬដំណាក់កាលដើមអានបានត្រឹមត្រូវជាង NDVI។ មាត្រដ្ឋានបណ្ដោះអាសន្ន — អាចកែតម្រូវបាន។',
  },
  evi: {
    name: 'EVI', bands: ['B8', 'B4', 'B2'], vis: EVI_VIS, label: 'Enhanced',
    color: '#f97316',
    full: 'Enhanced Vegetation Index (G=2.5, C1=6, C2=7.5, L=1)',
    fullKhm: 'សន្ទស្សន៍រុក្ខជាតិពង្រឹង (G=2.5, C1=6, C2=7.5, L=1)',
    explain: 'Less prone to saturation than NDVI, so it keeps discriminating between fields even at high biomass. The blue band corrects atmospheric and soil noise. Placeholder scale — tune the breakpoints.',
    explainKhm: 'ឆ្អែតយឺតជាង NDVI ដូច្នេះបន្តបែងចែកវាលបានសូម្បីតែពេលជីវម៉ាសខ្ពស់។ បទខៀវកែសំឡេងរំខានបរិយាកាស និងដី។ មាត្រដ្ឋានបណ្ដោះអាសន្ន — អាចកែតម្រូវបាន។',
  },
  gndvi: {
    name: 'GNDVI', bands: ['B8', 'B3'], vis: GNDVI_VIS, label: 'Green',
    color: '#22d3ee',
    full: 'Green Normalized Difference Vegetation Index',
    fullKhm: 'សន្ទស្សន៍ NDVI បៃតង',
    explain: 'Mirror of NDVI but using the green band (B3), which responds more to chlorophyll and canopy water content. Placeholder scale — tune the breakpoints.',
    explainKhm: 'ដូច NDVI ប៉ុន្តែប្រើបទបៃតង (B3) ដែលឆ្លើយតបខ្លាំងជាងនឹងក្លរ៉ូហ្វីល និងសំណើមក្នុងសំបកដំណាំ។ មាត្រដ្ឋានបណ្ដោះអាសន្ន — អាចកែតម្រូវបាន។',
  },
  rvi: {
    name: 'RVI', bands: ['VV', 'VH'], vis: RVI_VIS, label: 'Radar',
    color: '#a78bfa',
    full: 'Radar Vegetation Index (Sentinel-1)',
    fullKhm: 'សន្ទស្សន៍រុក្ខជាតិរ៉ាដា (Sentinel-1)',
    explain: 'Radar vegetation index from Sentinel-1 — works through clouds (RVI = 4·VH/(VV+VH)). A different measurement than optical NDVI: compare the shape and direction of the two trends over a date range, not absolute values.',
    explainKhm: 'សន្ទស្សន៍រុក្ខជាតិរ៉ាដាពី Sentinel-1 — មើលឃើញទោះមានពពក (RVI = 4·VH/(VV+VH))។ ជាការវាស់ដែលខុសពី NDVI អុបទិក៖ ប្រៀបធៀបរូបរាង និងទិសដៅនៃក្រាហ្វទាំងពីរលើជួរកាលបរិច្ឆេទដូចគ្នា មិនមែនតម្លៃដាច់ខាតទេ។',
  },
}

// Health Zone Breakdown — 10 pixel buckets per band family. NDVI spans -1..1
// (first bucket covers everything from -1 to 0.1); RVI (Sentinel-1 radar
// fallback) spans 0..2 (its formula is 4*VH/(VV+VH), realistically valued up to
// ~2), so its 10 buckets are 0.2 wide. Both arrays share the { lo, hi } shape
// consumed by getZoneBreakdown() in earthEngine.js and must stay in sync with
// ee-data's zoneBuckets().
export const NDVI_ZONE_BUCKETS = (() => {
  const arr = [{ lo: -1.0, hi: 0.1 }]
  for (let i = 1; i < 10; i++) arr.push({ lo: i * 0.1, hi: (i + 1) * 0.1 })
  return arr
})()

export const RVI_ZONE_BUCKETS = (() => {
  const max = RVI_VIS.max
  const step = max / 10
  const arr = []
  for (let i = 0; i < 10; i++) arr.push({ lo: i * step, hi: (i + 1) * step })
  return arr
})()

// Visual scale the Analysis-Scale bar renders along (0..1 for both band
// families — the app's rule-based thresholds all live in this range).
export const ZONE_SCALE = { min: 0, max: 1, step: 0.1 }

// Flat fallback thresholds (no growth stage available) — mirrors the
// buildStatusObject() fallback in store.js so the Good/Medium/Bad markers and
// the health badge can never disagree.
export const FLAT_THRESHOLDS = { bad: 0.3, good: 0.6 }

// Deficit below the growth stage's expected minimum that flips Medium -> Bad,
// kept in sync with store.js buildStatusObject() (deficit > 0.15 -> stressed).
export const STAGE_DEFICIT_BAD = 0.15

export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function buildMonths() {
  const months = []
  const d = new Date()
  for (let i = 13; i >= 0; i--) {
    const dt = new Date(d.getFullYear(), d.getMonth() - i, 1)
    months.push({ year: dt.getFullYear(), month: dt.getMonth() + 1, label: MONTH_NAMES[dt.getMonth()] + ' ' + dt.getFullYear() })
  }
  return months
}

export const MONTHS = buildMonths()

export const DEFAULT_PRESETS = [
  { label: 'Cement Factory', lat: 12.8715, lng: 103.0165, zoom: 15 },
  { label: 'Factory North', lat: 12.890, lng: 103.020, zoom: 14 },
  { label: 'Factory South', lat: 12.855, lng: 103.010, zoom: 14 },
]

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

export const EVENTS = [
  { year: 2025, month: 8, label: 'Flood', type: 'flood' },
  { year: 2025, month: 9, label: 'Flood', type: 'flood' },
  { year: 2026, month: 1, label: 'Dry spell', type: 'drought' },
  { year: 2026, month: 2, label: 'Dry spell', type: 'drought' },
  { year: 2026, month: 3, label: 'Dry spell', type: 'drought' },
]

export const EVENT_COLORS = { flood: '#3b82f6', drought: '#f59e0b' }

export const DRY_MONTH_THRESHOLD = 50

// Season/date-range presets for the demo date picker. Edit boundaries freely —
// each entry maps to start/end ISO dates (YYYY-MM-DD), except:
//   kind: 'current'  -> planting date (or last 30 days) to today, dynamic
//   kind: 'days'     -> N days back to today, dynamic
//   kind: 'fixed'    -> uses the explicit start/end below
export const SEASON_PRESETS = [
  { id: 'current', label: 'Current Season', kind: 'current' },
  { id: 'dry2526', label: 'Dry Season 2025-26', kind: 'custom', start: '2025-11-01', end: '2026-04-30' },
  { id: 'wet25', label: 'Wet Season 2025', kind: 'custom', start: '2025-06-01', end: '2025-10-31' },
  { id: 'last30', label: 'Last 30 days', kind: 'days', days: 30 },
]
export const CUSTOM_RANGE_ID = '__custom__'
