<template>
  <div class="band-wrap" v-show="state.eeReady">
    <div class="band-panel panel">
      <div class="segmented" role="group" aria-label="Index">
        <button
          v-for="idx in ['ndvi', 'ndwi', 'lswi']"
          :key="idx"
          class="segmented-btn"
          :class="{ active: state.currentIndex === idx }"
          :data-index="idx"
          :title="indexTitle(idx)"
          @click="store.setIndex(idx)"
        >{{ idx.toUpperCase() }}</button>
      </div>
      <div class="band-divider"></div>
      <div class="band-base segmented" role="group" :aria-label="t('band.base_layer')">
        <button
          v-for="b in ['street', 'satellite']"
          :key="b"
          class="segmented-btn"
          :class="{ active: state.currentBase === b }"
          @click="store.setBaseLayer(b)"
        >{{ b === 'street' ? t('topbar.street') : t('topbar.satellite') }}</button>
      </div>

      <div class="band-areas" ref="areasWrap">
        <button class="areas-btn" :title="t('band.switch_area')" @click="areasOpen = !areasOpen">
          <i class="ti ti-map-pin"></i>
          <span class="areas-btn-label">{{ selectedAoiLabel }}</span>
          <i class="ti ti-chevron-down"></i>
        </button>
        <div class="areas-menu" v-show="areasOpen">
          <div class="areas-menu-title">{{ t('band.my_areas') }}</div>
          <button
            v-for="a in state.aois"
            :key="a.id"
            class="areas-item"
            :class="{ active: a.id === state.selectedAoiId }"
            @click="pick(a)"
          >
            <span class="areas-item-name">{{ a.name }}</span>
            <i class="ti ti-trash" :title="t('band.delete_area')" @click.stop="remove(a)"></i>
          </button>
          <div class="areas-empty" v-if="state.aois.length === 0">{{ t('band.no_areas') }}</div>
          <button v-if="state.aois.length < 5" class="areas-new" @click="openNewArea">
            <i class="ti ti-plus"></i> {{ t('band.new_area') }}
          </button>
          <div v-else class="areas-cap">{{ t('band.areas_cap') }}</div>
        </div>
      </div>

      <button class="aoi-btn" :title="t('band.new_area')" @click="openNewArea">
        <i class="ti ti-map"></i>
      </button>
    </div>
    <div class="band-explainer">{{ explainerText }}</div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { state } from '../store'
import * as store from '../store'
import { INDICES } from '../config'
import { useI18n } from '../i18n'

const { t } = useI18n()
const areasOpen = ref(false)
const areasWrap = ref(null)

const explainerText = computed(() => {
  const cfg = INDICES[state.currentIndex]
  return cfg.name + ' \u00b7 ' + (state.preferredLanguage === 'km' ? cfg.fullKhm : cfg.full)
})

const selectedAoiLabel = computed(() => {
  const aoi = state.aois.find((a) => a.id === state.selectedAoiId)
  return aoi ? aoi.name : t('band.areas')
})

function indexTitle(idx) {
  const map = {
    ndvi: t('index.ndvi_title'),
    ndwi: t('index.ndwi_title'),
    lswi: t('index.lswi_title'),
  }
  return map[idx]
}

function pick(a) {
  areasOpen.value = false
  store.selectAoi(a.id)
}

function remove(a) {
  if (!window.confirm(t('band.delete_confirm', { name: a.name }))) return
  store.deleteAoi(a.id)
}

function openNewArea() {
  areasOpen.value = false
  if (state.aois.length >= 5) {
    store.showToast(t('toast.limit_areas'))
    return
  }
  state.aoiEditorVisible = true
}

function onDocClick(e) {
  if (areasWrap.value && !areasWrap.value.contains(e.target)) {
    areasOpen.value = false
  }
}

onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))
</script>