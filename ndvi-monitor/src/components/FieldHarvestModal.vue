<template>
  <div v-if="visible" class="date-picker-overlay" @click.self="close">
    <div class="date-picker-modal date-picker-modal--rich" role="dialog" aria-modal="true">
      <div class="dpm-head">
        <div class="dpm-icon"><i class="ti ti-plant-2"></i></div>
        <div>
          <h3 class="dpm-title">{{ t('field.harvest_date') }}</h3>
          <p class="dpm-sub">{{ t('field.harvest_date_help') }}</p>
        </div>
        <button type="button" class="dpm-close" @click="close" :aria-label="t('common.close')">
          <i class="ti ti-x"></i>
        </button>
      </div>

      <div class="dpm-selected" v-if="date">
        <i class="ti ti-calendar-check"></i>
        <span>{{ t('date.selected') }}:</span>
        <strong>{{ displayDate(date) }}</strong>
      </div>
      <div class="dpm-selected dpm-selected--empty" v-else>
        <i class="ti ti-calendar-x"></i>
        <span>{{ t('field.harvest_not_set') }}</span>
      </div>

      <DatePickerCalendar v-model="date" :min="minDate" :showQuick="false" />

      <div class="date-picker-actions">
        <button class="date-picker-cancel" @click="close" :disabled="saving">{{ t('common.cancel') }}</button>
        <button
          v-if="field && field.harvestDate"
          class="date-picker-cancel harvest-clear"
          :disabled="saving"
          @click="clear"
        >
          {{ t('field.harvest_date_clear') }}
        </button>
        <button class="date-picker-save" :disabled="saving" @click="save">
          {{ saving ? t('common.loading') : t('common.save') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import * as store from '../store'
import { useI18n } from '../i18n'
import { formatDate } from '../services/format'
import DatePickerCalendar from './DatePickerCalendar.vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  field: { type: Object, default: null },
})
const emit = defineEmits(['close', 'saved'])

const { t, lang } = useI18n()
const saving = ref(false)
const date = ref('')

const minDate = ref(null)

function displayDate(d) {
  return formatDate(d, lang.value, true)
}

watch(
  () => [props.visible, props.field && props.field.id],
  ([visible]) => {
    if (!visible) return
    date.value = (props.field && props.field.harvestDate) || ''
    minDate.value = (props.field && props.field.plantingDate) || null
  },
  { immediate: true },
)

function close() {
  if (saving.value) return
  emit('close')
}

async function persist(value) {
  if (!props.field || saving.value) return
  saving.value = true
  try {
    await store.setFieldHarvestDate(props.field.id, value)
    store.showToast(t(value ? 'field.harvest_date_saved' : 'field.harvest_date_cleared'))
    emit('saved')
    emit('close')
  } catch (e) {
    store.showToast(t('field.harvest_date_failed'))
  } finally {
    saving.value = false
  }
}

function save() {
  persist(date.value || null)
}

function clear() {
  date.value = ''
  persist(null)
}
</script>

<style scoped>
.harvest-clear {
  white-space: nowrap;
}
</style>
