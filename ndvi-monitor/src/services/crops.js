// Crop-name handling. Users type a plant name in Khmer or English — we store
// exactly what they typed (crop_name) plus a normalized English key
// (crop_english) that drives the growth-stage engine and the AI prompt.

const KHMER_PATTERN = /[\u1780-\u17FF]/

const KHMER_CROP_MAP = {
  'ស្រូវ': 'rice',
  'ដំណាំស្រូវ': 'rice',
  'ស្វាយ': 'mango',
  'ស្វាយចន្ទី': 'cashew',
  'ដំឡូងមី': 'cassava',
  'ដំឡូង': 'potato',
  'ពោត': 'maize',
  'ចេក': 'banana',
  'ម្រេច': 'pepper',
  'កៅស៊ូ': 'rubber',
  'ដូង': 'coconut',
  'ថ្នាំជក់': 'tobacco',
  'បន្លែ': 'vegetables',
  'ស្ពៃ': 'cabbage',
  'ត្រសក់': 'cucumber',
  'ឪឡឹក': 'watermelon',
  'គ្រាប់សណ្តែក': 'beans',
}

// Returns { typed, khmer, english }:
//   typed   – the raw string the user entered (normalized spacing/case)
//   khmer   – the raw string when it contains Khmer script, else null
//   english – English key when recognized (Khmer map hit, or Latin text kept
//             as-is), null when a Khmer name isn't in the map.
export function normalizeCrop(raw) {
  const s = String(raw || '').trim().replace(/\s+/g, ' ').toLowerCase()
  if (!s) return { typed: '', khmer: null, english: null }
  if (KHMER_PATTERN.test(s)) {
    return { typed: s, khmer: s, english: KHMER_CROP_MAP[s] || null }
  }
  return { typed: s, khmer: null, english: s }
}

export function isRiceCrop(english) {
  return !english || english === 'rice'
}