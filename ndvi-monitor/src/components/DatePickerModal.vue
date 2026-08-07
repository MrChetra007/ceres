<template>
  <div class="date-picker-overlay" v-show="datePicker.visible" @click.self="store.cancelDate()">
    <div class="date-picker-modal">
      <label>{{ t('field.date_label') }}</label>
      <input type="date" ref="inputEl" v-model="val" />
      <div class="date-picker-actions">
        <button class="date-picker-cancel" @click="store.cancelDate()">{{ t('common.cancel') }}</button>
        <button class="date-picker-save" @click="store.submitDate(val)">{{ t('common.save') }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'
import { datePicker } from '../store'
import * as store from '../store'
import { useI18n } from '../i18n'

const { t } = useI18n()
const val = ref('')
const inputEl = ref(null)

watch(() => datePicker.visible, (open) => {
  if (open) {
    val.value = datePicker.currentDate || ''
    nextTick(() => inputEl.value && inputEl.value.focus())
  }
})
</script>
