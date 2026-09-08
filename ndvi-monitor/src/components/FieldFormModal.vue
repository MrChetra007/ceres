<template>
  <div class="date-picker-overlay" v-show="fieldModal.visible" @click.self="cancel()">
    <div class="date-picker-modal date-picker-modal--field">
      <div class="dpm-head">
        <div class="dpm-icon"><i class="ti ti-map-pin-plus"></i></div>
        <div>
          <h3 class="dpm-title">{{ t('field_form.new_field') }}</h3>
          <p class="dpm-sub">{{ t('field_form.hint') }}</p>
        </div>
        <button type="button" class="dpm-close" @click="cancel()" :aria-label="t('common.close')">
          <i class="ti ti-x"></i>
        </button>
      </div>

      <div class="ff-body">
        <!-- Field name -->
        <div class="ff-group" :class="{ 'has-error': !name && touched }">
          <label class="ff-label">{{ t('field_form.name_label') }}</label>
          <input
            ref="nameEl"
            class="ff-input"
            v-model="name"
            :placeholder="t('field_form.name_placeholder')"
            @keyup.enter="onEnter"
          />
          <p class="ff-error" v-if="!name && touched">{{ t('field_form.name_required') }}</p>
        </div>

        <!-- Planting date -->
        <div class="ff-group">
          <label class="ff-label">{{ t('field_form.date_label') }}</label>
          <DatePickerCalendar v-model="date" showQuick />
        </div>

        <!-- Crop -->
        <div class="ff-group">
          <label class="ff-label">{{ t('field_form.crop_label') }}</label>
          <input
            class="ff-input"
            v-model="cropText"
            :placeholder="t('field.crop_placeholder')"
            @input="onCropInput"
            @keyup.enter="onEnter"
          />
          <div class="ff-chips" v-if="filteredCrops.length">
            <button
              v-for="c in filteredCrops"
              :key="c"
              type="button"
              class="ff-chip"
              :class="{ active: cropText.trim().toLowerCase() === c.toLowerCase() }"
              @click="cropText = c"
            >
              {{ c }}
            </button>
          </div>
          <p class="ff-crop-tip" v-else-if="cropText.trim()">{{ t('field_form.crop_custom') }}</p>
        </div>
      </div>

      <div class="date-picker-actions">
        <button class="date-picker-cancel" @click="cancel()">{{ t('common.cancel') }}</button>
        <button class="date-picker-save" :disabled="!name" @click="submit()">
          {{ t('common.save') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick, computed } from 'vue'
import { fieldModal } from '../store'
import * as store from '../store'
import { useI18n } from '../i18n'
import DatePickerCalendar from './DatePickerCalendar.vue'
import { KNOWN_CROPS } from '../services/crops'

const { t } = useI18n()
const name = ref('')
const date = ref('')
const cropText = ref('')
const touched = ref(false)
const nameEl = ref(null)

watch(
  () => fieldModal.visible,
  (open) => {
    if (open) {
      name.value = fieldModal.currentName || ''
      date.value = fieldModal.currentDate || ''
      cropText.value = fieldModal.currentCrop || ''
      touched.value = false
      nextTick(() => nameEl.value && nameEl.value.focus())
    }
  },
)

const filteredCrops = computed(() => {
  const q = cropText.value.trim().toLowerCase()
  const fullList = knownCropLabels()
  if (!q) return fullList.slice(0, 8)
  return fullList.filter((c) => c.toLowerCase().includes(q)).slice(0, 8)
})

function knownCropLabels() {
  return KNOWN_CROPS.flatMap((c) => [c.en, ...(c.km ? [c.km] : [])])
}

function onEnter() {
  if (name.value) submit()
}

function cancel() {
  store.cancelFieldForm()
}

function submit() {
  touched.value = true
  // Save is allowed without a date — saveField() will then try to auto-detect
  // the planting window from satellite data. Crop is optional too.
  if (!name.value) return
  store.submitFieldForm(name.value, date.value, cropText.value)
}
</script>
