<template>
  <div class="date-picker-overlay" v-show="cropPicker.visible" @click.self="store.cancelCrop()">
    <div class="date-picker-modal date-picker-modal--crop">
      <div class="dpm-head">
        <div class="dpm-icon"><i class="ti ti-leaf"></i></div>
        <div>
          <h3 class="dpm-title">{{ t('field.crop') }}</h3>
          <p class="dpm-sub">{{ t('field.crop_label') }}</p>
        </div>
        <button type="button" class="dpm-close" @click="store.cancelCrop()" :aria-label="t('common.close')">
          <i class="ti ti-x"></i>
        </button>
      </div>

      <div class="ff-body">
        <input
          ref="inputEl"
          class="ff-input crop-picker-input"
          v-model="val"
          :placeholder="t('field.crop_placeholder')"
          @input="didInput = true"
          @keyup.enter="store.submitCrop(val)"
        />

        <div class="ff-chips" v-if="filtered.length">
          <button
            v-for="c in filtered"
            :key="c"
            type="button"
            class="ff-chip"
            :class="{ active: val.trim().toLowerCase() === c.toLowerCase() }"
            @click="pick(c)"
          >
            {{ c }}
          </button>
        </div>
        <p class="ff-crop-tip" v-else>{{ t('field_form.crop_custom') }}</p>
      </div>

      <div class="date-picker-actions">
        <button class="date-picker-cancel" @click="store.cancelCrop()">{{ t('common.cancel') }}</button>
        <button class="date-picker-save" @click="store.submitCrop(val)">{{ t('common.save') }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick, computed } from 'vue'
import { cropPicker } from '../store'
import * as store from '../store'
import { useI18n } from '../i18n'
import { KNOWN_CROPS } from '../services/crops'

const { t } = useI18n()
const val = ref('')
const inputEl = ref(null)
const didInput = ref(false)

watch(
  () => cropPicker.visible,
  (open) => {
    if (open) {
      val.value = cropPicker.currentValue || ''
      didInput.value = false
      nextTick(() => inputEl.value && inputEl.value.focus())
    }
  },
)

const allLabels = computed(() => KNOWN_CROPS.flatMap((c) => [c.en, ...(c.km ? [c.km] : [])]))

const filtered = computed(() => {
  const q = val.value.trim().toLowerCase()
  const list = allLabels.value
  if (!q) return list.slice(0, 10)
  return list.filter((c) => c.toLowerCase().includes(q)).slice(0, 10)
})

function pick(label) {
  val.value = label
  didInput.value = true
}
</script>