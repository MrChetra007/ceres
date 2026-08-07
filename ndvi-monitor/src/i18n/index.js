import { computed } from 'vue'
import { state } from '../store'
import en from './en'
import km from './km'

const dicts = { en, km }

export function translate(key, vars) {
  const lang = state.preferredLanguage === 'km' ? 'km' : 'en'
  const dict = dicts[lang] || en
  let text = dict[key] ?? key
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