<template>
  <div class="dpc">
    <div class="dpc-head">
      <button type="button" class="dpc-nav" @click="stepMonth(-1)" :aria-label="t('date.prev_month')">
        <i class="ti ti-chevron-left"></i>
      </button>
      <div class="dpc-title">
        <span class="dpc-month">{{ monthName }}</span>
        <span class="dpc-year">{{ yearLabel }}</span>
      </div>
      <button type="button" class="dpc-nav" @click="stepMonth(1)" :aria-label="t('date.next_month')">
        <i class="ti ti-chevron-right"></i>
      </button>
    </div>

    <div class="dpc-weekdays">
      <span v-for="(d, i) in weekdayLabels" :key="i">{{ d }}</span>
    </div>

    <div class="dpc-grid">
      <button
        v-for="cell in cells"
        :key="cell.key"
        type="button"
        class="dpc-day"
        :class="{
          'is-empty': !cell.date,
          'is-today': cell.today,
          'is-selected': cell.selected,
          'is-future': cell.future,
          'is-past': cell.past,
        }"
        :disabled="!cell.date || cell.future || cell.past"
        @click="pick(cell.date)"
      >
        {{ cell.label }}
      </button>
    </div>

    <div class="dpc-quick" v-if="showQuick">
      <button type="button" class="dpc-quick-btn" :class="{ active: !modelValue }" @click="clear">
        {{ t('field.no_planting_date') }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { state } from '../store'
import { useI18n } from '../i18n'
import { KHMER_MONTHS, toKhmerDigits } from '../services/format'

const props = defineProps({
  modelValue: { type: String, default: '' },
  min: { type: [String, null], default: null },
  max: { type: [String, null], default: null },
  showQuick: { type: Boolean, default: true },
})

const emit = defineEmits(['update:modelValue'])

const { t } = useI18n()

const isKm = computed(() => state.preferredLanguage === 'km')

const view = ref(startOfMonth(props.modelValue))

// Jump the visible month to the selected date whenever the value is set from
// outside (e.g. the modal opening with an existing planting date), and follow
// the user's picks as they tap around the calendar.
watch(
  () => props.modelValue,
  (v) => {
    if (v) view.value = startOfMonth(v)
  },
)

const EN_WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const KM_WEEKDAYS = ['អាទិត្យ', 'ច័ន្ទ', 'អង្គារ', 'ពុធ', 'ព្រហស្បតិ៍', 'សុក្រ', 'សៅរ៍']

const weekdayLabels = computed(() => (isKm.value ? KM_WEEKDAYS : EN_WEEKDAYS))

const monthName = computed(() => {
  const m = view.value.getMonth()
  return isKm.value ? KHMER_MONTHS[m] : view.value.toLocaleDateString('en-US', { month: 'long' })
})

const yearLabel = computed(() =>
  isKm.value ? toKhmerDigits(view.value.getFullYear()) : String(view.value.getFullYear()),
)

const cells = computed(() => {
  const y = view.value.getFullYear()
  const m = view.value.getMonth()
  const firstDow = new Date(y, m, 1).getDay()
  const daysInMonth = new Date(y, m + 1, 0).getDate()
  const todayStr = todayISO()
  const selectedStr = props.modelValue
  const minStr = props.min
  const maxStr = props.max

  const list = []
  for (let i = 0; i < firstDow; i++) list.push({ key: `lead-${i}`, date: null, label: '' })
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(y, m, d)
    const iso = toISO(date)
    list.push({
      key: iso,
      date,
      iso,
      label: isKm.value ? toKhmerDigits(d) : String(d),
      today: iso === todayStr,
      selected: iso === selectedStr,
      future: !!(maxStr && iso > maxStr),
      past: !!(minStr && iso < minStr),
    })
  }
  return list
})

function todayISO() {
  const d = new Date()
  return toISO(new Date(d.getFullYear(), d.getMonth(), d.getDate()))
}

function startOfMonth(value) {
  if (value) {
    const d = new Date(value)
    if (!isNaN(d.getTime())) return new Date(d.getFullYear(), d.getMonth(), 1)
  }
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1)
}

function toISO(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function stepMonth(dir) {
  view.value = new Date(view.value.getFullYear(), view.value.getMonth() + dir, 1)
}

function pick(date) {
  const iso = toISO(date)
  if (props.min && iso < props.min) return
  if (props.max && iso > props.max) return
  emit('update:modelValue', iso)
}

function clear() {
  emit('update:modelValue', '')
}
</script>
