<template>
  <div class="date-picker-overlay" v-show="cropPicker.visible" @click.self="store.cancelCrop()">
    <div class="date-picker-modal">
      <label>{{ t('field.crop_label') }}</label>
      <input
        ref="inputEl"
        class="crop-picker-input"
        v-model="val"
        :placeholder="t('field.crop_placeholder')"
        @keyup.enter="store.submitCrop(val)"
      />
      <div class="date-picker-actions">
        <button class="date-picker-cancel" @click="store.cancelCrop()">{{ t('common.cancel') }}</button>
        <button class="date-picker-save" @click="store.submitCrop(val)">{{ t('common.save') }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'
import { cropPicker } from '../store'
import * as store from '../store'
import { useI18n } from '../i18n'

const { t } = useI18n()
const val = ref('')
const inputEl = ref(null)

watch(() => cropPicker.visible, (open) => {
  if (open) {
    val.value = cropPicker.currentValue || ''
    nextTick(() => inputEl.value && inputEl.value.focus())
  }
})
</script>