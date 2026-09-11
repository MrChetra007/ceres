import { computed } from 'vue'
import { state } from '../store'
import en from './en'
import km from './km'

const dicts = { en, km }

export function translate(key, vars) {
  const lang = state.preferredLanguage === 'km' ? 'km' : 'en'
  const dict = dicts[lang] || en
  let text = dict[key]
  // Blank or missing entries fall back to the English source text (the Khmer
  // landing copy is still being written), so an unfilled language never
  // renders an empty page/screen.
  if (!text) text = en[key]
  if (text == null) text = key
  if (vars) {
    text = text.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m))
  }
  return text
}

export function useI18n() {
  const t = (key, vars) => translate(key, vars)
  const lang = computed(() => state.preferredLanguage)
  return { t, lang }
}