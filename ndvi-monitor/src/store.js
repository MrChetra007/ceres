import { reactive, shallowRef } from 'vue'
import { area as turfArea } from '@turf/turf'
import { jsPDF } from 'jspdf'
import {
  MONTHS, DEFAULT_AOI, DEFAULT_PRESETS,
  RICE_GROWTH_STAGES, EVENTS, EVENT_COLORS, INDICES, TRUE_COLOR, MAP_CENTER, MAP_ZOOM,
  TELEGRAM_BOT_USERNAME, TELEGRAM_LINK_TTL_MS, SEASON_PRESETS,
} from './config'
import * as ee from './services/earthEngine'
import { loadTrueColor, rectGeometry, polygonGeometry, pointGeometry } from './services/earthEngine'
import {
  toKhmerDigits, stageName, statusLabel, futurePlantingText, noReadingText,
  observationCount, confReason, daySinceLabel,
} from './services/format'
import { sb } from './services/supabase'
import * as supabase from './services/supabase'

let _router = null
let _routerReady = null
function getRouter() {
  if (_router) return Promise.resolve(_router)
  if (!_routerReady) {
    _routerReady = import('./router/index.js').then((m) => { _router = m.default; return _router })
  }
  return _routerReady
}

// ---------------------------------------------------------------------------
// Idle-time deferral — pushes non-critical background work after the map load
// the user is actually waiting on (Earth Engine's JS client throttles calls).
// ---------------------------------------------------------------------------
function deferIdle(fn) {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(fn, { timeout: 3000 })
  else setTimeout(fn, 50)
}

// ---------------------------------------------------------------------------
// Leaflet map registry (non-reactive — Leaflet instances must not be proxied)
// ---------------------------------------------------------------------------
export const mapReg = {
  map: null,
  mapRight: null,
  baseLayer: null,
  baseLayerRight: null,
  ndviLayer: null,
  ndviLayerRight: null,
  aoiRectangle: null,
  drawnItems: null,
  drawControl: null,
  syncing: false,
}


// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------
export const state = reactive({
  eeReady: false,
  currentIndex: 'ndvi',
  // Default to the CURRENT month (not the last complete one): the
  // cloud-blocked/radar fallbacks handle a sparse early-month composite, and
  // users expect the freshest view after sign-in.
  mainMonth: Math.max(0, MONTHS.length - 1),
  rightMonth: Math.max(0, MONTHS.length - 5),
  compareMode: false,
  currentBase: 'satellite',
  trueColorDate: null,
  trueColorDateRight: null,
  trueColorScenes: [],
  trueColorScenesRight: [],
  latestView: null,
  latestViewLoading: false,
  currentFieldId: null,
  currentFieldName: null,
  lastClickPoint: null,
  chartData: null,
  // NDVI-anchored per-scene series for the current field/point. Populated only
  // from the optical (Sentinel-2) fetch path, never from the RVI path, so date
  // resolution that must stay band-independent (growth stage / day-since-
  // planting) keeps reading the SAME scene dates no matter which tab is active.
  ndviChartData: null,
  chartIndex: 'ndvi',
  chartSubtitle: '\u2014',
  infoPanelVisible: false,
  stressAlert: null,
  fields: [],
  supabaseUser: null,
  authOverlayVisible: true,
  helpVisible: false,
  presetEditorVisible: false,
  aoiEditorVisible: false,
  chartModalVisible: false,
  presets: [],
  dryMonthSet: new Set(),
  sceneCount: { main: 0, right: 0 },
  cloudBlock: { main: null, right: null },
  radarFallback: { main: null, right: null },
  observationsVisible: false,
  observationsLoading: false,
  observations: [],
  rangeStart: null,
  rangeEnd: null,
  rangePresetId: null,
  rangeMonths: [],
  rainfallMm: null,
  benchmarkValue: null,
  isDrawing: false,
  isAoiDraw: false,
  aoiDraftCoords: null,
  aoiPolygonDraft: null,
  aoiEditMode: false,
  aoiEditorCloseForDraw: false,
  aoiEditorEditId: null,
  editingFieldId: null,
  loading: false,
  statusState: 'idle',
  statusText: '',
  toasts: [],
  aoiCoords: DEFAULT_AOI.slice(),
  aois: [],
  selectedAoiId: null,
  telegramChatId: null,
  telegramModalVisible: false,
  telegramLinking: false,
  preferredLanguage: 'km',
  settingsVisible: false,
  // Current user's subscription/limits, loaded from profiles. Defaults mirror
  // the Free tier so limit checks work before the profile fetch resolves.
  subscription: {
    tier: 'free',
    status: 'active',
    source: 'none',
    renewsAt: null,
    maxAois: 1,
    maxHectares: 10,
    consultAiEnabled: false,
  },
  // Upgrade paywall modal. reason: 'aoi' | 'hectare' | 'ai'.
  paywall: { visible: false, reason: 'aoi' },
  // Placeholder checkout modal. null = closed, else 'individual' | 'coop'.
  checkoutTier: null,
  photosLightboxIndex: null,
  // Health Zone Breakdown panel (default closed). `view` tracks which band
  // family the breakdown describes: 'ndvi' | 'rvi' | 'other' (ndwi/lswi/truecolor
  // have no zone breakdown — the UI shows a note instead).
  healthZone: {
    visible: false,
    loading: false,
    view: 'ndvi',
    buckets: null,
    totalAreaSqm: 0,
    monthKey: '',
    err: null,
  },
  landingVisible: (() => {
    try { return !localStorage.getItem('ndvi_landing_done') } catch { return true }
  })(),
})

export const currentGeometry = shallowRef(null)
export const fieldStatus = reactive({})
export const fieldTrends = reactive({})
// Trend-chart cache for the currently open chart, keyed by
// subject ('field:<id>' or 'point:<lat>,<lng>') + index + date-range. Extends
// the same skip-on-hit pattern fetchHealthZone()/fetchObservations() already
// use: switching NDVI -> NDWI -> NDVI reuses the first result instead of
// re-running the ~14-image reduceRegion batch every toggle. Deliberately NOT
// fieldTrends (that one is NDVI+fields-only for dashboard sparklines).
const chartCache = new Map()
const CHART_CACHE_TTL_MS = 15 * 60 * 1000

// A field edit reshapes its geometry, so every cached series for that field
// (all indices, all ranges) describes the old boundary. Planting-date edits do
// NOT go through here — they only reinterpret values, they don't change them.
function invalidateChartCacheForField(fieldId) {
  if (!fieldId) return
  const prefix = 'field:' + fieldId + '|'
  for (const k of Array.from(chartCache.keys())) {
    if (k.startsWith(prefix)) chartCache.delete(k)
  }
}
export const datePicker = reactive({ visible: false, currentDate: null })
let infoChart = null
let loadingCount = 0
const toastTimers = new Map()
let pendingDateCallback = null
// Only surface the cloud-blocked toast ONCE per session (then rely on the
// persistent "☁️ cloud-blocked" pill + its tooltip). Prevents toast spam when
// the user scrubs across several cloud-heavy months.
let cloudToastShown = false

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getGeometry() {
  if (currentGeometry.value) return currentGeometry.value
  if (state.aoiPolygon && state.aoiPolygon.length >= 3) {
    return polygonGeometry([[...state.aoiPolygon, state.aoiPolygon[0]]])
  }
  return rectGeometry(state.aoiCoords)
}

export function setStatus(s, text) {
  state.statusState = s
  state.statusText = text
}

export function showToast(msg, duration = 3000) {
  const id = crypto.randomUUID()
  state.toasts.push({ id, msg })
  if (state.toasts.length > 3) {
    const dropped = state.toasts.shift()
    clearTimeout(toastTimers.get(dropped.id))
    toastTimers.delete(dropped.id)
  }
  toastTimers.set(
    id,
    setTimeout(() => {
      state.toasts = state.toasts.filter((t) => t.id !== id)
      toastTimers.delete(id)
    }, duration),
  )
}

// A request reached Supabase without a valid user JWT (stale/expired session).
export function isAuthError(err) {
  const msg = (err && err.message) || ''
  return /No active session|Session expired|Please sign in/.test(msg)
}

function handleAuthError(err) {
  if (isAuthError(err)) {
    state.authOverlayVisible = true
    showToast(err.message)
    return true
  }
  return false
}

function beginLoading() {
  loadingCount++
  state.loading = true
}
function endLoading() {
  loadingCount = Math.max(0, loadingCount - 1)
  if (loadingCount === 0) state.loading = false
}

export function setInfoChart(ch) { infoChart = ch }

export function getGrowthStage(daysSincePlanting) {
  for (let i = 0; i < RICE_GROWTH_STAGES.length; i++) {
    if (daysSincePlanting <= RICE_GROWTH_STAGES[i].maxDay) return RICE_GROWTH_STAGES[i]
  }
  return RICE_GROWTH_STAGES[RICE_GROWTH_STAGES.length - 1]
}

export function getFieldAreaHectares(geojson) {
  return turfArea(geojson) / 10000
}

export function formatHectares(ha, lang) {
  const isKm = (lang || state.preferredLanguage) === 'km'
  const txt = ha < 0.1 ? ha.toFixed(3) : ha.toFixed(1)
  if (isKm) return toKhmerDigits(txt) + ' ហិកតា'
  return txt + ' ha'
}

function getOrComputeArea(field) {
  if (typeof field.areaHectares === 'number') return field.areaHectares
  return getFieldAreaHectares(field.geojson)
}

function getAreaWarning(hectares, lang) {
  if (hectares > 50) {
    if (lang === 'km') return 'ធំខុសពីធម្មតាសម្រាប់វាលមួយ — សូមពិនិត្យរាងដែលបានគូស?'
    return 'Unusually large for one field \u2014 check the drawn shape?'
  }
  return null
}

export { getOrComputeArea, getAreaWarning }

export function escapeHtml(str) {
  const div = document.createElement('div')
  div.appendChild(document.createTextNode(str))
  return div.innerHTML
}

// ---------------------------------------------------------------------------
// AOI (Supabase-backed, per-user areas)
// ---------------------------------------------------------------------------
export function getAois() { return state.aois }

export function updateAoiRectangle() {
  if (!mapReg.map) return
  if (mapReg.aoiRectangle) mapReg.map.removeLayer(mapReg.aoiRectangle)
  mapReg.aoiRectangle = null
  if (state.aoiPolygon && state.aoiPolygon.length >= 3) {
    const ring = [...state.aoiPolygon, state.aoiPolygon[0]].map((p) => [p[1], p[0]])
    mapReg.aoiRectangle = window.L.polygon(ring, { color: '#ff4444', weight: 2, fill: false, dashArray: '4 4' }).addTo(mapReg.map)
    return
  }
  if (!state.aoiCoords) return
  mapReg.aoiRectangle = window.L.rectangle(
    [[state.aoiCoords[1], state.aoiCoords[0]], [state.aoiCoords[3], state.aoiCoords[2]]],
    { color: '#ff4444', weight: 2, fill: false, dashArray: '4 4' }
  ).addTo(mapReg.map)
}

function updateAoiViewport() {
  if (!mapReg.map) return
  if (state.aoiPolygon && state.aoiPolygon.length >= 3) {
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity
    for (const p of state.aoiPolygon) {
      if (p[1] < minLat) minLat = p[1]
      if (p[1] > maxLat) maxLat = p[1]
      if (p[0] < minLng) minLng = p[0]
      if (p[0] > maxLng) maxLng = p[0]
    }
    if (minLat !== Infinity) mapReg.map.fitBounds([[minLat, minLng], [maxLat, maxLng]], { padding: [40, 40] })
    return
  }
  mapReg.map.setView([(state.aoiCoords[1] + state.aoiCoords[3]) / 2, (state.aoiCoords[0] + state.aoiCoords[2]) / 2], 14)
}

export function clearAoiPolygon() {
  state.aoiPolygon = null
  updateAoiRectangle()
}

// A selected field clips rendering to its own polygon — the broad AOI
// rectangle should not linger as a visual overlay once a field is active.
function hideAoiRectangle() {
  if (mapReg.aoiRectangle) {
    if (mapReg.map) mapReg.map.removeLayer(mapReg.aoiRectangle)
    mapReg.aoiRectangle = null
  }
}

export function normalizeAoiBounds(bounds) {
  if (Array.isArray(bounds) && bounds.length === 4) return { rect: bounds.slice() }
  if (bounds && typeof bounds === 'object' && Array.isArray(bounds.polygon) && bounds.polygon.length >= 3) {
    return { polygon: bounds.polygon.map((p) => [p[0] * 1, p[1] * 1]) }
  }
  return { rect: DEFAULT_AOI.slice() }
}

export function applyAoiPolygon(points, label) {
  state.aoiPolygon = points && points.length >= 3 ? points.map((p) => [p[0] * 1, p[1] * 1]) : null
  state.aoiCoords = DEFAULT_AOI.slice()
  updateAoiRectangle()
  updateAoiViewport()
  setStatus('computing', 'Reloading NDVI for ' + (label || 'area') + '...')
  fetchDryMonths()
  loadIndexForMonth(state.mainMonth, null)
  if (state.compareMode) loadIndexForMonthRight(state.rightMonth)
}

function applyAoiBounds(bounds, label) {
  const norm = normalizeAoiBounds(bounds)
  if (norm.polygon) {
    applyAoiPolygon(norm.polygon, label)
    return
  }
  state.aoiCoords = norm.rect
  state.aoiPolygon = null
  updateAoiRectangle()
  updateAoiViewport()
  setStatus('computing', 'Reloading NDVI for ' + (label || 'area') + '...')
  fetchDryMonths()
  loadIndexForMonth(state.mainMonth, null)
  if (state.compareMode) loadIndexForMonthRight(state.rightMonth)
}

export function selectAoi(id) {
  const aoi = state.aois.find((a) => a.id === id)
  if (!aoi) return
  state.selectedAoiId = id
  applyAoiBounds(aoi.bounds, aoi.name)
}

export async function loadAoisFromSupabase() {
  if (!state.supabaseUser) {
    state.aois = []
    state.selectedAoiId = null
    state.aoiCoords = DEFAULT_AOI.slice()
    return
  }
  try {
    state.aois = await supabase.loadAois()
  } catch (err) {
    showToast('Failed to load areas: ' + err.message)
    return
  }
  if (state.aois.length === 0) {
    try {
      const def = await supabase.insertAoi({ name: 'Battambang (default)', bounds: DEFAULT_AOI.slice() })
      state.aois.push(def)
    } catch (err) {
      showToast('Failed to create default area: ' + err.message)
    }
  }
  const first = state.aois[0]
  if (first) {
    state.selectedAoiId = first.id
    applyAoiBounds(first.bounds, first.name)
  }
}

export function openAoiEditorEdit(id) {
  state.aoiEditorEditId = id || null
  state.aoiEditorVisible = true
}

export async function createAoi(name, bounds) {
  if (!state.supabaseUser) { showToast('Sign in to save areas'); return null }
  const maxAois = state.subscription.maxAois
  if (state.aois.length >= maxAois) { showPaywall('aoi'); return null }
  try {
    const aoi = await supabase.insertAoi({ name, bounds })
    state.aois.push(aoi)
    selectAoi(aoi.id)
    return aoi
  } catch (err) {
    if (handleAuthError(err)) return null
    // The enforce_aoi_limit DB trigger caught it server-side too — route that
    // to the friendly upgrade prompt instead of the raw Postgres error text.
    if (/AOI limit reached|limit|exceeded|maximum|violates|cap/i.test(err.message || '')) {
      showPaywall('aoi')
      return null
    }
    showToast('Failed to save area: ' + err.message)
    return null
  }
}

export async function updateAoi(id, patch) {
  if (!state.supabaseUser) { showToast('Sign in to update areas'); return false }
  try {
    await supabase.updateAoi(id, patch)
    const aoi = state.aois.find((a) => a.id === id)
    if (aoi) {
      if ('name' in patch) aoi.name = patch.name
      if ('bounds' in patch) aoi.bounds = patch.bounds
      if (id === state.selectedAoiId) applyAoiBounds(aoi.bounds, aoi.name)
    }
    return true
  } catch (err) {
    showToast('Failed to update area: ' + err.message)
    return false
  }
}

export async function deleteAoi(id) {
  if (!state.supabaseUser) { showToast('Sign in to manage areas'); return }
  try {
    await supabase.deleteAoi(id)
    state.aois = state.aois.filter((a) => a.id !== id)
    if (id === state.selectedAoiId) {
      state.selectedAoiId = null
      if (state.aois.length > 0) {
        selectAoi(state.aois[0].id)
      } else {
        state.aoiCoords = DEFAULT_AOI.slice()
        updateAoiRectangle()
        setStatus('computing', 'Reloading NDVI over the default area...')
        fetchDryMonths()
        loadIndexForMonth(state.mainMonth, null)
        if (state.compareMode) loadIndexForMonthRight(state.rightMonth)
      }
    }
  } catch (err) {
    showToast('Failed to delete area: ' + err.message)
  }
}

// ---------------------------------------------------------------------------
// AOI draw-on-map (define the area rectangle on the map instead of typing
// coordinates). Uses the same leaflet-draw toolbar so the UX matches field
// drawing, then drops the captured bounds back into the AoiEditor form.
// ---------------------------------------------------------------------------
export function startAoiDraw() {
  if (!mapReg.map || !window.L.Draw) { showToast('Map not ready'); return }
  if (state.isAoiDraw) {
    cancelAoiDraw()
    return
  }
  state.aoiEditorCloseForDraw = true
  state.aoiEditMode = true
  state.aoiEditorVisible = false
  state.aoiPolygonDraft = null
  state.aoiDraftCoords = null
  try {
    const draw = new window.L.Draw.Polygon(mapReg.map, {
      shapeOptions: { color: '#ff4444', weight: 2 },
      showArea: true,
      metric: ['ha'],
    })
    mapReg.activeDraw = draw
    state.isAoiDraw = true
    draw.enable()
    showToast('Click points on the map to draw the area \u2014 double-click to finish \u2014 Esc to cancel')
  } catch (e) {
    showToast('Drawing unavailable')
  }
}

export function cancelAoiDraw() {
  if (mapReg.activeDraw) {
    try { mapReg.activeDraw.disable() } catch (e) {}
    mapReg.activeDraw = null
  }
  state.isAoiDraw = false
  state.aoiEditMode = false
}

function layerGeomToPolygon(layer) {
  let ll = null
  try { ll = layer.getLatLngs() } catch (e) {}
  if (!ll) {
    try { ll = [layer.getLatLng()] } catch (e) {}
  }
  if (!ll) return null
  // leaflet-draw polygon: getLatLngs() returns a ring of LatLng (no holes).
  let ring = Array.isArray(ll) && Array.isArray(ll[0]) ? ll[0] : ll
  if (!Array.isArray(ring)) return null
  if (Array.isArray(ring[0]) && typeof ring[0][0] === 'number') ring = ring[0]
  return ring.map((p) => [p.lng, p.lat])
}

export function onAoiRectangleCreated(layer) {
  cancelAoiDraw()
  const pts = layerGeomToPolygon(layer)
  if (!pts || pts.length < 3) {
    showToast('Could not read the drawn area')
    return
  }
  // dedupe closing point
  const p0 = pts[0], pLast = pts[pts.length - 1]
  const ring = (Math.abs(p0[0] - pLast[0]) < 1e-9 && Math.abs(p0[1] - pLast[1]) < 1e-9) ? pts.slice(0, -1) : pts
  state.aoiPolygonDraft = ring
  state.aoiEditorVisible = true
  showToast('Drawn area captured \u2014 name it below to save')
}

// ---------------------------------------------------------------------------
// AOI polygon point editing — the AoiEditor lets the user drag vertices on the
// map (add / remove / move) instead of typing coordinate numbers. The working
// copy lives in `state.aoiPolygonDraft`, the on-map preview outline is drawn
// by the editor, NDVI re-fetches only when the user saves (Apply).
// ---------------------------------------------------------------------------
export function getAoiWorkingPolygon(id) {
  const editAoi = id ? state.aois.find((a) => a.id === id) : null
  if (state.aoiPolygonDraft && state.aoiPolygonDraft.length >= 3) return state.aoiPolygonDraft
  if (state.isAoiDraw) return null
  if (editAoi && editAoi.bounds) {
    const norm = normalizeAoiBounds(editAoi.bounds)
    if (norm.polygon) return norm.polygon
    const [w, s, e, n] = norm.rect
    return [[w, s], [e, s], [e, n], [w, n]]
  }
  return null
}

export function setAoiPolygonDraft(points) {
  state.aoiPolygonDraft = points && points.length >= 3 ? points.map((p) => [p[0] * 1, p[1] * 1]) : null
}

export function clearAoiPolygonDraft() {
  state.aoiPolygonDraft = null
}

export async function saveAoiPolygon(id, name, points) {
  if (!points || points.length < 3) { showToast('Area needs at least 3 points'); return false }
  const bounds = { polygon: points.map((p) => [p[0] * 1, p[1] * 1]) }
  if (id) {
    const ok = await updateAoi(id, { name: name || 'Untitled area', bounds })
    if (ok) state.aoiPolygonDraft = null
    return ok
  }
  const aoi = await createAoi(name || 'Untitled area', bounds)
  if (aoi) state.aoiPolygonDraft = null
  return !!aoi
}

// ---------------------------------------------------------------------------
// Telegram linking (Phase 8.3)
// ---------------------------------------------------------------------------
let telegramPollTimer = null

export async function loadTelegramChatId() {
  if (!state.supabaseUser) {
    state.telegramChatId = null
    return
  }
  try {
    const profile = await supabase.getMyProfile()
    state.telegramChatId = profile?.telegram_chat_id || null
    state.preferredLanguage = profile?.preferred_language || 'km'
  } catch (err) {
    state.telegramChatId = null
  }
}

export async function setLanguage(lang) {
  if (!state.supabaseUser) { showToast('Sign in to change language'); return false }
  try {
    await supabase.setPreferredLanguage(lang)
    state.preferredLanguage = lang
    showToast('Language set to ' + (lang === 'km' ? 'Khmer' : 'English'))
    return true
  } catch (err) {
    showToast('Failed to update language: ' + err.message)
    return false
  }
}

// ---------------------------------------------------------------------------
// Subscription / billing UI
// ---------------------------------------------------------------------------
const FREE_DEFAULTS = {
  tier: 'free',
  status: 'active',
  source: 'none',
  renewsAt: null,
  maxAois: 1,
  maxHectares: 10,
  consultAiEnabled: false,
}

export async function loadSubscription() {
  if (!state.supabaseUser) {
    Object.assign(state.subscription, FREE_DEFAULTS)
    return
  }
  try {
    const p = await supabase.getMyProfile()
    Object.assign(state.subscription, {
      tier: p.subscription_tier || 'free',
      status: p.subscription_status || 'active',
      source: p.subscription_source || 'none',
      renewsAt: p.subscription_renews_at || null,
      maxAois: p.max_aois != null ? p.max_aois : 1,
      maxHectares: p.max_hectares != null ? p.max_hectares : 10,
      consultAiEnabled: !!p.consult_ai_enabled,
    })
  } catch (err) {
    // Non-fatal — limits fall back to Free-tier defaults.
  }
}

// Total area of all saved fields in hectares — displayed as usage against
// max_hectares. UI-only for now: the backend does NOT enforce the hectare cap
// (see migrations/012_subscription_tiers.sql "NOT covered"). TODO(backend): enforce
// hectares server-side, then keep this display but stop blocking on it alone.
export function getTotalFieldHectares() {
  let total = 0
  for (const f of state.fields) total += getOrComputeArea(f)
  return total
}

// Hexagonal-reference number formatting for renewal/history dates.
export function formatDateLong(iso, lang) {
  if (!iso) return null
  const locale = (lang || state.preferredLanguage) === 'km' ? 'km-KH' : 'en-US'
  try {
    return new Intl.DateTimeFormat(locale, { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(iso))
  } catch (e) {
    return String(iso)
  }
}

export function showPaywall(reason) {
  state.paywall = { visible: true, reason: reason || 'aoi' }
}

export function hidePaywall() {
  state.paywall.visible = false
}

export function openPlanBillingModal() {
  if (!state.supabaseUser) { goToMap(); return }
  state.settingsVisible = true
  loadSubscription()
}

export function closePlanBillingModal() {
  state.settingsVisible = false
}

export function openCheckout(tier) {
  if (!state.supabaseUser) {
    // AuthOverlay only mounts on /map — route there, the router guard shows it.
    goToMap()
    return
  }
  state.checkoutTier = tier
}

export function closeCheckout() {
  state.checkoutTier = null
}

export async function cancelMySubscription() {
  await supabase.cancelSubscription()
  await loadSubscription()
}

function goToPricing() {
  getRouter().then((r) => r.push('/pricing'))
}

function goToMap() {
  getRouter().then((r) => r.push('/map'))
}

export { goToPricing, goToMap }

function generateLinkCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  const rand = new Uint32Array(1)
  for (let i = 0; i < 6; i++) {
    crypto.getRandomValues(rand)
    code += chars[rand[0] % chars.length]
  }
  return code
}

export function openTelegramModal() {
  state.telegramModalVisible = true
  loadTelegramChatId()
}

export function closeTelegramModal() {
  state.telegramModalVisible = false
  stopTelegramPolling()
}

export async function connectTelegram() {
  if (!state.supabaseUser) { showToast('Sign in to connect Telegram'); return null }
  const code = generateLinkCode()
  const expiresAt = new Date(Date.now() + TELEGRAM_LINK_TTL_MS).toISOString()
  try {
    await supabase.insertLinkCode(code, state.supabaseUser.id, expiresAt)
  } catch (err) {
    showToast('Failed to start linking: ' + err.message)
    return null
  }
  state.telegramLinking = true
  startTelegramPolling()
  return {
    code,
    link: 'https://t.me/' + TELEGRAM_BOT_USERNAME + '?start=' + code,
    expiresAt,
  }
}

function startTelegramPolling() {
  stopTelegramPolling()
  telegramPollTimer = setInterval(async () => {
    await loadTelegramChatId()
    if (state.telegramChatId) {
      stopTelegramPolling()
      state.telegramLinking = false
      showToast('Telegram linked \u2014 alerts will arrive there')
    }
  }, 3000)
}

export function stopTelegramPolling() {
  if (telegramPollTimer) {
    clearInterval(telegramPollTimer)
    telegramPollTimer = null
  }
}

export async function disconnectTelegram() {
  if (!state.supabaseUser) return
  try {
    await supabase.clearTelegramChatId()
    state.telegramChatId = null
    showToast('Telegram disconnected')
  } catch (err) {
    showToast('Failed to disconnect: ' + err.message)
  }
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------
export function loadPresets() {
  const saved = localStorage.getItem('ndvi_presets')
  state.presets = saved ? JSON.parse(saved) : DEFAULT_PRESETS.slice()
}
export function savePresets() {
  localStorage.setItem('ndvi_presets', JSON.stringify(state.presets))
}
loadPresets()

export function flyToPreset(preset) {
  mapReg.map.setView([preset.lat, preset.lng], preset.zoom || 14)
  setStatus('ready', 'Flying to ' + preset.label)
}

export function savePresetList(list) {
  state.presets = list
  savePresets()
}

export function resetPresets() {
  localStorage.removeItem('ndvi_presets')
  loadPresets()
}

// ---------------------------------------------------------------------------
// Basemap
// ---------------------------------------------------------------------------
export function setBaseLayer(type) {
  state.currentBase = type
  const url = type === 'satellite'
    ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
    : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
  const attr = type === 'satellite' ? 'Tiles &copy; Esri' : '&copy; OpenStreetMap contributors'
  if (!mapReg.map) return

  if (mapReg.baseLayer) mapReg.map.removeLayer(mapReg.baseLayer)
  mapReg.baseLayer = window.L.tileLayer(url, { attribution: attr, maxZoom: 19 }).addTo(mapReg.map)
  // Re-adding the base layer puts it last in the tile stacking order (on top of
  // the NDVI/NDWI/LSWI overlay). Bring any overlay back to the front so a
  // basemap switch never hides the rendered index for a selected field.
  if (mapReg.ndviLayer) mapReg.ndviLayer.bringToFront()
  mapReg.map.invalidateSize()

  if (mapReg.mapRight && mapReg.baseLayerRight) {
    mapReg.mapRight.removeLayer(mapReg.baseLayerRight)
    mapReg.baseLayerRight = window.L.tileLayer(url, { attribution: attr, maxZoom: 19 }).addTo(mapReg.mapRight)
    if (mapReg.ndviLayerRight) mapReg.ndviLayerRight.bringToFront()
    mapReg.mapRight.invalidateSize()
  }
}

// ---------------------------------------------------------------------------
// Index layers
// ---------------------------------------------------------------------------
export function updateSceneCount(count, isRight) {
  state.sceneCount[isRight ? 'right' : 'main'] = count
}

function applyTileLayer(map, layer, url, opacity) {
  if (layer) map.removeLayer(layer)
  return window.L.tileLayer(url, {
    attribution: 'Sentinel-2 / Google Earth Engine',
    opacity: opacity || 0.8,
    // Keep the index overlay above the basemap regardless of which layer was
    // added last (Leaflet paints same-pane tile layers by DOM order). A slider
    // change re-adds this layer, so a fixed lookup makes the index win.
    zIndex: 950,
  }).addTo(map)
}

// True Color photo layers are fully-opaque (a real photograph, not a
// semi-transparent index overlay) and must stay above the basemap.
function applyTrueColorLayer(map, layer, url) {
  if (layer) map.removeLayer(layer)
  const l = window.L.tileLayer(url, {
    attribution: 'Sentinel-2 / Google Earth Engine',
    opacity: 1,
    zIndex: 951,
  }).addTo(map)
  return l
}

export function loadIndexForMonth(idx, geometry, silent) {
  const m = MONTHS[idx]
  if (!m || !state.eeReady) return
  state.latestView = null
  state.latestViewLoading = false
  const cfg = INDICES[state.currentIndex]
  state.mainMonth = idx
  state.sceneCount.main = 0
  state.cloudBlock.main = null
  state.radarFallback.main = null
  beginLoading()
  const geom = geometry || getGeometry()
  if (state.currentIndex === 'truecolor') {
    loadTrueColor(m, geom, state.trueColorDate, (res) => {
      endLoading()
      state.sceneCount.main = res.count
      state.trueColorScenes = res.scenes || []
      if (res.mode === 'error') {
        if (mapReg.ndviLayer) { mapReg.map.removeLayer(mapReg.ndviLayer); mapReg.ndviLayer = null }
        showToast('Satellite request failed \u2014 ' + (res.err || 'please try again'))
        setStatus('error', 'Satellite request failed for ' + m.label)
        return
      }
      if (res.mode === 'no_data' || !res.url) {
        if (mapReg.ndviLayer) { mapReg.map.removeLayer(mapReg.ndviLayer); mapReg.ndviLayer = null }
        setStatus('error', 'No Sentinel-2 scenes yet for ' + m.label + ' \u2014 check back later in the month')
        return
      }
      // Remember which single scene is being displayed, so the picker
      // highlights it and re-selection keeps per-scene precision.
      state.trueColorDate = res.chosen ? res.chosen.date : null
      // Explicitly mark the view cloud-blocked when the picked scene is heavy
      // so the ☁️ badge stays visible — on true color the clouds themselves are
      // the demo signal for why that date is unreliable.
      if (res.chosen && res.chosen.cloudPct != null && res.chosen.cloudPct >= 40) {
        state.cloudBlock.main = { month: m.label, cloudPct: res.chosen.cloudPct, lastValidDate: res.chosen.date }
      }
      mapReg.ndviLayer = applyTrueColorLayer(mapReg.map, mapReg.ndviLayer, res.url)
      console.log(`[TrueColor @store] applied url=${String(res.url).slice(0, 90)}… (previous layer removed, new tile layer added)`)
      setStatus('ready', TRUE_COLOR.name + ' photo \u2014 ' + m.label + (state.trueColorDate ? ' \u00b7 ' + state.trueColorDate : ''))
    })
    return
  }
  ee.loadIndexTile(m, state.currentIndex, geom, (res) => {
    state.sceneCount.main = res.count
    if (res.mode === 'error') {
      endLoading()
      if (mapReg.ndviLayer) { mapReg.map.removeLayer(mapReg.ndviLayer); mapReg.ndviLayer = null }
      showToast('Satellite request failed \u2014 ' + (res.err || 'please try again'))
      setStatus('error', 'Satellite request failed for ' + m.label)
      return
    }
    if (res.mode === 'radar_fallback') {
      endLoading()
      if (res.url) mapReg.ndviLayer = applyTileLayer(mapReg.map, mapReg.ndviLayer, res.url, 1)
      else if (mapReg.ndviLayer) { mapReg.map.removeLayer(mapReg.ndviLayer); mapReg.ndviLayer = null }
      state.radarFallback.main = { month: m.label, indexUsed: res.indexUsed || 'RVI' }
      setStatus('ready', 'Radar view (RVI) for ' + m.label + ' \u2014 clouds blocked optical view')
      return
    }
    // Direct RVI band selection (Sentinel-1 radar) — the radar view IS the
    // requested index, so it is NOT a fallback: no cloud badge, no 'other'
    // health zone. Just apply the tile and report the radar scene count.
    if (res.mode === 'radar_index') {
      endLoading()
      if (res.url) mapReg.ndviLayer = applyTileLayer(mapReg.map, mapReg.ndviLayer, res.url, 1)
      else if (mapReg.ndviLayer) { mapReg.map.removeLayer(mapReg.ndviLayer); mapReg.ndviLayer = null }
      setStatus('ready', cfg.name + ' radar layer loaded \u2014 ' + m.label)
      return
    }
    if (res.mode === 'cloud_blocked') {
      endLoading()
      if (res.url) mapReg.ndviLayer = applyTileLayer(mapReg.map, mapReg.ndviLayer, res.url, 1)
      else if (mapReg.ndviLayer) { mapReg.map.removeLayer(mapReg.ndviLayer); mapReg.ndviLayer = null }

      // Distinguish "this month IS cloudy" from "this month has no capture yet,
      // showing an older clear one" — same res.mode, different real reason.
      const sameMonth = res.lastValidDate
        ? isSameMonth(res.lastValidDate, m)
        : true // no date at all — treat as the original cloudy case
      state.cloudBlock.main = {
        month: m.label,
        cloudPct: res.cloudPct,
        lastValidDate: res.lastValidDate,
        sameMonth,
      }
      if (!silent && !cloudToastShown) {
        cloudToastShown = true
        if (sameMonth) {
          const pctText = res.cloudPct != null ? Math.round(res.cloudPct) + '%' : 'high'
          const lastText = res.lastValidDate
            ? 'Last valid reading: ' + res.lastValidDate
            : 'No cloud-free imagery available in the last 90 days.'
          showToast('\u2601\uFE0F Cloud-covered on ' + m.label + ' (' + pctText + ' cloud) \u2014 showing true-color image. NDVI can\u2019t be reliably calculated. ' + lastText, 4000)
        } else {
          showToast('\ud83d\udcf7 No capture yet for ' + m.label + ' \u2014 showing the most recent available image (' + res.lastValidDate + ')', 4000)
        }
      }
      setStatus('ready', sameMonth
        ? 'Cloud-blocked ' + m.label + ' \u2014 true-color shown'
        : 'No capture yet for ' + m.label + ' \u2014 showing ' + res.lastValidDate)
      return
    }
    if (res.mode === 'no_data' || !res.url) {
      endLoading()
      if (mapReg.ndviLayer) { mapReg.map.removeLayer(mapReg.ndviLayer); mapReg.ndviLayer = null }
      setStatus('error', 'No cloud-free imagery yet for ' + m.label + ' \u2014 check back later in the month')
      return
    }
    mapReg.ndviLayer = applyTileLayer(mapReg.map, mapReg.ndviLayer, res.url)
    endLoading()
    setStatus('ready', cfg.name + ' layer loaded \u2014 ' + m.label)
  })
}

export function loadIndexForMonthRight(idx, silent) {
  const m = MONTHS[idx]
  if (!m || !state.eeReady || !mapReg.mapRight) return
  state.latestView = null
  state.latestViewLoading = false
  const cfg = INDICES[state.currentIndex]
  state.rightMonth = idx
  state.sceneCount.right = 0
  state.cloudBlock.right = null
  state.radarFallback.right = null
  beginLoading()
  const geom = getGeometry()
  if (state.currentIndex === 'truecolor') {
    loadTrueColor(m, geom, state.trueColorDateRight, (res) => {
      if (!mapReg.mapRight) { endLoading(); return }
      endLoading()
      state.sceneCount.right = res.count
      state.trueColorScenesRight = res.scenes || []
      if (res.mode === 'error') {
        if (mapReg.ndviLayerRight) { mapReg.mapRight.removeLayer(mapReg.ndviLayerRight); mapReg.ndviLayerRight = null }
        showToast('Satellite request failed \u2014 ' + (res.err || 'please try again'))
        return
      }
      if (res.mode === 'no_data' || !res.url) {
        if (mapReg.ndviLayerRight) { mapReg.mapRight.removeLayer(mapReg.ndviLayerRight); mapReg.ndviLayerRight = null }
        return
      }
      state.trueColorDateRight = res.chosen ? res.chosen.date : null
      if (res.chosen && res.chosen.cloudPct != null && res.chosen.cloudPct >= 40) {
        state.cloudBlock.right = { month: m.label, cloudPct: res.chosen.cloudPct, lastValidDate: res.chosen.date }
      }
      mapReg.ndviLayerRight = applyTrueColorLayer(mapReg.mapRight, mapReg.ndviLayerRight, res.url)
    })
    return
  }
  ee.loadIndexTile(m, state.currentIndex, geom, (res) => {
    if (!mapReg.mapRight) { endLoading(); return }
    state.sceneCount.right = res.count
    if (res.mode === 'error') {
      endLoading()
      if (mapReg.ndviLayerRight) { mapReg.mapRight.removeLayer(mapReg.ndviLayerRight); mapReg.ndviLayerRight = null }
      showToast('Satellite request failed \u2014 ' + (res.err || 'please try again'))
      return
    }
    if (res.mode === 'radar_fallback') {
      endLoading()
      if (res.url) mapReg.ndviLayerRight = applyTileLayer(mapReg.mapRight, mapReg.ndviLayerRight, res.url, 1)
      else if (mapReg.ndviLayerRight) { mapReg.mapRight.removeLayer(mapReg.ndviLayerRight); mapReg.ndviLayerRight = null }
      state.radarFallback.right = { month: m.label, indexUsed: res.indexUsed || 'RVI' }
      return
    }
    if (res.mode === 'radar_index') {
      endLoading()
      if (res.url) mapReg.ndviLayerRight = applyTileLayer(mapReg.mapRight, mapReg.ndviLayerRight, res.url, 1)
      else if (mapReg.ndviLayerRight) { mapReg.mapRight.removeLayer(mapReg.ndviLayerRight); mapReg.ndviLayerRight = null }
      return
    }
    if (res.mode === 'cloud_blocked') {
      endLoading()
      if (res.url) mapReg.ndviLayerRight = applyTileLayer(mapReg.mapRight, mapReg.ndviLayerRight, res.url, 1)
      else if (mapReg.ndviLayerRight) { mapReg.mapRight.removeLayer(mapReg.ndviLayerRight); mapReg.ndviLayerRight = null }
      const sameMonth = res.lastValidDate
        ? isSameMonth(res.lastValidDate, m)
        : true
      state.cloudBlock.right = {
        month: m.label,
        cloudPct: res.cloudPct,
        lastValidDate: res.lastValidDate,
        sameMonth,
      }
      if (!silent && !cloudToastShown) {
        cloudToastShown = true
        if (sameMonth) {
          showToast('\u2601\uFE0F Compare view cloud-covered on ' + m.label + ' \u2014 showing true-color image', 4000)
        } else {
          showToast('\ud83d\udcf7 Compare view \u2014 no capture yet for ' + m.label + ' \u2014 showing the most recent available image (' + res.lastValidDate + ')', 4000)
        }
      }
      return
    }
    if (res.mode === 'no_data' || !res.url) {
      endLoading()
      if (mapReg.ndviLayerRight) { mapReg.mapRight.removeLayer(mapReg.ndviLayerRight); mapReg.ndviLayerRight = null }
      return
    }
    mapReg.ndviLayerRight = applyTileLayer(mapReg.mapRight, mapReg.ndviLayerRight, res.url)
    endLoading()
  })
}

// "Today" quick-jump — snap the slider to the current real calendar date and
// run the EXACT SAME per-date pipeline as a manual scrub (loadIndexForMonth →
// loadIndexTile's cloud_blocked/radar/no_data branches, or loadTrueColor).
// `state.chartData` (per-scene series) and `asOfDate` (the scene-exact fix)
// then drive the hero/growth/stress surfaces with NO special-casing.
export function jumpToToday() {
  if (!state.eeReady) return
  const now = new Date()
  let idx = MONTHS.findIndex((m) => m.year === now.getFullYear() && m.month === now.getMonth() + 1)
  if (idx < 0) idx = MONTHS.length - 1 // current month always ends the window
  // If a date-range hides today's month, clear the range first so the full
  // (always-today-ending) MONTHS window is available again.
  if (state.rangeStart && state.rangeEnd) {
    const b = sliderBounds()
    if (idx < b.min || idx > b.max) {
      state.mainMonth = idx
      clearDateRange()
      return // clearDateRange already reloads the current month
    }
  }
  state.mainMonth = idx
  // True Color mode renders the scene the picker selected; today means "today",
  // so hand loadTrueColor the exact captures (nearest clean scene or the least
  // cloudy fallback that loadTrueColor already picks when no exact date exists).
  if (state.currentIndex === 'truecolor') state.trueColorDate = toISODate(now)
  loadIndexForMonth(idx, currentGeometry.value)
  if (state.compareMode) {
    state.rightMonth = idx
    if (state.currentIndex === 'truecolor') state.trueColorDateRight = toISODate(now)
    loadIndexForMonthRight(idx)
  }
}

// Part 8 follow-up — move the time slider to the month containing the last
// cloud-free reading, turning a cloud-obscured view into an actionable jump.
export function jumpToLastValidReading(side = 'main') {
  const block = state.cloudBlock[side]
  if (!block || !block.lastValidDate) return
  const d = new Date(block.lastValidDate)
  if (isNaN(d.getTime())) return
  let target = -1
  for (let i = 0; i < MONTHS.length; i++) {
    const start = new Date(MONTHS[i].year, MONTHS[i].month - 1, 1)
    const end = new Date(MONTHS[i].year, MONTHS[i].month, 1)
    if (d >= start && d < end) { target = i; break }
  }
  if (target < 0) return
  if (side === 'right') loadIndexForMonthRight(target)
  else loadIndexForMonth(target, currentGeometry.value)
}

// ---------------------------------------------------------------------------
// Date-range scoping (demo presets) — filters ALL date-driven surfaces
// (slider bounds, observations, trend chart, map snap) by reusing the existing
// month-index / EE-filter machinery. No parallel data path.
// ---------------------------------------------------------------------------
export function toISODate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return y + '-' + m + '-' + dd
}

function isSameMonth(dateStr, m) {
  const d = new Date(dateStr)
  return d.getFullYear() === m.year && d.getMonth() + 1 === m.month
}

function monthWindow(m) {
  const start = new Date(m.year, m.month - 1, 1)
  const end = new Date(m.year, m.month, 1)
  return { start, end }
}

function monthOverlaps(m, startTime, endTime) {
  const w = monthWindow(m)
  return w.start.getTime() <= endTime && w.end.getTime() - 1 >= startTime
}

export function rangeStartMs() {
  return state.rangeStart ? new Date(state.rangeStart + 'T00:00:00').getTime() : 0
}
export function rangeEndMs() {
  return state.rangeEnd ? new Date(state.rangeEnd + 'T23:59:59').getTime() : Infinity
}

// The month list every date-driven query uses. When a range is active this is
// the filtered subset; otherwise the full rolling MONTHS window — so callers
// don't need their own branching. (Calendar-placeholder vs range comparisons
// are all done in ms against the actual month starts, which is what the EE
// trend-family functions already key off.)
export function activeMonths() {
  if (state.rangeStart && state.rangeEnd && state.rangeMonths.length) return state.rangeMonths
  return MONTHS
}

export function sliderBounds() {
  const months = state.rangeMonths.length ? state.rangeMonths : MONTHS
  const min = MONTHS.indexOf(months[0])
  const max = MONTHS.indexOf(months[months.length - 1])
  return { min: min >= 0 ? min : 0, max: max >= 0 ? max : MONTHS.length - 1 }
}

function applyMainMonthToRange() {
  if (state.rangeStart && state.rangeEnd) {
    const b = sliderBounds()
    if (state.mainMonth < b.min) state.mainMonth = b.min
    if (state.mainMonth > b.max) state.mainMonth = b.max
  }
}

function reloadChartForActiveRange() {
  if (!state.eeReady) return
  if (state.currentFieldId && currentGeometry.value) {
    loadChartForGeometry(currentGeometry.value, state.currentIndex, state.currentFieldName)
    if (state.compareMode) loadIndexForMonthRight(state.rightMonth)
  } else {
    reloadChartForIndex()
  }
}

// Applies a persisted/selected range to all scoped views. startISO/endISO are
// 'YYYY-MM-DD', presetId is optional for URL/bookmark labelling.
export function applyDateRange(startISO, endISO, presetId) {
  const startValid = startISO && !isNaN(new Date(startISO + 'T00:00:00'))
  const endValid = endISO && !isNaN(new Date(endISO + 'T23:59:59'))
  if (!startValid && !endValid) { clearDateRange(); return }
  state.rangeStart = startValid ? startISO : null
  state.rangeEnd = endValid ? endISO : null
  state.rangePresetId = presetId || null
  state.rangeMonths = MONTHS.filter((m) => monthOverlaps(m, rangeStartMs(), rangeEndMs()))
  applyMainMonthToRange()
  syncRangeUrl()
  if (state.eeReady) {
    loadIndexForMonth(state.mainMonth, currentGeometry.value || null)
    if (state.compareMode) loadIndexForMonthRight(state.rightMonth)
    fetchDryMonths()
    refreshAllFieldStatuses()
    refreshAllFieldTrends()
    reloadChartForActiveRange()
    if (state.currentFieldId) fetchObservations() // scoped to range
  }
}

export function clearDateRange() {
  state.rangeStart = null
  state.rangeEnd = null
  state.rangePresetId = null
  state.rangeMonths = []
  syncRangeUrl()
  if (state.eeReady) {
    loadIndexForMonth(state.mainMonth, currentGeometry.value || null)
    if (state.compareMode) loadIndexForMonthRight(state.rightMonth)
    fetchDryMonths()
    refreshAllFieldStatuses()
    refreshAllFieldTrends()
    reloadChartForActiveRange()
    if (state.currentFieldId) fetchObservations()
  }
}

export function setRangePreset(id) {
  const preset = SEASON_PRESETS.find((p) => p.id === id)
  if (!preset) return
  if (preset.kind === 'days') {
    const end = new Date()
    const start = new Date(end.getTime() - preset.days * 86400000)
    applyDateRange(toISODate(start), toISODate(end), id)
    return
  }
  if (preset.kind === 'current') {
    const f = state.fields.find((x) => x.id === state.currentFieldId)
    const begin = f && f.plantingDate ? new Date(f.plantingDate) : new Date(Date.now() - 30 * 86400000)
    if (begin.getTime() > Date.now()) begin.setTime(Date.now())
    applyDateRange(toISODate(begin), toISODate(new Date()), id)
    return
  }
  applyDateRange(preset.start, preset.end, id)
}

// URL sync: range is bookmarked as ?start=YYYY-MM-DD&end=YYYY-MM-DD.
function syncRangeUrl() {
  if (!history.replaceState) return
  const url = new URL(window.location.href)
  if (state.rangeStart && state.rangeEnd) {
    url.searchParams.set('start', state.rangeStart)
    url.searchParams.set('end', state.rangeEnd)
  } else {
    url.searchParams.delete('start')
    url.searchParams.delete('end')
  }
  window.history.replaceState({}, '', url.toString())
}

export function applyRangeFromUrl() {
  const url = new URL(window.location.href)
  const start = url.searchParams.get('start')
  const end = url.searchParams.get('end')
  applyDateRange(start, end, null)
}

let observationsFieldId = null
let observationsRangeKey = ''

export function fetchObservations() {
  const field = state.fields.find((f) => f.id === state.currentFieldId)
  if (!field) {
    state.observations = []
    observationsFieldId = null
    return
  }
  if (!state.eeReady) return
  const rangeKey = (state.rangeStart || '') + '|' + (state.rangeEnd || '')
  if (observationsFieldId === field.id && observationsRangeKey === rangeKey && state.observations.length) {
    return // already fetched for this field + range — no need to re-run the batch
  }
  const geom = field.geojson && (field.geojson.geometry || field.geojson)
  if (!geom || !geom.coordinates) {
    state.observations = []
    observationsFieldId = field.id
    observationsRangeKey = rangeKey
    return
  }
  state.observationsLoading = true
  const geometry = polygonGeometry(geom.coordinates)
  ee.getObservations(field.id, geometry, state.rangeStart, state.rangeEnd, (rows) => {
    state.observationsLoading = false
    state.observations = rows
    observationsFieldId = field.id
    observationsRangeKey = rangeKey
    // Console dump for inspection — every satellite pass found for this field.
    console.log(`[observations] ${rows.length} pass(es) for field "${field.name}" (${field.id}):`)
    console.table(rows.map((r) => ({
      date: r.date, source: r.source,
      cloudPct: r.cloudCover != null ? Number(r.cloudCover).toFixed(1) : '—',
      status: r.status,
      ndvi: r.ndvi != null ? Number(r.ndvi).toFixed(3) : '—',
    })))
  })
}

export function resetObservations() {
  observationsFieldId = null
  observationsRangeKey = ''
  state.observations = []
  state.observationsLoading = false
}

// Clicking an observation row loads that date via the SAME path the time slider
// uses — resolve the observation's month to a MONTHS index, set state.mainMonth,
// and call loadIndexForMonth(). No parallel change-detection code path.
export function jumpToObservationDate(dateStr) {
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return
  let target = -1
  for (let i = 0; i < MONTHS.length; i++) {
    const start = new Date(MONTHS[i].year, MONTHS[i].month - 1, 1)
    const end = new Date(MONTHS[i].year, MONTHS[i].month, 1)
    if (d >= start && d < end) { target = i; break }
  }
  if (target < 0) return
  state.mainMonth = target
  // True Color renders a single scene, not a monthly mosaic — use the exact
  // capture date clicked in the Observations panel rather than re-picking.
  if (state.currentIndex === 'truecolor') state.trueColorDate = dateStr
  // Mirror the time slider: render over the selected field, not the AOI rect.
  loadIndexForMonth(target, currentGeometry.value)
}

// ---------------------------------------------------------------------------
// Dry-month markers
// ---------------------------------------------------------------------------
export function fetchDryMonths() {
  if (!state.eeReady) return
  const geom = getGeometry()
  ee.getDryMonths(MONTHS, geom, (drySet) => {
    state.dryMonthSet = drySet
  })
}

// ---------------------------------------------------------------------------
// Health Zone Breakdown — bucket the current month's NDVI/RVI into 10 areas.
// Follows whatever the main map is showing: radar fallback (RVI) view uses RVI
// buckets; NDVI uses NDVI buckets; other indices have no breakdown. Deduped by
// a month|index|geometry key so scrubbing the slider doesn't re-fire the batch
// query for the same data.
// ---------------------------------------------------------------------------
export function fetchHealthZone(force) {
  if (!state.eeReady) return
  const geom = getGeometry()
  if (!geom) return
  const m = MONTHS[state.mainMonth]
  if (!m) return
  // Direct RVI band selection is a radar view too (server buckets RVI);
  // radar_fallback only fires the auto case when optical is cloud-blocked.
  const view = state.currentIndex === 'rvi' || state.radarFallback.main ? 'rvi' : state.currentIndex === 'ndvi' ? 'ndvi' : 'other'
  const key = state.mainMonth + '|' + view + '|' + (state.currentFieldId || 'aoi')
  if (!force && state.healthZone.monthKey === key) return
  if (view === 'other') {
    state.healthZone.view = 'other'
    state.healthZone.buckets = null
    state.healthZone.totalAreaSqm = 0
    state.healthZone.err = null
    state.healthZone.loading = false
    state.healthZone.monthKey = key
    return
  }
  state.healthZone.view = view
  state.healthZone.loading = true
  state.healthZone.err = null
  ee.getZoneBreakdown(geom, m, view, (res) => {
    state.healthZone.loading = false
    if (!res) {
      state.healthZone.buckets = null
      state.healthZone.totalAreaSqm = 0
      state.healthZone.err = 'nodata'
      state.healthZone.monthKey = key
      return
    }
    state.healthZone.buckets = res.buckets
    state.healthZone.totalAreaSqm = res.totalAreaSqm
    state.healthZone.monthKey = key
  })
}

// ---------------------------------------------------------------------------
// Trend chart data
// ---------------------------------------------------------------------------
function chartCacheKey(subjectKey, index, rangeKey) {
  return subjectKey + '|' + index + '|' + rangeKey
}

function activeRangeKey() {
  return (state.rangeStart || '') + '|' + (state.rangeEnd || '')
}

// What the count in the chart subtitle actually counts. NDVI/NDWI/LSWI all
// share ONE cloud-filtered, deduped Sentinel-2 series; RVI is an every-orbit
// (ascending + descending) Sentinel-1 series. Labeling them differently is
// honest — the two numbers are not the same kind of count.
function trendSource(index) {
  return index === 'rvi' ? 'Sentinel-1 passes' : 'Sentinel-2 scenes'
}

export function loadChartForPoint(lat, lng, index, onEmpty) {
  const cfg = INDICES[index] || TRUE_COLOR
  const key = chartCacheKey('point:' + lat.toFixed(4) + ',' + lng.toFixed(4), index, activeRangeKey())
  const cached = chartCache.get(key)
  if (cached && Date.now() - cached.fetchedAt < CHART_CACHE_TTL_MS) {
    state.chartData = cached.data
    state.chartIndex = index
    state.chartSubtitle = lat.toFixed(4) + ', ' + lng.toFixed(4) + ' \u00b7 ' + observationCount(state.preferredLanguage, cached.data.length, trendSource(index))
    // Anchor the band-independent date source (growth-stage day count) on the
    // optical series only — the RVI fetch path never touches it.
    if (index !== 'rvi') state.ndviChartData = cached.data
    checkStress(cached.data, lat, lng, index)
    setStatus('ready', cfg.name + ' trend loaded \u2014 ' + cached.data.length + ' observations')
    return
  }
  setStatus('computing', 'Fetching ' + cfg.name + ' trend...')
  const onPointTrend = (data) => {
    if (data.length === 0) {
      setStatus('error', 'No ' + cfg.name + ' data for this point')
      if (onEmpty) onEmpty()
      return
    }
    state.chartData = data
    state.chartIndex = index
    state.chartSubtitle = lat.toFixed(4) + ', ' + lng.toFixed(4) + ' \u00b7 ' + observationCount(state.preferredLanguage, data.length, trendSource(index))
    if (index !== 'rvi') state.ndviChartData = data
    chartCache.set(key, { data, subtitle: state.chartSubtitle, fetchedAt: Date.now() })
    checkStress(data, lat, lng, index)
    setStatus('ready', cfg.name + ' trend loaded \u2014 ' + data.length + ' observations')
  }
  // RVI is radar (Sentinel-1), not optical: it has no cloud dedupe and keeps
  // both same-day passes (ascending + descending) so the orbit shape shows.
  if (index === 'rvi') ee.getRviTimeSeries(lat, lng, activeMonths(), onPointTrend)
  else ee.getIndexTimeSeries(lat, lng, index, activeMonths(), onPointTrend)
}

export function loadChartForGeometry(geometry, index, label) {
  const cfg = INDICES[index] || TRUE_COLOR
  // Every caller of this function has a field loaded (setIndex /
  // reloadChartForActiveRange / loadField all gate on currentFieldId), so the
  // field id is the stable subject key; label alone could drift on rename.
  const subjectKey = state.currentFieldId ? 'field:' + state.currentFieldId : 'geom:' + label
  const key = chartCacheKey(subjectKey, index, activeRangeKey())
  const cached = chartCache.get(key)
  if (cached && Date.now() - cached.fetchedAt < CHART_CACHE_TTL_MS) {
    state.chartData = cached.data
    state.chartIndex = index
    state.chartSubtitle = label + ' \u00b7 ' + observationCount(state.preferredLanguage, cached.data.length, trendSource(index))
    if (index !== 'rvi') state.ndviChartData = cached.data
    checkStress(cached.data, null, null, index)
    setStatus('ready', cfg.name + ' trend loaded \u2014 ' + cached.data.length + ' observations')
    return
  }
  setStatus('computing', 'Fetching ' + cfg.name + ' trend...')
  const onGeomTrend = (data) => {
    if (!data || data.length === 0) {
      setStatus('error', 'No ' + cfg.name + ' data for this area')
      return
    }
    state.chartData = data
    state.chartIndex = index
    state.chartSubtitle = label + ' \u00b7 ' + observationCount(state.preferredLanguage, data.length, trendSource(index))
    if (index !== 'rvi') state.ndviChartData = data
    chartCache.set(key, { data, subtitle: state.chartSubtitle, fetchedAt: Date.now() })
    checkStress(data, null, null, index)
    setStatus('ready', cfg.name + ' trend loaded \u2014 ' + data.length + ' observations')
  }
  if (index === 'rvi') ee.getRviTimeSeriesForGeometry(geometry, activeMonths(), onGeomTrend)
  else ee.getIndexTimeSeriesForGeometry(geometry, index, activeMonths(), onGeomTrend)
}

export function setIndex(index) {
  const wasRvi = state.currentIndex === 'rvi'
  state.currentIndex = index
  loadIndexForMonth(state.mainMonth, currentGeometry.value)
  if (state.compareMode) loadIndexForMonthRight(state.rightMonth)
  if (index === 'truecolor') return // photo mode — no index trend/status to refresh
  // RVI: radar can't score growth stages, and its absolute scale isn't
  // comparable to the NDVI-based area benchmark (y-axis 0..1) — hide both.
  if (index === 'rvi') {
    state.benchmarkValue = null
  } else {
    refreshAllFieldStatuses()
    if (wasRvi && state.benchmarkValue === null && currentGeometry.value) loadBenchmark(currentGeometry.value)
  }
  if (state.currentFieldId && currentGeometry.value) {
    loadChartForGeometry(currentGeometry.value, index, state.currentFieldName)
  } else {
    reloadChartForIndex()
  }
}

// "Latest Satellite View" — a standalone shortcut that renders the most recent
// Sentinel-2 pass over the current AOI as an un-masked True Color photo. It
// deliberately does NOT move the time slider: state.mainMonth, the per-scene
// picker (trueColorScenes/data dates) and the sidebar's slider-driven analysis
// all stay untouched. Only the map's overlay band and its True Color layer are
// switched, plus the status label naming the actual scene date + cloud%.
export function showLatestView() {
  if (!state.eeReady) {
    setStatus('error', 'Sign in to view the latest satellite pass')
    return
  }
  if (!currentGeometry.value && !state.aoiCoords) {
    setStatus('error', 'No field selected — pick a field to view its latest satellite image')
    return
  }
  state.currentIndex = 'truecolor'
  state.latestViewLoading = true
  beginLoading()
  ee.loadLatestTrueColor(getGeometry(), (res) => {
    state.latestViewLoading = false
    endLoading()
    if (!res || res.mode !== 'photo' || !res.url) {
      state.latestView = { noData: true, date: null, cloudPct: null }
      if (mapReg.ndviLayer) { mapReg.map.removeLayer(mapReg.ndviLayer); mapReg.ndviLayer = null }
      setStatus('error', 'No recent satellite pass available for this area — try again in a few days')
      return
    }
    state.latestView = { noData: false, date: res.date, cloudPct: res.cloudPct }
    mapReg.ndviLayer = applyTrueColorLayer(mapReg.map, mapReg.ndviLayer, res.url)
    const pct = res.cloudPct == null ? '—' : Math.round(res.cloudPct) + '%'
    setStatus('ready', 'Latest available: ' + (res.date || '?') + ' · ' + pct + ' cloud')
  })
}

// Pick a specific capture date for the True Color photo (per-scene precision).
// `side` is 'main' or 'right' to mirror the compare-mode split.
export function setTrueColorDate(date, side = 'main') {
  if (state.currentIndex !== 'truecolor') return
  if (side === 'right') {
    state.trueColorDateRight = date
    loadIndexForMonthRight(state.rightMonth)
  } else {
    state.trueColorDate = date
    loadIndexForMonth(state.mainMonth, currentGeometry.value)
  }
}

export function onMapClick(lat, lng) {
  if (state.aoiEditMode) return
  state.currentFieldName = null
  state.currentFieldId = null
  state.ndviChartData = null // new subject (point) — drop the previous anchor
  state.lastClickPoint = { lat, lng }
  state.chartSubtitle = lat.toFixed(4) + ', ' + lng.toFixed(4)
  state.infoPanelVisible = true
  if (!state.eeReady) {
    setStatus('error', 'Sign in to load ' + INDICES[state.currentIndex].name + ' trends')
    return
  }
  loadRainfall(pointGeometry(lng, lat))
  loadBenchmark()
  loadChartForPoint(lat, lng, state.currentIndex)
}

export function reloadChartForIndex() {
  if (!state.lastClickPoint || !state.infoPanelVisible) return
  const p = state.lastClickPoint
  loadChartForPoint(p.lat, p.lng, state.currentIndex)
}

export function checkStress(data, lat, lng, index) {
  index = index || 'ndvi'
  if (index !== 'ndvi') { state.stressAlert = null; return }
  if (data.length < 2) { state.stressAlert = null; return }
  const sorted = data.slice().sort((a, b) => a.date.localeCompare(b.date))
  const recent = sorted[sorted.length - 1]
  if (!recent || recent.value === null) { state.stressAlert = null; return }
  let earlier = null
  for (let i = sorted.length - 2; i >= 0; i--) {
    const d = sorted[i]
    if (d.value !== null) {
      const daysDiff = (new Date(recent.date) - new Date(d.date)) / 86400000
      if (daysDiff >= 14) { earlier = d; break }
    }
  }
  if (!earlier || !earlier.value) { state.stressAlert = null; return }
  const drop = ((earlier.value - recent.value) / earlier.value) * 100
  if (drop > 15) {
    const baseMsg = '\u26a0 Possible stress detected \u2014 NDVI dropped ' + drop.toFixed(0) + '% (' + earlier.date + ' \u2192 ' + recent.date + ')'
    state.stressAlert = baseMsg
    if (lat != null && lng != null) {
      const point = pointGeometry(lng, lat)
      ee.getRainfallMm(point, 21, (mm) => {
        if (mm == null) return
        const rainNote = mm < 10
          ? ' \u2014 only ' + mm.toFixed(0) + 'mm rain in that period, drought stress is plausible'
          : ' \u2014 ' + mm.toFixed(0) + 'mm rain in that period, so low rainfall likely isn\'t the cause'
        state.stressAlert = baseMsg + rainNote
      })
    }
  } else {
    state.stressAlert = null
  }
}

export function getStageAtDate(date) {
  if (!state.currentFieldId || state.currentIndex !== 'ndvi') return null
  const field = state.fields.find((f) => f.id === state.currentFieldId)
  if (!field || !field.plantingDate) return null
  const days = Math.floor((new Date(date) - new Date(field.plantingDate)) / 86400000)
  if (days < 0) return null
  const stage = getGrowthStage(days)
  return stage.stage + ' (Day ' + days + ')'
}

// ---------------------------------------------------------------------------
// Auth (Supabase Google OAuth only)
// ---------------------------------------------------------------------------
// Earth Engine no longer has its own login: all satellite computation runs
// server-side in the `ee-data` Edge Function with a service account, so
// `state.eeReady` now simply means "signed in to Supabase" — the single gate
// that unlocks NDVI/map loads.
export function beginSessionWork() {
  state.eeReady = true
  state.authOverlayVisible = false
  if (mapReg.map) {
    mapReg.map.invalidateSize()
    mapReg.map.setView([(state.aoiCoords[1] + state.aoiCoords[3]) / 2, (state.aoiCoords[0] + state.aoiCoords[2]) / 2], MAP_ZOOM)
    updateDrawEditVisibility()
    // User-visible map load first — the thing everyone is waiting on.
    setStatus('computing', 'Computing NDVI...')
    loadIndexForMonth(state.mainMonth, null)
    // Defer the secondary background work (dry-month markers, field statuses,
    // field trends) so it doesn't compete with the map load. Runs after the
    // current work at idle time.
    deferIdle(() => {
      fetchDryMonths()
      refreshAllFieldStatuses()
      refreshAllFieldTrends()
    })
  } else if (state.eeReady) {
    // Map not mounted yet (e.g. user signed in from landing page before
    // router navigated to /map). Retry once the map component creates it.
    let tries = 0
    const wait = () => {
      if (mapReg.map || ++tries > 50) {
        if (mapReg.map) beginSessionWork()
        return
      }
      setTimeout(wait, 200)
    }
    wait()
  }
}

export function endSessionWork() {
  state.eeReady = false
}

export function showAuthOverlay() {
  state.authOverlayVisible = true
}

export function hideAuthOverlay() {
  state.authOverlayVisible = false
}

export function dismissLanding() {
  state.landingVisible = false
  try { localStorage.setItem('ndvi_landing_done', '1') } catch {}
}

export async function signInWithSupabaseGoogle() {
  return supabase.signInWithGoogle()
}

// Email/password auth (Phase: add-email-password-auth). Both wrap the same
// supabase-js calls used by Google auth — the existing `onAuthStateChange`
// listener picks up the resulting session (SIGNED_IN) and loads fields/AOIs.
// Returns { error } on failure so the auth overlay can render it inline.
export async function signInWithEmailPassword(email, password) {
  try {
    const { error } = await supabase.signInWithEmailPassword(email, password)
    if (error) return { error }
    return {}
  } catch (err) {
    return { error: err }
  }
}

export async function signUpWithEmail(email, password) {
  try {
    const { error } = await supabase.signUpWithEmail(email, password)
    if (error) return { error }
    return {}
  } catch (err) {
    return { error: err }
  }
}

export async function signOut() {
  await supabase.signOut()
  state.landingVisible = true
  try { localStorage.removeItem('ndvi_landing_done') } catch {}
  getRouter().then((r) => {
    if (r.currentRoute.value.path !== '/') r.push('/')
  })
}

// Last user id whose fields/AOIs were loaded from Supabase. Guards against
// re-loading on `SIGNED_IN` events fired by supabase-js when it recovers an
// already-known session on every tab focus (visibilitychange), which would
// otherwise re-run `loadAoisFromSupabase()` -> `applyAoiBounds()` and re-compute
// the NDVI map ("Reloading NDVI for ...") each time the user returns to the tab.
let lastLoadedUserId = null

sb.auth.onAuthStateChange((event, session) => {
  const user = session ? session.user : null
  state.supabaseUser = user
  if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
    if (user && user.id !== lastLoadedUserId) {
      lastLoadedUserId = user.id
      state.authOverlayVisible = false
      state.landingVisible = false
      getRouter().then((r) => {
        if (r.currentRoute.value.path !== '/map') r.push('/map')
      })
      beginSessionWork()
      loadFieldsFromSupabase()
      loadAoisFromSupabase()
      loadTelegramChatId()
      loadSubscription()
      if (localStorage.getItem('ndvi_fields') && !localStorage.getItem('ndvi_import_skipped')) {
        importLocalFieldsIfAny()
      }
    }
  } else if (event === 'TOKEN_REFRESHED') {
    // JWT refreshed (supabase-js does this periodically and after any auth
    // state change). The session is still the SAME user — nothing was cleared
    // — but if tier/plan were embedded in token claims and a plan switch
    // triggered a refresh, re-read the plan-sensitive state here. We DO NOT
    // re-fetch fields/AOIs on every token refresh (that would re-run the NDVI
    // map computation on every ~hourly refresh); the authoritative field/AOI
    // reload happens right after a plan switch completes (see
    // CheckoutModal.watchPayment -> approved path).
    if (user) loadSubscription()
  } else if (event === 'SIGNED_OUT') {
    lastLoadedUserId = null
    endSessionWork()
    state.fields = []
    state.aois = []
    state.selectedAoiId = null
    state.aoiCoords = DEFAULT_AOI.slice()
    state.telegramChatId = null
    state.telegramLinking = false
    Object.assign(state.subscription, FREE_DEFAULTS)
    state.settingsVisible = false
    state.checkoutTier = null
    state.paywall.visible = false
    stopTelegramPolling()
    if (mapReg.aoiRectangle) {
      if (mapReg.map) mapReg.map.removeLayer(mapReg.aoiRectangle)
      mapReg.aoiRectangle = null
    }
    state.authOverlayVisible = false
    state.landingVisible = true
    getRouter().then((r) => {
      if (r.currentRoute.value.path !== '/') r.push('/')
    })
  }
})

// ---------------------------------------------------------------------------
// Fields (Supabase-backed)
// ---------------------------------------------------------------------------
export function getSavedFields() { return state.fields }

export async function loadFieldsFromSupabase() {
  if (!state.supabaseUser) { state.fields = []; return }
  try {
    state.fields = await supabase.loadFields()
    refreshAllFieldStatuses()
    refreshAllFieldTrends()
  } catch (err) {
    showToast('Failed to load fields: ' + err.message)
  }
}

export async function importLocalFieldsIfAny() {
  if (!state.supabaseUser) return
  const legacy = localStorage.getItem('ndvi_fields')
  if (!legacy) return
  let legacyFields
  try { legacyFields = JSON.parse(legacy) } catch (e) { return }
  if (!legacyFields || legacyFields.length === 0) return
  const confirmed = window.confirm(
    legacyFields.length + ' field(s) are still saved in this browser. Upload them to your account?'
  )
  if (!confirmed) { localStorage.setItem('ndvi_import_skipped', '1'); return }
  localStorage.removeItem('ndvi_import_skipped')
  for (let i = 0; i < legacyFields.length; i++) {
    const f = legacyFields[i]
    try {
      await supabase.insertField({
        name: f.name,
        geojson: f.geojson,
        area_ha: f.areaHectares != null ? f.areaHectares : getFieldAreaHectares(f.geojson),
        planting_date: f.plantingDate || null,
      })
    } catch (err) {
      if (handleAuthError(err)) return
      showToast('Import failed for "' + f.name + '": ' + err.message)
      return
    }
  }
  localStorage.removeItem('ndvi_fields')
  showToast('Imported ' + legacyFields.length + ' field(s) to your account')
  loadFieldsFromSupabase()
}

export async function saveField(name, geojson, plantingDate) {
  if (!state.supabaseUser) { showToast('Sign in to save fields'); return null }
  const area = getFieldAreaHectares(geojson)
  // UI-only hectare cap (TODO(backend): enforce server-side too — see
  // migrations/012_subscription_tiers.sql "NOT covered"). Blocks right after the field is
  // drawn, but is NOT a real server-side limit yet.
  if (getTotalFieldHectares() + area > state.subscription.maxHectares) {
    showPaywall('hectare')
    return null
  }
  let planting_date = plantingDate || null
  let planting_date_source = 'manual'
  // Feature 3 — if the farmer didn't enter a planting date, try to estimate one
  // from the LSWI transplant spike. Never overwrites a manual entry.
  if (!planting_date && state.eeReady) {
    const geom = geojson && (geojson.geometry || geojson)
    if (geom && geom.coordinates) {
      const geometry = polygonGeometry(geom.coordinates)
      const detected = await new Promise((resolve) => ee.detectPlantingDate(geometry, resolve))
      if (detected && detected.estimatedDate) {
        planting_date = detected.estimatedDate
        planting_date_source = 'estimated'
      }
    }
  }
  try {
    const field = await supabase.insertField({
      name,
      geojson,
      area_ha: area,
      planting_date,
      planting_date_source,
    })
    state.fields.push(field)
    if (planting_date_source === 'estimated' && planting_date) {
      showToast('Estimated planting date from satellite data \u2014 tap to adjust', 4000)
    }
    loadFieldTrend(field)
    return field
  } catch (err) {
    if (handleAuthError(err)) return null
    showToast('Failed to save field: ' + err.message)
    return null
  }
}

export async function updateField(id, patch) {
  if (!state.supabaseUser) { showToast('Sign in to update fields'); return }
  try {
    await supabase.updateField(id, patch)
    const idx = state.fields.findIndex((f) => f.id === id)
    if (idx >= 0) {
      if ('geojson' in patch) state.fields[idx].geojson = patch.geojson
      if ('area_ha' in patch) state.fields[idx].areaHectares = patch.area_ha
      if ('planting_date' in patch) state.fields[idx].plantingDate = patch.planting_date
      if ('planting_date_source' in patch) state.fields[idx].plantingDateSource = patch.planting_date_source
      if ('name' in patch) state.fields[idx].name = patch.name
    }
  } catch (err) {
    showToast('Failed to update field: ' + err.message)
  }
}

export async function deleteField(id) {
  if (!state.supabaseUser) { showToast('Sign in to manage fields'); return }
  try {
    await supabase.deleteField(id)
    state.fields = state.fields.filter((f) => f.id !== id)
    if (id === state.currentFieldId) clearFieldSelection()
  } catch (err) {
    showToast('Failed to delete field: ' + err.message)
  }
}

// Shared by loadField's bundled callback — applies a getIndexTile-shaped
// result to the MAIN map layer + related state. Mirrors the mode-branching
// in loadIndexForMonth's ee.loadIndexTile callback (which keeps its own copy
// for the toast-on-first-cloud-block behavior; loadIndexForMonthRight keeps
// its own duplicate for the right/compare panel).
function applyTileResult(res, m) {
  state.sceneCount.main = res.count
  if (res.mode === 'error') {
    if (mapReg.ndviLayer) { mapReg.map.removeLayer(mapReg.ndviLayer); mapReg.ndviLayer = null }
    showToast('Satellite request failed \u2014 ' + (res.err || 'please try again'))
    setStatus('error', 'Satellite request failed for ' + m.label)
    return
  }
  if (res.mode === 'radar_fallback') {
    if (res.url) mapReg.ndviLayer = applyTileLayer(mapReg.map, mapReg.ndviLayer, res.url, 1)
    else if (mapReg.ndviLayer) { mapReg.map.removeLayer(mapReg.ndviLayer); mapReg.ndviLayer = null }
    state.radarFallback.main = { month: m.label, indexUsed: res.indexUsed || 'RVI' }
    setStatus('ready', 'Radar view (RVI) for ' + m.label + ' \u2014 clouds blocked optical view')
    return
  }
  if (res.mode === 'radar_index') {
    if (res.url) mapReg.ndviLayer = applyTileLayer(mapReg.map, mapReg.ndviLayer, res.url, 1)
    else if (mapReg.ndviLayer) { mapReg.map.removeLayer(mapReg.ndviLayer); mapReg.ndviLayer = null }
    setStatus('ready', (INDICES[state.currentIndex]?.name || 'RVI') + ' radar layer loaded \u2014 ' + m.label)
    return
  }
  if (res.mode === 'cloud_blocked') {
    if (res.url) mapReg.ndviLayer = applyTileLayer(mapReg.map, mapReg.ndviLayer, res.url, 1)
    else if (mapReg.ndviLayer) { mapReg.map.removeLayer(mapReg.ndviLayer); mapReg.ndviLayer = null }
    const sameMonth = res.lastValidDate ? isSameMonth(res.lastValidDate, m) : true
    state.cloudBlock.main = { month: m.label, cloudPct: res.cloudPct, lastValidDate: res.lastValidDate, sameMonth }
    setStatus('ready', sameMonth ? 'Cloud-blocked ' + m.label + ' \u2014 true-color shown' : 'No capture yet for ' + m.label + ' \u2014 showing ' + res.lastValidDate)
    return
  }
  if (res.mode === 'no_data' || !res.url) {
    if (mapReg.ndviLayer) { mapReg.map.removeLayer(mapReg.ndviLayer); mapReg.ndviLayer = null }
    setStatus('error', 'No cloud-free imagery yet for ' + m.label + ' \u2014 check back later in the month')
    return
  }
  mapReg.ndviLayer = applyTileLayer(mapReg.map, mapReg.ndviLayer, res.url)
  setStatus('ready', (INDICES[state.currentIndex]?.name || 'Index') + ' layer loaded \u2014 ' + m.label)
}

export function loadField(field) {
  state.currentFieldName = field.name
  state.currentFieldId = field.id
  state.ndviChartData = null // new subject — the old field's anchor no longer applies
  mapReg.drawnItems.clearLayers()
  const geo = window.L.geoJSON(field.geojson)
  geo.eachLayer((l) => {
    l.on('click', () => {
      if (state.currentFieldId !== field.id) loadField(field)
      else state.infoPanelVisible = true
    })
    mapReg.drawnItems.addLayer(l)
  })
  applyFieldStyle()
  updateDrawEditVisibility()
  mapReg.map.fitBounds(geo.getBounds(), { maxZoom: 18, padding: [40, 40] })

  const geom = field.geojson && (field.geojson.geometry || field.geojson)
  if (!geom || !geom.coordinates) {
    setStatus('error', 'Field has invalid geometry')
    return
  }
  currentGeometry.value = polygonGeometry(geom.coordinates)
  hideAoiRectangle()
  state.infoPanelVisible = true
  // Surface the observations day-strip automatically: selecting a field is
  // what makes the slider's blue observation bands appear, and this strip is
  // what explains them. Deselecting does NOT force it closed — the user's
  // last manual toggle wins there.
  state.observationsVisible = true
  state.chartSubtitle = field.name

  // Compare mode's right-panel tile still needs its own request (different
  // month) — that one stays as-is, it wasn't part of the burst.
  if (state.compareMode) loadIndexForMonthRight(state.rightMonth)

  if (!state.eeReady) return
  const m = MONTHS[state.mainMonth]
  if (!m) return

  // Mirror the state resets loadIndexForMonth used to do up front — the
  // bundle path no longer goes through it, but the badges must not carry
  // stale month signals from a previous load.
  state.latestView = null
  state.latestViewLoading = false
  state.sceneCount.main = 0
  state.cloudBlock.main = null
  state.radarFallback.main = null

  beginLoading()
  setStatus('computing', 'Loading field data...')
  ee.getFieldBundle(
    currentGeometry.value,
    m.year, m.month,
    activeMonths(),
    state.currentIndex,
    (res) => {
      endLoading()
      if (!res) {
        setStatus('error', 'Failed to load field data')
        return
      }

      // 1. Map tile — same handling as loadIndexForMonth's ee.loadIndexTile
      //    callback (shared applyTileResult applies it to the main map).
      applyTileResult(res.tile, m)

      // 2. Dashboard sparkline trend (always NDVI).
      fieldTrends[field.id] = res.ndviTrend

      // 3. Current-tab trend chart.
      const cfg = INDICES[state.currentIndex] || TRUE_COLOR
      state.chartData = res.chartTrend
      state.chartIndex = state.currentIndex
      state.chartSubtitle = field.name + ' \u00b7 ' + observationCount(state.preferredLanguage, res.chartTrend.length, trendSource(state.currentIndex))
      if (state.currentIndex !== 'rvi') state.ndviChartData = res.chartTrend
      checkStress(res.chartTrend, null, null, state.currentIndex)

      // 4. Rainfall + benchmark.
      state.rainfallMm = res.rainfall
      state.benchmarkValue = res.benchmark

      setStatus('ready', cfg.name + ' field data loaded')
    },
  )
}

export function loadFieldById(id) {
  const field = state.fields.find((f) => f.id === id)
  if (field) loadField(field)
}

// Edit a field's drawn boundary. Ensures the field is drawn on the map, then
// enables leaflet-draw's edit mode on the field polygon. The detail panel is
// hidden so the map toolbar is unobstructed while the user drags points.
export function startFieldEdit(field) {
  if (!mapReg.map || !mapReg.drawControl) { showToast('Map not ready'); return }
  if (!state.supabaseUser) { state.authOverlayVisible = true; showToast('Sign in to edit fields'); return }
  if (!field) return
  const needsLoad = state.currentFieldId !== field.id
  if (needsLoad) loadField(field)
  state.infoPanelVisible = false
  nativeActionsHidden = false
  state.editingFieldId = field.id
  const enableEdit = () => {
    try {
      // leaflet-draw 1.0.4 stores the edit toolbar as `_toolbars.edit`
      // (keyed by L.EditToolbar.TYPE), with the handler in `_modes.edit`.
      const tm = mapReg.drawControl._toolbars
      const editTb = tm && tm.edit
      const mode = editTb && editTb._modes && editTb._modes.edit
      if (mode && mode.handler && typeof mode.handler.enable === 'function') {
        mode.handler.enable()
        setTimeout(hideNativeEditActions, 0)
        return
      }
    } catch (e) {}
    const btn = document.querySelector('.leaflet-draw-edit-edit')
    if (btn) btn.click()
    setTimeout(hideNativeEditActions, 0)
  }
  if (needsLoad) requestAnimationFrame(enableEdit)
  else enableEdit()
}

// Resolves the leaflet-draw edit handler currently driving vertex dragging.
function editHandler() {
  try {
    const tm = mapReg.drawControl._toolbars
    const editTb = tm && tm.edit
    const mode = editTb && editTb._modes && editTb._modes.edit
    if (mode && mode.handler && typeof mode.handler.enable === 'function') return mode.handler
  } catch (e) {}
  return null
}

// Persists the reshaped boundary using the same leaflet-draw save path the
// native ribbon uses (fires `draw:edited` -> `onFieldEdited`), then exits
// editing. Called by the header "Save" button so the drawer never blocks it.
export function endFieldEdit() {
  const handler = editHandler()
  if (handler && typeof handler.save === 'function') {
    handler.save()
    if (typeof handler.disable === 'function') {
      try { handler.disable() } catch (e) {}
    }
    return
  }
  // Fallback: no active edit handler — just persist whatever is drawn now.
  onFieldEdited()
}

// Discards any vertex drags and leaves edit mode. The native leaflet-draw
// cancel path does exactly this — this is the header's twin of it.
export function cancelFieldEdit() {
  const handler = editHandler()
  if (handler && typeof handler.revertLayers === 'function') {
    try { handler.revertLayers() } catch (e) {}
  }
  if (handler && typeof handler.disable === 'function') {
    try { handler.disable() } catch (e) {}
  } else {
    try {
      const btn = document.querySelector('.leaflet-draw-edit-edit')
      if (btn) btn.click()
    } catch (e) {}
  }
  finishFieldEdit()
}

let nativeActionsHidden = false
function hideNativeEditActions() {
  if (nativeActionsHidden) return
  nativeActionsHidden = true
  document.querySelectorAll('.leaflet-draw-actions').forEach((ul) => {
    Array.from(ul.querySelectorAll('a')).forEach((a) => {
      if (a.title === 'Save changes' || a.title === 'Cancel editing, discards all changes') {
        a.style.display = 'none'
      }
    })
  })
}

// Shared cleanup after editing ends (save, cancel, or the native toolbar):
// stop advertising the header Save/Cancel and bring the detail panel back.
function finishFieldEdit() {
  state.editingFieldId = null
  updateDrawEditVisibility()
  if (state.currentFieldId) state.infoPanelVisible = true
}

export function clearFieldSelection() {
  state.currentFieldId = null
  state.currentFieldName = null
  state.editingFieldId = null
  currentGeometry.value = null
  state.rainfallMm = null
  state.infoPanelVisible = false
  mapReg.drawnItems.clearLayers()
  updateDrawEditVisibility()
  setBaseLayer(state.currentBase)
  updateAoiRectangle()
  loadIndexForMonth(state.mainMonth, null)
  if (state.compareMode) loadIndexForMonthRight(state.rightMonth)
  setStatus('ready', 'Field deselected \u2014 showing full AOI')
}

export function loadFieldTrend(field) {
  if (!state.eeReady || !field) return
  if (fieldTrends[field.id]) return
  const geom = field.geojson && (field.geojson.geometry || field.geojson)
  if (!geom || !geom.coordinates) return
  const geometry = polygonGeometry(geom.coordinates)
  ee.getIndexTimeSeriesForGeometry(geometry, 'ndvi', MONTHS, (data) => {
    fieldTrends[field.id] = data
  })
}

export function loadRainfall(geometry) {
  if (!state.eeReady || !geometry) { state.rainfallMm = null; return }
  ee.getRainfallMm(geometry, 21, (mm) => { state.rainfallMm = mm })
}

export function loadBenchmark(geometry) {
  if (!state.eeReady) { state.benchmarkValue = null; return }
  const geom = geometry || getGeometry()
  ee.getRecentIndexValue(geom, 'ndvi', ({ count, value }) => {
    state.benchmarkValue = value
  })
}

export function startDraw() {
  if (!mapReg.map || !window.L.Draw) { showToast('Map not ready'); return }
  if (mapReg.activeDraw) {
    cancelDraw()
    return
  }
  if (!state.supabaseUser) {
    state.authOverlayVisible = true
    showToast('Sign in to draw and save a field')
    return
  }
  try {
    const draw = new window.L.Draw.Polygon(mapReg.map, {
      shapeOptions: { color: '#22c98e', weight: 2 },
      showArea: true,
      metric: ['ha'],
    })
    mapReg.activeDraw = draw
    state.isDrawing = true
    draw.enable()
    showToast('Click to place points, then double-click to finish \u2014 Esc to cancel')
  } catch (e) {
    showToast('Drawing unavailable')
  }
}

export function cancelDraw() {
  if (mapReg.activeDraw) {
    try { mapReg.activeDraw.disable() } catch (e) {}
    mapReg.activeDraw = null
  }
  state.isDrawing = false
}



export function promptSaveField(geojson) {
  const name = window.prompt('Name this field (e.g. "North paddy \u2014 Svay Cheat"):')
  if (!name) {
    const layers = mapReg.drawnItems.getLayers()
    mapReg.drawnItems.removeLayer(layers[layers.length - 1])
    updateDrawEditVisibility()
    return
  }
  promptDate(null, (date) => {
    if (date === undefined) date = null
    saveField(name, geojson, date).then((saved) => { if (saved) loadField(saved) })
  })
}

export function promptDate(currentDate, onResult) {
  pendingDateCallback = onResult
  datePicker.visible = true
  datePicker.currentDate = currentDate || ''
}

export function submitDate(value) {
  datePicker.visible = false
  const cb = pendingDateCallback
  pendingDateCallback = null
  if (cb) cb(value || null)
}

export function cancelDate() {
  datePicker.visible = false
  const cb = pendingDateCallback
  pendingDateCallback = null
  if (cb) cb(undefined)
}

// ---------------------------------------------------------------------------
// Field status / dashboard
// ---------------------------------------------------------------------------
export function buildStatusObject(field, value, index, asOfDate) {
  const lang = state.preferredLanguage
  index = index || 'ndvi'
  if (index !== 'ndvi') {
    if (index === 'ndwi') {
      const cls = value > 0.3 ? 'water' : value > 0 ? 'moist' : 'dry'
      const lbl = value > 0.3 ? 'Water' : value > 0 ? 'Moist' : 'Dry'
      return { badgeClass: cls, badgeText: statusLabel(lang, lbl), stageLabel: 'NDWI ' + value.toFixed(2) }
    }
    if (index === 'lswi') {
      return { badgeClass: 'lswi', badgeText: 'LSWI', stageLabel: 'LSWI ' + value.toFixed(2) }
    }
    return { badgeClass: '', badgeText: '', stageLabel: '' }
  }
  if (!field.plantingDate) {
    let cls2, lbl2
    if (value > 0.6) { cls2 = 'healthy'; lbl2 = 'Healthy' }
    else if (value > 0.3) { cls2 = 'moderate'; lbl2 = 'Moderate' }
    else { cls2 = 'stressed'; lbl2 = 'Stressed' }
    return { badgeClass: cls2, badgeText: statusLabel(lang, lbl2), stageLabel: 'NDVI ' + value.toFixed(2) }
  }
  const asOf = asOfDate ? new Date(asOfDate).getTime() : Date.now()
  const daysSincePlanting = Math.floor((asOf - new Date(field.plantingDate).getTime()) / 86400000)
  if (daysSincePlanting < 0) {
    return { badgeClass: 'moderate', badgeText: statusLabel(lang, 'Check date'), stageLabel: futurePlantingText(lang) }
  }
  const stage = getGrowthStage(daysSincePlanting)
  let cls3, lbl3
  if (value >= stage.min && value <= stage.max) {
    cls3 = 'healthy'; lbl3 = 'Healthy'
  } else if (value < stage.min) {
    const deficit = stage.min - value
    if (deficit > 0.15) { cls3 = 'stressed'; lbl3 = 'Stressed' }
    else { cls3 = 'moderate'; lbl3 = 'Below expected' }
  } else {
    cls3 = 'healthy'; lbl3 = 'Healthy'
  }
  return {
    badgeClass: cls3,
    badgeText: statusLabel(lang, lbl3),
    stageLabel: stageName(lang, stage.stage) + ' \u00b7 ' + daySinceLabel(lang, daysSincePlanting) + ' \u00b7 NDVI ' + value.toFixed(2),
  }
}

// ---------------------------------------------------------------------------
// Confidence tiers (Part B — Data Trust Layer)
// ---------------------------------------------------------------------------
export const CONFIDENCE_STALE_DAYS = 21

export function getConfidenceTier(signals) {
  const lang = state.preferredLanguage
  const cloudBlocked = !!signals.cloudBlocked
  const sceneCount = signals.sceneCount
  const plantingDateSource = signals.plantingDateSource
  const lastValidDate = signals.lastValidDate

  if (cloudBlocked) {
    return { tier: 'low', reason: confReason(lang, 'cloudBlocked') }
  }
  if (sceneCount === 0) {
    return { tier: 'low', reason: confReason(lang, 'noData') }
  }
  if (lastValidDate) {
    const ageDays = Math.floor((Date.now() - new Date(lastValidDate).getTime()) / 86400000)
    if (ageDays > CONFIDENCE_STALE_DAYS) {
      return { tier: 'low', reason: confReason(lang, 'stale', { days: ageDays }) }
    }
  }
  if (sceneCount != null && sceneCount > 0 && sceneCount <= 2) {
    return { tier: 'medium', reason: confReason(lang, 'fewScenes', { count: sceneCount, s: sceneCount === 1 ? '' : 's' }) }
  }
  if (plantingDateSource === 'estimated') {
    return { tier: 'medium', reason: confReason(lang, 'estimatedDate') }
  }
  return { tier: 'high', reason: '' }
}

export function fieldConfidence(field) {
  const s = fieldStatus[field.id]
  if (!s) return null
  return getConfidenceTier({
    cloudBlocked: s.cloudBlocked,
    sceneCount: s.count,
    plantingDateSource: field.plantingDateSource || 'manual',
    lastValidDate: s.date,
  })
}

export function viewConfidence(side) {
  const lang = state.preferredLanguage
  // When a field is active on the main map, the view IS the field — use the
  // same signals as the dashboard/detail panel so the badge never disagrees.
  if (side === 'main' && state.currentFieldId) {
    const field = state.fields.find((f) => f.id === state.currentFieldId)
    if (field) {
      // A radar-fallback or cloud-blocked current view always dominates the
      // field's own signals.
      if (state.radarFallback.main) {
        return { tier: 'medium', reason: confReason(lang, 'radarBlocked') }
      }
      if (state.cloudBlock.main) {
        return state.cloudBlock.main.sameMonth
          ? { tier: 'low', reason: confReason(lang, 'cloudBlocked') }
          : { tier: 'low', reason: confReason(lang, 'noRecentCapture') }
      }
      return fieldConfidence(field)
    }
  }
  if (state.radarFallback[side]) {
    return { tier: 'medium', reason: confReason(lang, 'radarReal') }
  }
  const block = state.cloudBlock[side]
  return getConfidenceTier({
    cloudBlocked: !!block,
    sceneCount: state.sceneCount[side],
    plantingDateSource: 'manual',
    lastValidDate: block ? block.lastValidDate : null,
  })
}

const STATUS_COLORS = {
  healthy: '#22c98e',
  moderate: '#f5a623',
  stressed: '#ef5b5b',
  water: '#4fa8ff',
  moist: '#f5a623',
  dry: '#9aa4b1',
  lswi: '#4fa8ff',
}

function applyFieldStyle() {
  if (!mapReg.drawnItems) return
  const s = fieldStatus[state.currentFieldId]
  const color = s ? (STATUS_COLORS[s.badgeClass] || '#22c98e') : '#22c98e'
  mapReg.drawnItems.eachLayer((l) => {
    l.setStyle({ color, weight: 2, fillColor: color, fillOpacity: 0.25 })
  })
}

export function updateFieldStatus(field) {
  if (!state.eeReady) return
  const geom = field.geojson && (field.geojson.geometry || field.geojson)
  if (!geom || !geom.coordinates) return
  const geometry = polygonGeometry(geom.coordinates)
  ee.getRecentIndexValue(geometry, state.currentIndex, ({ count, value, date, cloudBlocked }) => {
    if (count === 0 || value == null) {
      fieldStatus[field.id] = {
        badgeText: '\u2014', badgeClass: '', stageLabel: noReadingText(state.preferredLanguage),
        value: null, count: 0, date: date || null, cloudBlocked: !!cloudBlocked,
      }
      if (field.id === state.currentFieldId) applyFieldStyle()
      return
    }
    fieldStatus[field.id] = {
      ...buildStatusObject(field, value, state.currentIndex, date),
      value, count, date: date || null, cloudBlocked: !!cloudBlocked,
    }
    if (field.id === state.currentFieldId) applyFieldStyle()
  })
}

// Batched login-path refresh: ONE ee-data request covers every field instead
// of one per field (Earth Engine queues/throttles concurrent interactive
// calls, so the per-field fan-out got slower as fields accumulated). Fields
// with invalid geometry are dropped client-side so one bad entry can't fail
// the whole batch server-side. The single-field updateFieldStatus(field)
// stays for the save/edit-one-field paths.
function validGeometryFields() {
  if (!state.fields.length) return []
  return state.fields.map((f) => {
    const geom = f.geojson && (f.geojson.geometry || f.geojson)
    return geom && geom.coordinates ? { id: f.id, geometry: geom } : null
  }).filter(Boolean)
}

export function refreshAllFieldStatuses() {
  if (!state.eeReady) return
  const payload = validGeometryFields()
  if (!payload.length) return
  ee.getAllFieldStatuses(payload, state.currentIndex, (statuses) => {
    statuses.forEach(({ id, value, count, date, cloudBlocked }) => {
      const field = state.fields.find((f) => f.id === id)
      if (!field) return
      if (count === 0 || value == null) {
        fieldStatus[id] = {
          badgeText: '\u2014', badgeClass: '', stageLabel: noReadingText(state.preferredLanguage),
          value: null, count: 0, date: date || null, cloudBlocked: !!cloudBlocked,
        }
      } else {
        fieldStatus[id] = {
          ...buildStatusObject(field, value, state.currentIndex, date),
          value, count, date: date || null, cloudBlocked: !!cloudBlocked,
        }
      }
      if (id === state.currentFieldId) applyFieldStyle()
    })
  })
}

export function refreshAllFieldTrends() {
  if (!state.eeReady) return
  const payload = validGeometryFields()
  if (!payload.length) return
  ee.getAllFieldTrends(payload, 'ndvi', MONTHS, (trends) => {
    trends.forEach(({ id, points }) => {
      if (!state.fields.some((f) => f.id === id)) return
      fieldTrends[id] = points
    })
  })
}

// ---------------------------------------------------------------------------
// Draw visibility + events
// ---------------------------------------------------------------------------
export function updateDrawEditVisibility() {
  const visible = mapReg.drawnItems && mapReg.drawnItems.getLayers().length > 0
  document.querySelectorAll('.leaflet-draw-section').forEach((s) => {
    if (s.querySelector('.leaflet-draw-edit-edit, .leaflet-draw-edit-remove')) {
      s.style.display = visible ? '' : 'none'
    }
  })
}

export function onFieldCreated(layer) {
  state.isDrawing = false
  mapReg.activeDraw = null
  mapReg.drawnItems.addLayer(layer)
  updateDrawEditVisibility()
  promptSaveField(layer.toGeoJSON())
}

export function onFieldEdited() {
  const layers = []
  mapReg.drawnItems.eachLayer((l) => layers.push(l.toGeoJSON()))
  if (layers.length > 0 && state.currentFieldId) {
    const field = state.fields.find((f) => f.id === state.currentFieldId)
    if (field) {
      invalidateChartCacheForField(field.id)
      updateField(field.id, {
        geojson: layers[0],
        area_ha: getFieldAreaHectares(layers[0]),
        ...supabase.fieldCentroid(layers[0]),
      })
    }
  }
  finishFieldEdit()
}

// ---------------------------------------------------------------------------
// Locate / Search
// ---------------------------------------------------------------------------
export function locate() {
  if (!mapReg.map) { showToast('Map not ready'); return }
  if (!('geolocation' in navigator)) { showToast('Location not supported'); return }
  setStatus('computing', 'Finding your location...')
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude
      const lng = pos.coords.longitude
      mapReg.map.setView([lat, lng], 16)
      setStatus('ready', 'Flew to your location')
    },
    () => showToast('Could not get your location \u2014 please allow access')
  )
}

export function searchPlace(query) {
  if (!query || !query.trim()) return
  const q = encodeURIComponent(query.trim())
  fetch('https://nominatim.openstreetmap.org/search?format=json&q=' + q)
    .then((r) => r.json())
    .then((data) => {
      if (!data || data.length === 0) { showToast('Location not found'); return }
      const loc = data[0]
      mapReg.map.setView([parseFloat(loc.lat), parseFloat(loc.lon)], 16)
      setStatus('ready', 'Flew to ' + loc.display_name.split(',')[0])
    })
    .catch(() => showToast('Search failed \u2014 check your connection'))
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------
export function exportChart() {
  if (!infoChart) { showToast('Click a location on the map first'); return }
  const canvas = document.getElementById('trend-chart')
  const link = document.createElement('a')
  const cfg = INDICES[state.currentIndex] || TRUE_COLOR
  link.download = cfg.name + '_trend_report.png'
  link.href = canvas.toDataURL('image/png')
  link.click()
}

export function exportPdf() {
  if (!infoChart) { showToast('Click a location on the map first'); return }
  const doc = new jsPDF('p', 'mm', 'a4')
  const pw = doc.internal.pageSize.getWidth()
  let y = 20
  const expCfgStart = INDICES[state.currentIndex] || TRUE_COLOR

  doc.setFontSize(18)
  doc.setTextColor(26, 26, 46)
  doc.text(expCfgStart.name + ' Crop Health Report', pw / 2, y, { align: 'center' })
  y += 10

  doc.setFontSize(10)
  doc.setTextColor(100, 100, 100)
  doc.text('Generated: ' + new Date().toLocaleDateString(), pw / 2, y, { align: 'center' })
  y += 10

  doc.setFontSize(12)
  doc.setTextColor(50, 50, 50)
  const location = state.currentFieldName || state.chartSubtitle
  doc.text('Location: ' + location, 14, y)
  y += 8

  const pts = infoChart.data.datasets[0].data
  const lastIdx = pts.length - 1
  if (lastIdx >= 0) {
    const lastPoint = pts[lastIdx]
    const lastVal = lastPoint.y
    const lastDate = new Date(lastPoint.x).toISOString().slice(0, 10)
    const cfg = INDICES[state.currentIndex] || INDICES.ndvi
    const statusText = cfg.name === 'NDVI'
      ? (lastVal > 0.6 ? 'Healthy' : lastVal > 0.3 ? 'Moderate' : 'Stressed')
      : 'See chart'
    doc.setFontSize(12)
    doc.setTextColor(50, 50, 50)
    doc.text('Latest ' + cfg.name + ': ' + lastVal.toFixed(3) + ' (' + lastDate + ')', 14, y)
    y += 7
    doc.setTextColor(lastVal > 0.6 ? 34 : lastVal > 0.3 ? 180 : 220, lastVal > 0.6 ? 197 : lastVal > 0.3 ? 160 : 38, lastVal > 0.3 ? 94 : 38)
    doc.text('Crop Health: ' + statusText, 14, y)
    y += 10
  }

  const canvas = document.getElementById('trend-chart')
  const chartImage = canvas.toDataURL('image/png')
  doc.addImage(chartImage, 'PNG', 14, y, pw - 28, 65)
  y += 72

  if (state.stressAlert) {
    doc.setTextColor(133, 100, 4)
    doc.setFontSize(10)
    const lines = doc.splitTextToSize(state.stressAlert, pw - 28)
    doc.text(lines, 14, y)
    y += lines.length * 5 + 6
  }

  y = Math.max(y, 200)
  doc.setFontSize(9)
  doc.setTextColor(120, 120, 120)
  const expCfg = INDICES[state.currentIndex] || INDICES.ndvi
  doc.text(expCfg.name + ' (' + expCfg.full + ') \u2014 what the values mean:', 14, y); y += 5
  const expLines = doc.splitTextToSize(expCfg.explain, pw - 28)
  doc.text(expLines, 14, y); y += expLines.length * 4 + 4
  doc.setFontSize(8)
  doc.text('Data source: Sentinel-2 (ESA) via Google Earth Engine', 14, y + 4)

  doc.save(expCfg.name + '_Report_' + new Date().toISOString().slice(0, 10) + '.pdf')
}

// ---------------------------------------------------------------------------
// Event / scene helpers (for slider panel rendering)
// ---------------------------------------------------------------------------
export function eventForMonth(idx) {
  const m = MONTHS[idx]
  return m && EVENTS.find((e) => e.year === m.year && e.month === m.month)
}

export { EVENTS, EVENT_COLORS, MONTHS, INDICES, MAP_CENTER, MAP_ZOOM }
