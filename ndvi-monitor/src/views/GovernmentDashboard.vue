<template>
  <div class="gov-page">
    <header class="gov-top">
      <div class="gov-brand">
        <button class="gov-back" @click="goMap">
          <i class="ti ti-arrow-left"></i>
          <span>{{ t('gov.back_to_map') }}</span>
        </button>
        <div class="gov-title-wrap">
          <h1>{{ t('gov.title') }}</h1>
          <p>{{ t('gov.subtitle') }}</p>
        </div>
      </div>
      <div class="gov-actions">
        <div class="lang-seg">
          <button :class="{ on: state.preferredLanguage === 'en' }" @click="setLang('en')">EN</button>
          <button :class="{ on: state.preferredLanguage === 'km' }" @click="setLang('km')">ខ្មែរ</button>
        </div>
        <button class="gov-signout" @click="signOut">{{ t('common.sign_out') }}</button>
      </div>
    </header>

    <main class="gov-main">
      <div class="gov-filter">
        <label>{{ t('gov.province_filter') }}</label>
        <select v-model="provinceCode" @change="loadSummary">
          <option value="">{{ t('gov.all_provinces') }}</option>
          <option v-for="p in provinces" :key="p.code" :value="p.code">{{ pname(p) }}</option>
        </select>
        <span v-if="includesDemo" class="gov-demo">
          <i class="ti ti-flask"></i>{{ t('gov.demo_notice') }}
        </span>
      </div>

      <div class="gov-tiles">
        <div class="gov-tile">
          <span>{{ t('gov.communes_reporting') }}</span>
          <b>{{ totals.communes }}</b>
        </div>
        <div class="gov-tile">
          <span>{{ t('gov.fields_reporting') }}</span>
          <b>{{ totals.fields }}</b>
        </div>
        <div class="gov-tile">
          <span>{{ t('gov.stressed_pct') }}</span>
          <b>{{ totals.stressedPct }}%</b>
        </div>
      </div>

      <section v-if="selectedProvince" class="gov-weather">
        <div class="gov-weather-head">
          <p class="gov-card-label">{{ t('field.official_conditions') }}</p>
          <span class="gov-weather-source">{{ t('field.official_source') }}</span>
        </div>
        <div v-if="weatherLoading" class="gov-state-inline">{{ t('gov.loading') }}</div>
        <div v-else-if="weatherError || !weather" class="gov-state-inline">{{ t('field.data_unavailable') }}</div>
        <template v-else>
          <div class="gov-weather-main">
            <span class="gov-weather-temp mono">
              {{ weather.tempC != null ? Math.round(weather.tempC) + '°C' : '—' }}
            </span>
            <span class="gov-weather-cond">{{ weather.condition || t('field.data_unavailable') }}</span>
          </div>
          <div class="gov-weather-grid">
            <span>{{ t('field.official_humidity') }} <b class="mono">{{ weather.humidity != null ? Math.round(weather.humidity) + '%' : '—' }}</b></span>
            <span>{{ t('field.official_rain_now') }} <b class="mono">{{ weather.precipMm != null ? weather.precipMm + ' mm' : '—' }}</b></span>
            <span class="gov-weather-updated">{{ t('field.official_updated', { time: weatherUpdatedText }) }}</span>
          </div>
          <span v-if="weather.stale" class="gov-stale">{{ t('field.official_stale') }}</span>
        </template>
      </section>

      <section class="gov-table-card">
        <div class="gov-legend">
          <span><i class="gov-dot healthy"></i>{{ t('gov.legend_healthy') }}</span>
          <span><i class="gov-dot below"></i>{{ t('gov.legend_below') }}</span>
          <span><i class="gov-dot stressed"></i>{{ t('gov.legend_stressed') }}</span>
          <span><i class="gov-dot radar"></i>{{ t('gov.legend_radar') }}</span>
          <span><i class="gov-dot nodata"></i>{{ t('gov.legend_no_data') }}</span>
        </div>

        <div v-if="loading" class="gov-state">{{ t('gov.loading') }}</div>
        <div v-else-if="error" class="gov-state gov-error">{{ t('gov.error') }}</div>
        <div v-else-if="!groups.length" class="gov-state">{{ t('gov.empty') }}</div>
        <template v-else>
          <div v-for="prov in groups" :key="prov.code" class="gov-prov">
            <h2>{{ prov.name }}</h2>
            <div v-for="dist in prov.districts" :key="dist.code" class="gov-dist">
              <h3>{{ dist.name }}</h3>
              <div class="gov-table">
                <div class="gov-row gov-head">
                  <span>{{ t('gov.commune') }}</span>
                  <span>{{ t('gov.fields') }}</span>
                  <span>{{ t('gov.status_mix') }}</span>
                  <span>{{ t('gov.last_alert') }}</span>
                </div>
                <div
                  v-for="row in dist.rows"
                  :key="row.commune_code"
                  class="gov-row"
                  :class="{ suppressed: row.suppressed }"
                >
                  <span class="gov-commune">{{ cname(row) }}</span>
                  <template v-if="row.suppressed">
                    <span class="gov-suppressed">{{ t('gov.suppressed') }}</span>
                  </template>
                  <template v-else>
                    <span class="mono">{{ row.field_count }}</span>
                    <span class="gov-bar" :title="barTitle(row)">
                      <i
                        v-for="seg in segments(row)"
                        :key="seg.key"
                        :style="{ width: seg.pct + '%', background: seg.color }"
                      ></i>
                    </span>
                    <span class="gov-date mono">{{ formatDate(row.last_alert_at) }}</span>
                  </template>
                </div>
              </div>
            </div>
          </div>
        </template>
      </section>

      <p class="gov-privacy">{{ t('gov.privacy_note') }}</p>
    </main>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { state } from '../store'
import * as store from '../store'
import { sb } from '../services/supabase'
import { listProvinces, listDistricts } from '../services/adminBoundaries'
import { getProvinceWeather } from '../services/dataefService'
import { useI18n } from '../i18n'

const { t, lang } = useI18n()

const provinces = ref([])
const provinceCode = ref('')
const rows = ref([])
const districtNames = ref({})
const loading = ref(true)
const error = ref(false)
let summaryReq = 0

const weather = ref(null)
const weatherLoading = ref(false)
const weatherError = ref(false)
let weatherReq = 0

const selectedProvince = computed(
  () => provinces.value.find((p) => p.code === provinceCode.value) || null,
)
const includesDemo = computed(() => rows.value.some((r) => r.includes_demo))
const weatherUpdatedText = computed(() => {
  const w = weather.value
  if (!w || !w.lastUpdated) return '—'
  return String(w.lastUpdated).replace('T', ' ').slice(0, 16)
})

const totals = computed(() => {
  const visible = rows.value.filter((r) => !r.suppressed)
  const fields = visible.reduce((sum, r) => sum + (r.field_count || 0), 0)
  const stressed = visible.reduce((sum, r) => sum + (r.stressed_count || 0), 0)
  return {
    communes: visible.length,
    fields,
    stressedPct: fields ? Math.round((stressed / fields) * 100) : 0,
  }
})

function pname(province) {
  if (!province) return ''
  return lang.value === 'km'
    ? province.name_kh || province.name_en || province.code
    : province.name_en || province.name_kh || province.code
}

function cname(row) {
  return lang.value === 'km'
    ? row.commune_name_kh || row.commune_name_en || row.commune_code
    : row.commune_name_en || row.commune_name_kh || row.commune_code
}

function districtName(code) {
  const d = districtNames.value[code]
  if (!d) return code || '—'
  return lang.value === 'km'
    ? d.name_kh || d.name_en || code
    : d.name_en || d.name_kh || code
}

function provinceName(code) {
  const p = provinces.value.find((x) => x.code === code)
  return p ? pname(p) : code || '—'
}

const groups = computed(() => {
  const provinceMap = new Map()
  for (const row of rows.value) {
    const pcode = row.province_code || 'unknown'
    const dcode = row.district_code || 'unknown'
    if (!provinceMap.has(pcode)) {
      provinceMap.set(pcode, {
        code: pcode,
        name: provinceName(pcode),
        districts: new Map(),
      })
    }
    const prov = provinceMap.get(pcode)
    if (!prov.districts.has(dcode)) {
      prov.districts.set(dcode, {
        code: dcode,
        name: districtName(dcode),
        rows: [],
      })
    }
    prov.districts.get(dcode).rows.push(row)
  }
  return [...provinceMap.values()].map((p) => ({
    ...p,
    districts: [...p.districts.values()],
  }))
})

const SEGMENTS = [
  { key: 'healthy', field: 'healthy_count', color: '#22c98e' },
  { key: 'below', field: 'below_expected_count', color: '#f5a623' },
  { key: 'stressed', field: 'stressed_count', color: '#ef5b5b' },
  { key: 'radar', field: 'radar_flag_count', color: '#c39aff' },
  { key: 'no_data', field: 'no_data_count', color: '#6b7280' },
]

function segments(row) {
  const total = row.field_count || 0
  if (!total) return []
  return SEGMENTS.map((s) => ({
    key: s.key,
    color: s.color,
    pct: Math.round(((row[s.field] || 0) / total) * 100),
  })).filter((s) => s.pct > 0)
}

function barTitle(row) {
  return SEGMENTS.map((s) => `${t('gov.legend_' + s.key)} ${row[s.field] || 0}`).join(' · ')
}

function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(lang.value === 'km' ? 'km-KH' : 'en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

async function loadDistrictNames() {
  const codes = [...new Set(rows.value.map((r) => r.province_code).filter(Boolean))]
  const next = {}
  await Promise.all(
    codes.map(async (code) => {
      try {
        const districts = await listDistricts(code)
        for (const d of districts) next[d.code] = d
      } catch (e) {}
    }),
  )
  districtNames.value = next
}

async function loadWeather() {
  if (!selectedProvince.value) {
    weather.value = null
    weatherLoading.value = false
    weatherError.value = false
    return
  }
  const req = ++weatherReq
  weatherLoading.value = true
  weatherError.value = false
  try {
    const w = await getProvinceWeather(selectedProvince.value.name_en)
    if (req !== weatherReq) return
    weather.value = w
    weatherError.value = !w
    weatherLoading.value = false
  } catch (e) {
    if (req !== weatherReq) return
    weather.value = null
    weatherError.value = true
    weatherLoading.value = false
  }
}

async function loadSummary() {
  const req = ++summaryReq
  loading.value = true
  error.value = false
  try {
    const { data, error: err } = await sb.rpc('get_commune_stress_summary', {
      p_province_code: provinceCode.value || null,
    })
    if (err) throw err
    if (req !== summaryReq) return
    rows.value = data || []
    await loadDistrictNames()
    await loadWeather()
  } catch (e) {
    if (req !== summaryReq) return
    rows.value = []
    error.value = true
    weather.value = null
  } finally {
    if (req === summaryReq) loading.value = false
  }
}

function setLang(next) {
  store.setLanguage(next)
}

function goMap() {
  store.goToMap()
}

function signOut() {
  store.signOut()
}

onMounted(async () => {
  if (!state.supabaseUser) {
    store.goToMap()
    return
  }
  if (!state.roleLoaded) {
    await store.loadSubscription()
  }
  if (state.role !== 'extension_viewer') {
    store.goToMap()
    return
  }
  try {
    provinces.value = await listProvinces()
  } catch (e) {
    provinces.value = []
  }
  await loadSummary()
})
</script>

<style scoped>
.gov-page {
  min-height: 100vh;
  background: #0b0f14;
  color: var(--text);
  padding-bottom: 40px;
}

.gov-top {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 22px;
  background: rgba(12, 16, 22, 0.88);
  border-bottom: 0.5px solid var(--panel-border);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}

.gov-brand {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
}

.gov-back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(255, 255, 255, 0.05);
  border: 0.5px solid var(--panel-border);
  color: var(--text-dim);
  border-radius: var(--radius-sm);
  padding: 7px 10px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.gov-back:hover { background: rgba(255, 255, 255, 0.09); color: var(--text); }

.gov-title-wrap h1 {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.gov-title-wrap p {
  margin: 2px 0 0;
  font-size: 11.5px;
  color: var(--text-faint);
}

.gov-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.gov-signout {
  background: transparent;
  border: 0.5px solid var(--panel-border);
  color: var(--text-dim);
  border-radius: var(--radius-sm);
  padding: 6px 10px;
  font-size: 11.5px;
  cursor: pointer;
}
.gov-signout:hover { background: var(--red-dim); color: var(--red); border-color: rgba(239, 91, 91, 0.4); }

.gov-main {
  max-width: 1180px;
  margin: 0 auto;
  padding: 22px;
}

.gov-filter {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.gov-filter label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-faint);
}
.gov-filter select {
  background: rgba(255, 255, 255, 0.05);
  border: 0.5px solid var(--panel-border);
  color: var(--text);
  border-radius: var(--radius-sm);
  padding: 7px 9px;
  font-size: 12.5px;
  min-width: 190px;
}
.gov-filter select option { background: #141b22; }

.gov-demo {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-left: auto;
  padding: 4px 9px;
  border-radius: 999px;
  background: var(--amber-dim);
  color: var(--amber);
  font-size: 10.5px;
  font-weight: 600;
}

.gov-tiles {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}
.gov-tile {
  background: rgba(255, 255, 255, 0.04);
  border: 0.5px solid var(--panel-border);
  border-radius: var(--radius-md);
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.gov-tile span {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-faint);
}
.gov-tile b {
  font-size: 24px;
  line-height: 1;
  color: var(--text);
}

.gov-weather {
  position: relative;
  background: rgba(18, 22, 29, 0.9);
  border: 0.5px solid var(--panel-border);
  border-radius: var(--radius-md);
  padding: 14px 16px;
  margin-bottom: 16px;
}
.gov-weather-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.gov-card-label {
  margin: 0;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-faint);
}
.gov-weather-source { font-size: 9.5px; color: var(--text-faint); }
.gov-weather-main {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin: 10px 0 8px;
}
.gov-weather-temp { font-size: 26px; font-weight: 700; color: var(--blue); }
.gov-weather-cond { font-size: 13px; color: var(--text); }
.gov-weather-grid {
  display: flex;
  gap: 18px;
  flex-wrap: wrap;
  font-size: 11.5px;
  color: var(--text-dim);
}
.gov-weather-grid b { color: var(--text); }
.gov-weather-updated { font-size: 10px; color: var(--text-faint); }
.gov-stale {
  display: inline-block;
  margin-top: 8px;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--amber-dim);
  color: var(--amber);
  font-size: 9px;
  font-weight: 600;
}

.gov-table-card {
  background: rgba(18, 22, 29, 0.72);
  border: 0.5px solid var(--panel-border);
  border-radius: var(--radius-md);
  padding: 14px 16px 16px;
}

.gov-legend {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  padding-bottom: 10px;
  margin-bottom: 6px;
  border-bottom: 0.5px solid var(--panel-border);
  font-size: 10.5px;
  color: var(--text-dim);
}
.gov-legend span { display: inline-flex; align-items: center; gap: 5px; }
.gov-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}
.gov-dot.healthy { background: #22c98e; }
.gov-dot.below { background: #f5a623; }
.gov-dot.stressed { background: #ef5b5b; }
.gov-dot.radar { background: #c39aff; }
.gov-dot.nodata { background: #6b7280; }

.gov-prov { margin-top: 18px; }
.gov-prov h2 {
  margin: 0 0 8px;
  font-size: 15px;
  font-weight: 700;
  color: var(--text);
}
.gov-dist { margin-bottom: 14px; }
.gov-dist h3 {
  margin: 0 0 6px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-faint);
}

.gov-table { border: 0.5px solid var(--panel-border); border-radius: var(--radius-sm); overflow: hidden; }
.gov-row {
  display: grid;
  grid-template-columns: minmax(160px, 1.4fr) 70px minmax(160px, 1.6fr) 110px;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  font-size: 12px;
  border-top: 0.5px solid var(--panel-border);
}
.gov-row:first-child { border-top: none; }
.gov-head {
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-faint);
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.gov-commune { color: var(--text); font-weight: 600; }
.gov-row.suppressed { color: var(--text-faint); }
.gov-suppressed { grid-column: 2 / -1; font-size: 11px; font-style: italic; }
.gov-date { color: var(--text-dim); font-size: 10.5px; }

.gov-bar {
  display: flex;
  height: 9px;
  border-radius: 999px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.06);
}
.gov-bar i { display: block; height: 100%; }

.gov-state {
  padding: 28px 8px;
  text-align: center;
  color: var(--text-faint);
  font-size: 12.5px;
}
.gov-error { color: var(--red); }
.gov-state-inline { padding: 10px 0 2px; color: var(--text-faint); font-size: 12px; }

.gov-privacy {
  margin: 16px 2px 0;
  font-size: 10.5px;
  line-height: 1.6;
  color: var(--text-faint);
}

@media (max-width: 760px) {
  .gov-top {
    align-items: flex-start;
    flex-direction: column;
    gap: 10px;
    padding: 12px 14px;
  }
  .gov-main { padding: 14px; }
  .gov-tiles { grid-template-columns: 1fr; }
  .gov-row {
    grid-template-columns: minmax(120px, 1.2fr) 42px minmax(110px, 1.4fr);
    gap: 8px;
    padding: 8px 10px;
  }
  .gov-row:not(.suppressed) > :last-child { display: none; }
  .gov-head > :last-child { display: none; }
  .gov-suppressed { grid-column: 2 / -1; }
}
</style>
