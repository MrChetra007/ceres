export const EE_PROJECT_ID = 'trim-array-479621-s8'
export const CLIENT_ID = '664594611570-ilb4bdotp585c63t5cil4d1gslhk3hfi.apps.googleusercontent.com'

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

export const INDICES = {
  ndvi: {
    name: 'NDVI', bands: ['B8', 'B4'], vis: NDVI_VIS, label: 'Vegetation',
    color: '#22c55e',
    full: 'Vegetation Health Index',
    explain: 'High values (green) mean dense, healthy vegetation. Low values (red) mean bare soil, water, or stressed crops.',
  },
  ndwi: {
    name: 'NDWI', bands: ['B3', 'B8'], vis: NDWI_VIS, label: 'Water',
    color: '#3b82f6',
    full: 'Water Index',
    explain: 'High values (blue) mean standing surface water, such as flooded paddies. Low values (brown) mean dry land with little or no water.',
  },
  lswi: {
    name: 'LSWI', bands: ['B8', 'B11'], vis: LSWI_VIS, label: 'Water/Moisture',
    color: '#0ea5e9',
    full: 'Land Surface Water Index',
    explain: 'High values (dark blue) mean moist soil and water-saturated plant canopies. Low values (tan) mean dry soil and dry vegetation.',
  },
}

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

export const EVENTS = [
  { year: 2025, month: 8, label: 'Flood', type: 'flood' },
  { year: 2025, month: 9, label: 'Flood', type: 'flood' },
  { year: 2026, month: 1, label: 'Dry spell', type: 'drought' },
  { year: 2026, month: 2, label: 'Dry spell', type: 'drought' },
  { year: 2026, month: 3, label: 'Dry spell', type: 'drought' },
]

export const EVENT_COLORS = { flood: '#3b82f6', drought: '#f59e0b' }

export const DRY_MONTH_THRESHOLD = 50
