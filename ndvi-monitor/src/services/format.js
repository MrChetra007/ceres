import { MONTH_NAMES } from '../config'

export const KHMER_MONTHS = [
  'មករា', 'កុម្ភៈ', 'មីនា', 'មេសា', 'ឧសភា', 'មិថុនា',
  'កក្កដា', 'សីហា', 'កញ្ញា', 'តុលា', 'វិច្ឆិកា', 'ធ្នូ',
]

const KHMER_DIGITS = ['០', '១', '២', '៣', '៤', '៥', '៦', '៧', '៨', '៩']

export function toKhmerDigits(value) {
  return String(value).replace(/[0-9]/g, (d) => KHMER_DIGITS[+d])
}

export function khmerMonthName(month) {
  return KHMER_MONTHS[month - 1] || ''
}

export function formatMonthYear(year, month, lang, opts = {}) {
  if (lang === 'km') {
    return (opts.prefix ? 'ខែ' : '') + khmerMonthName(month) + ' ' + toKhmerDigits(year)
  }
  if (opts.long) {
    return new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }
  return MONTH_NAMES[month - 1] + ' ' + year
}

export function monthAxisLabel(ts, lang) {
  const d = new Date(ts)
  if (lang === 'km') return khmerMonthName(d.getMonth() + 1)
  return MONTH_NAMES[d.getMonth()]
}

export function formatTooltipDate(ts, lang) {
  const d = new Date(ts)
  if (lang === 'km') {
    return toKhmerDigits(d.getDate()) + ' ' + khmerMonthName(d.getMonth() + 1) + ' ' + toKhmerDigits(d.getFullYear())
  }
  return d.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })
}

const STAGE_NAMES_KM = {
  'Transplanting': 'ស្ទូង',
  'Tillering': 'បែកគុម្ព',
  'Stem Elongation / Booting': 'លូតលាស់ដើម / ចេញលំពែង',
  'Flowering / Heading': 'ចេញផ្កា / ចេញកួរ',
  'Grain Filling / Maturity': 'បំពេញគ្រាប់ / ចាស់ទុំ',
  'Harvest / Senescence': 'ការប្រមូលផល / ការចាស់ជរារបស់ដំណាំ',
}

export function stageName(lang, stage) {
  return lang === 'km' ? (STAGE_NAMES_KM[stage] || stage) : stage
}

const STATUS_KM = {
  'Healthy': 'លូតលាស់ល្អ',
  'Moderate': 'ល្មម',
  'Stressed': 'ស្ត្រេស',
  'Below expected': 'ទាបជាងការរំពឹងទុក',
  'Check date': 'ពិនិត្យកាលបរិច្ឆេទ',
  'Water': 'ទឹក',
  'Moist': 'សំណើម',
  'Dry': 'ស្ងួត',
}

export function statusLabel(lang, label) {
  return lang === 'km' ? (STATUS_KM[label] || label) : label
}

export function futurePlantingText(lang) {
  return lang === 'km' ? 'កាលបរិច្ឆេទដាំគឺនៅពេលអនាគត' : 'Planting date is in the future'
}

export function noReadingText(lang) {
  return lang === 'km' ? 'គ្មានការអានអាចប្រើបានក្នុងរយៈពេល ៩០ ថ្ងៃចុងក្រោយ' : 'No usable reading in the last 90 days'
}

export function daySinceLabel(lang, days) {
  if (lang === 'km') return 'ថ្ងៃទី ' + toKhmerDigits(days)
  return 'Day ' + days
}

export function observationCount(lang, count, source) {
  // `source` names WHAT is being counted (e.g. "Sentinel-2 scenes" vs
  // "Sentinel-1 passes") so two very different counts under the same generic
  // "observations" label never look like they measure the same thing. When
  // omitted it keeps the legacy generic wording.
  if (source) {
    if (lang === 'km') return 'ការសង្កេត ' + source + ' ចំនួន ' + toKhmerDigits(count)
    return count + ' ' + source
  }
  if (lang === 'km') return 'ការសង្កេតចំនួន ' + toKhmerDigits(count)
  return count + ' observations'
}

export function benchmarkLabel(lang) {
  return lang === 'km' ? 'ខ្សែកោងគោល' : 'Benchmark'
}

const CONF_REASONS = {
  en: {
    cloudBlocked: 'Cloud-blocked',
    noData: 'No cloud-free imagery available',
    stale: 'Last valid reading is {days} days old',
    fewScenes: 'Only {count} cloud-free scene{s} this period',
    estimatedDate: 'Planting date estimated from satellite data',
    radarBlocked: 'Radar view (RVI) — optical blocked by cloud',
    radarReal: 'Radar view (RVI) — real data from Sentinel-1',
  },
  km: {
    cloudBlocked: 'បាំងដោយពពក',
    noData: 'គ្មានរូបភាពគ្មានពពកក្នុងរយៈពេលនេះ',
    stale: 'ការអានត្រឹមត្រូវចុងក្រោយមានអាយុ {days} ថ្ងៃ',
    fewScenes: 'មានតែ {count} រូបភាពគ្មានពពកក្នុងរយៈពេលនេះ',
    estimatedDate: 'កាលបរិច្ឆេទដាំប៉ាន់ស្មានពីទិន្នន័យផ្កាយរណប',
    radarBlocked: 'ទិដ្ឋភាពរ៉ាដា (RVI) — អុបទិកបាំងដោយពពក',
    radarReal: 'ទិដ្ឋភាពរ៉ាដា (RVI) — ទិន្នន័យពិតពី Sentinel-1',
  },
}

export function confReason(lang, key, vars) {
  const langKey = lang === 'km' ? 'km' : 'en'
  let text = CONF_REASONS[langKey][key]
  if (text == null) return ''
  if (vars) {
    const values = {}
    Object.keys(vars).forEach((k) => {
      values[k] = lang === 'km' ? toKhmerDigits(vars[k]) : vars[k]
    })
    text = text.replace(/\{(\w+)\}/g, (m, k) => (values[k] != null ? values[k] : m))
  }
  return text
}
