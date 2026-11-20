<template>
  <div class="admin-location-picker">
    <div class="alp-grid">
      <div class="ff-group">
        <label class="ff-label">{{ t('location.province') }}</label>
        <select
          class="ff-input alp-select"
          v-model="provinceCode"
          :disabled="loading.provinces"
        >
          <option value="">{{ t('location.select_province') }}</option>
          <option v-for="p in provinces" :key="p.code" :value="p.code">
            {{ displayName(p) }}
          </option>
        </select>
      </div>

      <div class="ff-group">
        <label class="ff-label">{{ t('location.district') }}</label>
        <select
          class="ff-input alp-select"
          v-model="districtCode"
          :disabled="!provinceCode || loading.districts"
        >
          <option value="">{{ t('location.select_district') }}</option>
          <option v-for="d in districts" :key="d.code" :value="d.code">
            {{ displayName(d) }}
          </option>
        </select>
      </div>

      <div class="ff-group">
        <label class="ff-label">{{ t('location.commune') }}</label>
        <select
          class="ff-input alp-select"
          v-model="communeCode"
          :disabled="!districtCode || loading.communes"
        >
          <option value="">{{ t('location.select_commune') }}</option>
          <option v-for="c in communes" :key="c.code" :value="c.code">
            {{ displayName(c) }}
          </option>
        </select>
      </div>

      <div class="ff-group">
        <label class="ff-label">{{ t('location.village') }}</label>
        <select
          class="ff-input alp-select"
          v-model="villageCode"
          :disabled="!communeCode || loading.villages"
        >
          <option value="">{{ t('location.select_village') }}</option>
          <option v-for="v in villages" :key="v.code" :value="v.code">
            {{ displayName(v) }}
          </option>
        </select>
      </div>
    </div>

    <p v-if="loadingAny" class="alp-note">{{ t('location.loading') }}</p>
    <p v-if="error" class="alp-error">{{ t('location.lookup_error') }}</p>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from '../i18n'
import {
  listProvinces,
  listDistricts,
  listCommunes,
  listVillages,
} from '../services/adminBoundaries'

const props = defineProps({
  modelValue: { type: Object, default: () => ({}) },
})
const emit = defineEmits(['update:modelValue'])

const { t, lang } = useI18n()

const provinces = ref([])
const districts = ref([])
const communes = ref([])
const villages = ref([])
const error = ref(false)
const loading = reactive({
  provinces: false,
  districts: false,
  communes: false,
  villages: false,
})
const loadingAny = computed(() =>
  loading.provinces || loading.districts || loading.communes || loading.villages
)

function patch(next) {
  emit('update:modelValue', { ...props.modelValue, ...next })
}

const provinceCode = computed({
  get: () => props.modelValue?.province_code || '',
  set: (value) =>
    patch({
      province_code: value || null,
      district_code: null,
      commune_code: null,
      village_code: null,
    }),
})

const districtCode = computed({
  get: () => props.modelValue?.district_code || '',
  set: (value) =>
    patch({
      district_code: value || null,
      commune_code: null,
      village_code: null,
    }),
})

const communeCode = computed({
  get: () => props.modelValue?.commune_code || '',
  set: (value) =>
    patch({
      commune_code: value || null,
      village_code: null,
    }),
})

const villageCode = computed({
  get: () => props.modelValue?.village_code || '',
  set: (value) => patch({ village_code: value || null }),
})

function displayName(row) {
  if (lang.value === 'km') return row.name_kh || row.name_en || row.code
  return row.name_en || row.name_kh || row.code
}

let districtReq = 0
let communeReq = 0
let villageReq = 0

async function loadDistricts(code) {
  const req = ++districtReq
  districts.value = []
  if (!code) return
  loading.districts = true
  error.value = false
  try {
    const rows = await listDistricts(code)
    if (req === districtReq) districts.value = rows
  } catch (e) {
    if (req === districtReq) error.value = true
  } finally {
    if (req === districtReq) loading.districts = false
  }
}

async function loadCommunes(code) {
  const req = ++communeReq
  communes.value = []
  if (!code) return
  loading.communes = true
  error.value = false
  try {
    const rows = await listCommunes(code)
    if (req === communeReq) communes.value = rows
  } catch (e) {
    if (req === communeReq) error.value = true
  } finally {
    if (req === communeReq) loading.communes = false
  }
}

async function loadVillages(code) {
  const req = ++villageReq
  villages.value = []
  if (!code) return
  loading.villages = true
  error.value = false
  try {
    const rows = await listVillages(code)
    if (req === villageReq) villages.value = rows
  } catch (e) {
    if (req === villageReq) error.value = true
  } finally {
    if (req === villageReq) loading.villages = false
  }
}

onMounted(async () => {
  loading.provinces = true
  error.value = false
  try {
    provinces.value = await listProvinces()
  } catch (e) {
    error.value = true
  } finally {
    loading.provinces = false
  }
})

watch(provinceCode, (code) => loadDistricts(code), { immediate: true })
watch(districtCode, (code) => loadCommunes(code), { immediate: true })
watch(communeCode, (code) => loadVillages(code), { immediate: true })
</script>

<style scoped>
.alp-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.alp-select {
  width: 100%;
  min-width: 0;
}
.alp-note {
  margin: 8px 0 0;
  font-size: 11px;
  color: var(--text-faint);
}
.alp-error {
  margin: 8px 0 0;
  font-size: 11.5px;
  line-height: 1.45;
  color: var(--amber);
}
@media (max-width: 520px) {
  .alp-grid {
    grid-template-columns: 1fr;
  }
}
</style>
