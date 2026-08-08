import { reactive, shallowRef } from 'vue'
import { area as turfArea } from '@turf/turf'
import { jsPDF } from 'jspdf'
import {
  EE_PROJECT_ID, CLIENT_ID, MONTHS, DEFAULT_AOI, DEFAULT_PRESETS,
  RICE_GROWTH_STAGES, EVENTS, EVENT_COLORS, INDICES, MAP_CENTER, MAP_ZOOM,
  TELEGRAM_BOT_USERNAME, TELEGRAM_LINK_TTL_MS,
} from './config'
import * as ee from './services/earthEngine'
import { sb } from './services/supabase'
import * as supabase from './services/supabase'

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
  mainMonth: Math.max(0, MONTHS.length - 2),
  rightMonth: Math.max(0, MONTHS.length - 5),
  compareMode: false,
  currentBase: 'street',
  currentFieldId: null,
  currentFieldName: null,
  lastClickPoint: null,
  chartData: null,
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
  rainfallMm: null,
  benchmarkValue: null,
  isDrawing: false,
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
  preferredLanguage: 'en',
  photosLightboxIndex: null,
})

export const currentGeometry = shallowRef(null)
export const fieldStatus = reactive({})
export const fieldTrends = reactive({})
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
  return currentGeometry.value || window.ee.Geometry.Rectangle(state.aoiCoords)
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

export function formatHectares(ha) {
  if (ha < 0.1) return ha.toFixed(3) + ' ha'
  return ha.toFixed(1) + ' ha'
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
  if (!mapReg.map || !state.aoiCoords) return
  if (mapReg.aoiRectangle) mapReg.map.removeLayer(mapReg.aoiRectangle)
  mapReg.aoiRectangle = window.L.rectangle(
    [[state.aoiCoords[1], state.aoiCoords[0]], [state.aoiCoords[3], state.aoiCoords[2]]],
    { color: '#ff4444', weight: 2, fill: false, dashArray: '4 4' }
  ).addTo(mapReg.map)
}

// A selected field clips rendering to its own polygon — the broad AOI
// rectangle should not linger as a visual overlay once a field is active.
function hideAoiRectangle() {
  if (mapReg.aoiRectangle) {
    if (mapReg.map) mapReg.map.removeLayer(mapReg.aoiRectangle)
    mapReg.aoiRectangle = null
  }
}

function applyAoiBounds(coords, label) {
  state.aoiCoords = coords && coords.length === 4 ? coords.slice() : DEFAULT_AOI.slice()
  updateAoiRectangle()
  if (mapReg.map) {
    mapReg.map.setView([(state.aoiCoords[1] + state.aoiCoords[3]) / 2, (state.aoiCoords[0] + state.aoiCoords[2]) / 2], 14)
  }
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

export async function createAoi(name, bounds) {
  if (!state.supabaseUser) { showToast('Sign in to save areas'); return null }
  if (state.aois.length >= 5) { showToast('Limit of 5 areas reached'); return null }
  try {
    const aoi = await supabase.insertAoi({ name, bounds })
    state.aois.push(aoi)
    selectAoi(aoi.id)
    return aoi
  } catch (err) {
    if (handleAuthError(err)) return null
    const msg = /limit|exceeded|maximum|violates|cap/i.test(err.message || '')
      ? 'Limit of 5 areas reached'
      : err.message
    showToast('Failed to save area: ' + msg)
    return null
  }
}

export async function updateAoi(id, patch) {
  if (!state.supabaseUser) { showToast('Sign in to update areas'); return }
  try {
    await supabase.updateAoi(id, patch)
    const aoi = state.aois.find((a) => a.id === id)
    if (aoi) {
      if ('name' in patch) aoi.name = patch.name
      if ('bounds' in patch) aoi.bounds = patch.bounds
      if (id === state.selectedAoiId) applyAoiBounds(aoi.bounds, aoi.name)
    }
  } catch (err) {
    showToast('Failed to update area: ' + err.message)
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
    state.preferredLanguage = profile?.preferred_language || 'en'
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
  mapReg.map.invalidateSize()

  if (mapReg.mapRight && mapReg.baseLayerRight) {
    mapReg.mapRight.removeLayer(mapReg.baseLayerRight)
    mapReg.baseLayerRight = window.L.tileLayer(url, { attribution: attr, maxZoom: 19 }).addTo(mapReg.mapRight)
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
  }).addTo(map)
}

export function loadIndexForMonth(idx, geometry, silent) {
  const m = MONTHS[idx]
  if (!m || !state.eeReady) return
  const cfg = INDICES[state.currentIndex]
  state.mainMonth = idx
  state.sceneCount.main = 0
  state.cloudBlock.main = null
  state.radarFallback.main = null
  beginLoading()
  const geom = geometry || window.ee.Geometry.Rectangle(state.aoiCoords)
  ee.loadIndexTile(m, state.currentIndex, geom, (res) => {
    state.sceneCount.main = res.count
    if (res.mode === 'radar_fallback') {
      endLoading()
      if (res.url) mapReg.ndviLayer = applyTileLayer(mapReg.map, mapReg.ndviLayer, res.url, 1)
      else if (mapReg.ndviLayer) { mapReg.map.removeLayer(mapReg.ndviLayer); mapReg.ndviLayer = null }
      state.radarFallback.main = { month: m.label, indexUsed: res.indexUsed || 'RVI' }
      setStatus('ready', 'Radar view (RVI) for ' + m.label + ' \u2014 clouds blocked optical view')
      return
    }
    if (res.mode === 'cloud_blocked') {
      endLoading()
      if (res.url) mapReg.ndviLayer = applyTileLayer(mapReg.map, mapReg.ndviLayer, res.url, 1)
      else if (mapReg.ndviLayer) { mapReg.map.removeLayer(mapReg.ndviLayer); mapReg.ndviLayer = null }
      state.cloudBlock.main = { month: m.label, cloudPct: res.cloudPct, lastValidDate: res.lastValidDate }
      if (!silent && !cloudToastShown) {
        cloudToastShown = true
        const pctText = res.cloudPct != null ? Math.round(res.cloudPct) + '%' : 'high'
        const lastText = res.lastValidDate
          ? 'Last valid reading: ' + res.lastValidDate
          : 'No cloud-free imagery available in the last 90 days.'
        showToast('\u2601\uFE0F Cloud-covered on ' + m.label + ' (' + pctText + ' cloud) \u2014 showing true-color image. NDVI can\u2019t be reliably calculated. ' + lastText, 4000)
      }
      setStatus('ready', 'Cloud-blocked ' + m.label + ' \u2014 true-color shown')
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
  const cfg = INDICES[state.currentIndex]
  state.rightMonth = idx
  state.sceneCount.right = 0
  state.cloudBlock.right = null
  state.radarFallback.right = null
  beginLoading()
  const geom = getGeometry()
  ee.loadIndexTile(m, state.currentIndex, geom, (res) => {
    if (!mapReg.mapRight) { endLoading(); return }
    state.sceneCount.right = res.count
    if (res.mode === 'radar_fallback') {
      endLoading()
      if (res.url) mapReg.ndviLayerRight = applyTileLayer(mapReg.mapRight, mapReg.ndviLayerRight, res.url, 1)
      else if (mapReg.ndviLayerRight) { mapReg.mapRight.removeLayer(mapReg.ndviLayerRight); mapReg.ndviLayerRight = null }
      state.radarFallback.right = { month: m.label, indexUsed: res.indexUsed || 'RVI' }
      return
    }
    if (res.mode === 'cloud_blocked') {
      endLoading()
      if (res.url) mapReg.ndviLayerRight = applyTileLayer(mapReg.mapRight, mapReg.ndviLayerRight, res.url, 1)
      else if (mapReg.ndviLayerRight) { mapReg.mapRight.removeLayer(mapReg.ndviLayerRight); mapReg.ndviLayerRight = null }
      state.cloudBlock.right = { month: m.label, cloudPct: res.cloudPct, lastValidDate: res.lastValidDate }
      if (!silent && !cloudToastShown) {
        cloudToastShown = true
        showToast('\u2601\uFE0F Compare view cloud-covered on ' + m.label + ' \u2014 showing true-color image', 4000)
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
  else loadIndexForMonth(target)
}

// ---------------------------------------------------------------------------
// Dry-month markers
// ---------------------------------------------------------------------------
export function fetchDryMonths() {
  if (!state.eeReady) return
  const geom = window.ee.Geometry.Rectangle(state.aoiCoords)
  ee.getDryMonths(MONTHS, geom, (drySet) => {
    state.dryMonthSet = drySet
  })
}

// ---------------------------------------------------------------------------
// Trend chart data
// ---------------------------------------------------------------------------
export function loadChartForPoint(lat, lng, index, onEmpty) {
  setStatus('computing', 'Fetching ' + INDICES[index].name + ' trend...')
  ee.getIndexTimeSeries(lat, lng, index, MONTHS, (data) => {
    if (data.length === 0) {
      setStatus('error', 'No ' + INDICES[index].name + ' data for this point')
      if (onEmpty) onEmpty()
      return
    }
    state.chartData = data
    state.chartIndex = index
    state.chartSubtitle = lat.toFixed(4) + ', ' + lng.toFixed(4) + ' \u00b7 ' + data.length + ' observations'
    checkStress(data, lat, lng, index)
    setStatus('ready', INDICES[index].name + ' trend loaded \u2014 ' + data.length + ' observations')
  })
}

export function loadChartForGeometry(geometry, index, label) {
  setStatus('computing', 'Fetching ' + INDICES[index].name + ' trend...')
  ee.getIndexTimeSeriesForGeometry(geometry, index, MONTHS, (data) => {
    if (!data || data.length === 0) {
      setStatus('error', 'No ' + INDICES[index].name + ' data for this area')
      return
    }
    state.chartData = data
    state.chartIndex = index
    state.chartSubtitle = label + ' \u00b7 ' + data.length + ' observations'
    checkStress(data, null, null, index)
    setStatus('ready', INDICES[index].name + ' trend loaded \u2014 ' + data.length + ' observations')
  })
}

export function setIndex(index) {
  state.currentIndex = index
  loadIndexForMonth(state.mainMonth, currentGeometry.value)
  if (state.compareMode) loadIndexForMonthRight(state.rightMonth)
  refreshAllFieldStatuses()
  if (state.currentFieldId && currentGeometry.value) {
    loadChartForGeometry(currentGeometry.value, index, state.currentFieldName)
  } else {
    reloadChartForIndex()
  }
}

export function onMapClick(lat, lng) {
  state.currentFieldName = null
  state.currentFieldId = null
  state.lastClickPoint = { lat, lng }
  state.chartSubtitle = lat.toFixed(4) + ', ' + lng.toFixed(4)
  state.infoPanelVisible = true
  if (!state.eeReady) {
    setStatus('error', 'Sign in with Google to load ' + INDICES[state.currentIndex].name + ' trends')
    return
  }
  loadRainfall(window.ee.Geometry.Point([lng, lat]))
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
      const point = window.ee.Geometry.Point([lng, lat])
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
// Auth (Earth Engine + Supabase)
// ---------------------------------------------------------------------------
export function authenticate() {
  setStatus('authenticating', 'Signing in...')
  ee.authenticateViaOauth(CLIENT_ID, () => {
    const token = ee.getAuthToken()
    if (token) {
      localStorage.setItem('ee_auth_creds', JSON.stringify({
        access_token: token,
        expires_in: 3600,
        issued_at: Date.now(),
      }))
    }
    initializeEE()
  }, (err) => setStatus('error', 'Sign-in failed: ' + (err?.message || err)))
}

export function initializeEE() {
  setStatus('initializing', 'Initializing Earth Engine...')
  ee.initialize(EE_PROJECT_ID, () => {
    state.eeReady = true
    state.authOverlayVisible = false
    mapReg.map.invalidateSize()
    mapReg.map.setView([(state.aoiCoords[1] + state.aoiCoords[3]) / 2, (state.aoiCoords[0] + state.aoiCoords[2]) / 2], MAP_ZOOM)
    updateDrawEditVisibility()
    // User-visible map load first — the thing everyone is waiting on.
    setStatus('computing', 'Computing NDVI...')
    loadIndexForMonth(state.mainMonth, null)
    // Defer the secondary background work (dry-month markers, field statuses,
    // field trends) so it doesn't compete for the throttled Earth Engine
    // connection with the map load. Runs after the current work at idle time.
    deferIdle(() => {
      fetchDryMonths()
      refreshAllFieldStatuses()
      refreshAllFieldTrends()
    })
  }, (err) => {
    localStorage.removeItem('ee_auth_creds')
    state.authOverlayVisible = true
    setStatus('error', 'Satellite sign-in expired \u2014 please sign in again: ' + (err?.message || err))
  })
}

export function restoreSavedSession() {
  const saved = localStorage.getItem('ee_auth_creds')
  if (saved) {
    try {
      const creds = JSON.parse(saved)
      const age = Date.now() - (creds.issued_at || 0)
      const maxAge = ((creds.expires_in || 3600) - 120) * 1000
      if (creds.issued_at && age > maxAge) {
        localStorage.removeItem('ee_auth_creds')
        return
      }
      ee.setAuthToken(CLIENT_ID, creds.access_token, creds.expires_in)
      initializeEE()
    } catch (e) {
      localStorage.removeItem('ee_auth_creds')
    }
  }
}

export function showAuthOverlay() {
  state.authOverlayVisible = true
}

export function hideAuthOverlay() {
  state.authOverlayVisible = false
}

export async function signInWithSupabaseGoogle() {
  return supabase.signInWithGoogle()
}

export async function signOut() {
  await supabase.signOut()
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
      loadFieldsFromSupabase()
      loadAoisFromSupabase()
      loadTelegramChatId()
      if (localStorage.getItem('ndvi_fields') && !localStorage.getItem('ndvi_import_skipped')) {
        importLocalFieldsIfAny()
      }
    }
  } else if (event === 'SIGNED_OUT') {
    lastLoadedUserId = null
    state.fields = []
    state.aois = []
    state.selectedAoiId = null
    state.aoiCoords = DEFAULT_AOI.slice()
    state.telegramChatId = null
    state.telegramLinking = false
    stopTelegramPolling()
    if (mapReg.aoiRectangle) {
      if (mapReg.map) mapReg.map.removeLayer(mapReg.aoiRectangle)
      mapReg.aoiRectangle = null
    }
    state.authOverlayVisible = true
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
  let planting_date = plantingDate || null
  let planting_date_source = 'manual'
  // Feature 3 — if the farmer didn't enter a planting date, try to estimate one
  // from the LSWI transplant spike. Never overwrites a manual entry.
  if (!planting_date && state.eeReady) {
    const geom = geojson && (geojson.geometry || geojson)
    if (geom && geom.coordinates) {
      const geometry = window.ee.Geometry.Polygon(geom.coordinates)
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
      area_ha: getFieldAreaHectares(geojson),
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

export function loadField(field) {
  state.currentFieldName = field.name
  state.currentFieldId = field.id
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
  mapReg.map.fitBounds(geo.getBounds())

  const geom = field.geojson && (field.geojson.geometry || field.geojson)
  if (!geom || !geom.coordinates) {
    setStatus('error', 'Field has invalid geometry')
    return
  }
  currentGeometry.value = window.ee.Geometry.Polygon(geom.coordinates)
  hideAoiRectangle()
  state.infoPanelVisible = true
  state.chartSubtitle = field.name
  loadIndexForMonth(state.mainMonth, currentGeometry.value)
  if (state.compareMode) loadIndexForMonthRight(state.rightMonth)
  loadFieldTrend(field)
  loadRainfall(currentGeometry.value)
  loadBenchmark()
  loadChartForGeometry(currentGeometry.value, state.currentIndex, field.name)
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
  const enableEdit = () => {
    try {
      // leaflet-draw 1.0.4 stores the edit toolbar as `_toolbars.edit`
      // (keyed by L.EditToolbar.TYPE), with the handler in `_modes.edit`.
      const tm = mapReg.drawControl._toolbars
      const editTb = tm && tm.edit
      const mode = editTb && editTb._modes && editTb._modes.edit
      if (mode && mode.handler && typeof mode.handler.enable === 'function') {
        mode.handler.enable()
        return
      }
    } catch (e) {}
    const btn = document.querySelector('.leaflet-draw-edit-edit')
    if (btn) btn.click()
  }
  if (needsLoad) requestAnimationFrame(enableEdit)
  else enableEdit()
}

export function clearFieldSelection() {
  state.currentFieldId = null
  state.currentFieldName = null
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
  const geometry = window.ee.Geometry.Polygon(geom.coordinates)
  ee.getIndexTimeSeriesForGeometry(geometry, 'ndvi', MONTHS, (data) => {
    fieldTrends[field.id] = data
  })
}

export function refreshAllFieldTrends() {
  state.fields.forEach(loadFieldTrend)
}

export function loadRainfall(geometry) {
  if (!state.eeReady || !geometry) { state.rainfallMm = null; return }
  ee.getRainfallMm(geometry, 21, (mm) => { state.rainfallMm = mm })
}

export function loadBenchmark(geometry) {
  if (!state.eeReady) { state.benchmarkValue = null; return }
  const geom = geometry || window.ee.Geometry.Rectangle(state.aoiCoords)
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
export function buildStatusObject(field, value, index) {
  index = index || 'ndvi'
  if (index !== 'ndvi') {
    if (index === 'ndwi') {
      const cls = value > 0.3 ? 'water' : value > 0 ? 'moist' : 'dry'
      const lbl = value > 0.3 ? 'Water' : value > 0 ? 'Moist' : 'Dry'
      return { badgeClass: cls, badgeText: lbl, stageLabel: 'NDWI ' + value.toFixed(2) }
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
    return { badgeClass: cls2, badgeText: lbl2, stageLabel: 'NDVI ' + value.toFixed(2) }
  }
  const daysSincePlanting = Math.floor((Date.now() - new Date(field.plantingDate).getTime()) / 86400000)
  if (daysSincePlanting < 0) return { badgeClass: 'moderate', badgeText: 'Check date', stageLabel: 'Planting date is in the future' }
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
    badgeText: lbl3,
    stageLabel: stage.stage + ' \u00b7 Day ' + daysSincePlanting + ' \u00b7 NDVI ' + value.toFixed(2),
  }
}

// ---------------------------------------------------------------------------
// Confidence tiers (Part B — Data Trust Layer)
// ---------------------------------------------------------------------------
export const CONFIDENCE_STALE_DAYS = 21

export function getConfidenceTier(signals) {
  const cloudBlocked = !!signals.cloudBlocked
  const sceneCount = signals.sceneCount
  const plantingDateSource = signals.plantingDateSource
  const lastValidDate = signals.lastValidDate

  if (cloudBlocked) {
    return { tier: 'low', reason: 'Cloud-blocked' }
  }
  if (sceneCount === 0) {
    return { tier: 'low', reason: 'No cloud-free imagery available' }
  }
  if (lastValidDate) {
    const ageDays = Math.floor((Date.now() - new Date(lastValidDate).getTime()) / 86400000)
    if (ageDays > CONFIDENCE_STALE_DAYS) {
      return { tier: 'low', reason: 'Last valid reading is ' + ageDays + ' days old' }
    }
  }
  if (sceneCount != null && sceneCount > 0 && sceneCount <= 2) {
    return { tier: 'medium', reason: 'Only ' + sceneCount + ' cloud-free scene' + (sceneCount === 1 ? '' : 's') + ' this period' }
  }
  if (plantingDateSource === 'estimated') {
    return { tier: 'medium', reason: 'Planting date estimated from satellite data' }
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
  // When a field is active on the main map, the view IS the field — use the
  // same signals as the dashboard/detail panel so the badge never disagrees.
  if (side === 'main' && state.currentFieldId) {
    const field = state.fields.find((f) => f.id === state.currentFieldId)
    if (field) {
      // A radar-fallback or cloud-blocked current view always dominates the
      // field's own signals.
      if (state.radarFallback.main) {
        return { tier: 'medium', reason: 'Radar view (RVI) — optical blocked by cloud' }
      }
      if (state.cloudBlock.main) {
        return { tier: 'low', reason: 'Cloud-blocked' }
      }
      return fieldConfidence(field)
    }
  }
  if (state.radarFallback[side]) {
    return { tier: 'medium', reason: 'Radar view (RVI) — real data from Sentinel-1' }
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
  const geometry = window.ee.Geometry.Polygon(geom.coordinates)
  ee.getRecentIndexValue(geometry, state.currentIndex, ({ count, value, date, cloudBlocked }) => {
    if (count === 0 || value == null) {
      fieldStatus[field.id] = {
        badgeText: '\u2014', badgeClass: '', stageLabel: 'No recent data',
        value: null, count: 0, date: date || null, cloudBlocked: !!cloudBlocked,
      }
      if (field.id === state.currentFieldId) applyFieldStyle()
      return
    }
    fieldStatus[field.id] = {
      ...buildStatusObject(field, value, state.currentIndex),
      value, count, date: date || null, cloudBlocked: !!cloudBlocked,
    }
    if (field.id === state.currentFieldId) applyFieldStyle()
  })
}

export function refreshAllFieldStatuses() {
  state.fields.forEach(updateFieldStatus)
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
      updateField(field.id, {
        geojson: layers[0],
        area_ha: getFieldAreaHectares(layers[0]),
      })
    }
  }
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------
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
  link.download = INDICES[state.currentIndex].name + '_trend_report.png'
  link.href = canvas.toDataURL('image/png')
  link.click()
}

export function exportPdf() {
  if (!infoChart) { showToast('Click a location on the map first'); return }
  const doc = new jsPDF('p', 'mm', 'a4')
  const pw = doc.internal.pageSize.getWidth()
  let y = 20

  doc.setFontSize(18)
  doc.setTextColor(26, 26, 46)
  doc.text(INDICES[state.currentIndex].name + ' Crop Health Report', pw / 2, y, { align: 'center' })
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
