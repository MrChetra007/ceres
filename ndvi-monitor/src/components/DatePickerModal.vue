<template>
  <div class="date-picker-overlay" v-show="datePicker.visible" @click.self="store.cancelDate()">
    <div class="date-picker-modal date-picker-modal--rich">
      <div class="dpm-head">
        <div class="dpm-icon"><i class="ti ti-calendar"></i></div>
        <div>
          <h3 class="dpm-title">{{ t('field.planting_date') }}</h3>
          <p class="dpm-sub">{{ t('field.date_help') }}</p>
        </div>
        <button type="button" class="dpm-close" @click="store.cancelDate()" :aria-label="t('common.close')">
          <i class="ti ti-x"></i>
        </button>
      </div>

      <div class="dpm-selected" v-if="val">
        <i class="ti ti-calendar-check"></i>
        <span>{{ t('date.selected') }}:</span>
        <strong>{{ displayDate(val) }}</strong>
      </div>
      <div class="dpm-selected dpm-selected--empty" v-else>
        <i class="ti ti-calendar-x"></i>
        <span>{{ t('field.no_planting_date') }}</span>
      </div>

      <DatePickerCalendar v-model="val" />

      <div class="date-picker-actions">
        <button class="date-picker-cancel" @click="store.cancelDate()">{{ t('common.cancel') }}</button>
        <button class="date-picker-save" @click="store.submitDate(val)">{{ t('common.save') }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { datePicker } from '../store'
import * as store from '../store'
import { useI18n } from '../i18n'
import { formatDate } from '../services/format'
import DatePickerCalendar from './DatePickerCalendar.vue'

const { t, lang } = useI18n()
const val = ref('')

function displayDate(d) {
  return formatDate(d, lang.value, true)
}

watch(
  () => datePicker.visible,
  (open) => {
    if (open) val.value = datePicker.currentDate || ''
  },
)
</script>