<template>
  <div v-if="visible" class="date-picker-overlay" @click.self="close">
    <div class="date-picker-modal date-picker-modal--field" role="dialog" aria-modal="true">
      <div class="dpm-head">
        <div class="dpm-icon"><i class="ti ti-map-pin"></i></div>
        <div>
          <h3 class="dpm-title">{{ t('location.title') }}</h3>
          <p class="dpm-sub">{{ t('location.section_hint') }}</p>
        </div>
        <button type="button" class="dpm-close" @click="close" :aria-label="t('common.close')">
          <i class="ti ti-x"></i>
        </button>
      </div>

      <div class="ff-body">
        <AdminLocationPicker v-model="location" />

        <label v-if="location.commune_code" class="loc-consent">
          <input type="checkbox" v-model="location.share_with_authorities" />
          <span>{{ t('location.consent') }}</span>
        </label>
        <p v-else class="loc-hint">{{ t('location.consent_hint') }}</p>
      </div>

      <div class="date-picker-actions">
        <button class="date-picker-cancel" @click="close">{{ t('common.cancel') }}</button>
        <button class="date-picker-save" :disabled="saving" @click="save">
          {{ saving ? t('common.loading') : t('location.save') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import * as store from '../store'
import { useI18n } from '../i18n'
import AdminLocationPicker from './AdminLocationPicker.vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  field: { type: Object, default: null },
})
const emit = defineEmits(['close', 'saved'])

const { t } = useI18n()
const saving = ref(false)
const location = ref(emptyLocation())

function emptyLocation() {
  return {
    province_code: null,
    district_code: null,
    commune_code: null,
    village_code: null,
    share_with_authorities: false,
  }
}

function fromField(field) {
  if (!field) return emptyLocation()
  return {
    province_code: field.provinceCode || null,
    district_code: field.districtCode || null,
    commune_code: field.communeCode || null,
    village_code: field.villageCode || null,
    share_with_authorities: !!field.shareWithAuthorities,
  }
}

watch(
  () => [props.visible, props.field && props.field.id],
  ([visible]) => {
    if (visible) location.value = fromField(props.field)
  },
  { immediate: true },
)

watch(
  () => location.value.commune_code,
  (code) => {
    if (!code && location.value.share_with_authorities) {
      location.value.share_with_authorities = false
    }
  },
)

function close() {
  if (saving.value) return
  emit('close')
}

async function save() {
  if (!props.field || saving.value) return
  saving.value = true
  const ok = await store.updateFieldLocation(props.field.id, location.value)
  saving.value = false
  if (ok) {
    store.showToast(t('location.saved'))
    emit('saved')
    emit('close')
  }
}
</script>

<style scoped>
.loc-consent {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-dim);
  cursor: pointer;
}
.loc-consent input {
  margin-top: 2px;
  accent-color: var(--accent);
  flex-shrink: 0;
}
.loc-hint {
  margin: 0;
  font-size: 11.5px;
  line-height: 1.45;
  color: var(--text-faint);
}
</style>
