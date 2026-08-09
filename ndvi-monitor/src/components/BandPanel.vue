<template>
  <div class="band-wrap" v-show="state.eeReady">
    <div class="band-panel panel">
      <div class="latest-view" :class="{ active: !!state.latestView && !state.latestView.noData }">
        <button class="latest-view-btn" :class="{ loading: state.latestViewLoading }" :disabled="state.latestViewLoading" @click="store.showLatestView()" :title="t('band.latest_tip')">
          <i class="ti ti-satellite"></i>
          <span class="latest-btn-label">{{ state.latestViewLoading ? t('band.latest_loading') : t('band.latest_view') }}</span>
        </button>
        <span class="latest-view-caption" v-if="!state.latestViewLoading && state.latestView">
          <template v-if="state.latestView.noData">{{ t('band.latest_no_data') }}</template>
          <template v-else>{{ t('band.latest_caption', { date: state.latestView.date, cloud: state.latestView.cloudPct != null ? Math.round(state.latestView.cloudPct) + '%' : '—' }) }}</template>
        </span>
      </div>
      <div class="segmented" role="group" aria-label="Index">
        <button
          v-for="idx in ['ndvi', 'ndwi', 'lswi', 'truecolor']"
          :key="idx"
          class="segmented-btn"
          :class="{ active: state.currentIndex === idx }"
          :data-index="idx"
          :title="indexTitle(idx)"
          @click="store.setIndex(idx)"
        >{{ idx === 'truecolor' ? t('band.truecolor') : idx.toUpperCase() }}</button>
      </div>
      <div class="band-divider"></div>
      <div class="known-scenes" v-show="state.currentIndex === 'truecolor' && state.trueColorScenes.length > 1">
        <span class="scenes-label">{{ t('band.scene_precision') }}</span>
        <select
          class="scenes-select"
          :value="state.trueColorDate || (state.trueColorScenes[0] && state.trueColorScenes[0].date)"
          @change="onTrueColorScene"
          :title="t('band.scene_pick_tip')"
        >
          <option v-for="s in state.trueColorScenes" :key="s.date" :value="s.date">{{ sceneOption(s) }}</option>
        </select>
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

      <div class="areas-group" ref="areasGroupWrap">
        <span class="areas-group-label">{{ t('band.area_monitoring') }}</span>
        <div class="band-areas" ref="areasWrap">
          <button class="areas-btn" :class="{ active: areasOpen || state.aois.length >= 5 }" :title="t('band.switch_area')" @click="areasOpen = !areasOpen">
            <i class="ti ti-map-pin"></i>
            <span class="areas-btn-label">{{ selectedAoiLabel }}</span>
            <i class="ti ti-chevron-down"></i>
            <span class="band-btn-caption">{{ t('band.areas') }}</span>
            <span v-if="state.aois.length >= 5" class="areas-cap-dot" :title="t('band.areas_cap')"></span>
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

        <button class="aoi-btn" :class="{ active: state.aoiEditorVisible }" :title="t('band.edit_area_bounds')" @click="editArea">
        <span class="aoi-btn-icon"><i class="ti ti-map"></i></span>
        <span class="band-btn-caption">{{ t('band.edit_area_bounds') }}</span>
      </button>
      </div>
    </div>
    <div class="band-explainer">{{ explainerText }}</div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { state } from '../store'
import * as store from '../store'
import { INDICES, TRUE_COLOR } from '../config'
import { useI18n } from '../i18n'

const { t } = useI18n()
const areasOpen = ref(false)
const areasWrap = ref(null)
const areasGroupWrap = ref(null)

const explainerText = computed(() => {
  const cfg = INDICES[state.currentIndex] || TRUE_COLOR
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
    truecolor: t('index.truecolor_title'),
  }
  return map[idx]
}

function sceneOption(s) {
  const cloud = s.cloudPct != null ? Math.round(s.cloudPct) + '%' : '—'
  return s.date + ' \u00b7 ' + cloud + ' ' + t('common.cloud')
}

function onTrueColorScene(e) {
  store.setTrueColorDate(e.target.value, 'main')
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
  store.openAoiEditorEdit(null)
}

function editArea() {
  areasOpen.value = false
  // Edit the currently active area (or fall back to creating if none yet).
  if (state.selectedAoiId) store.openAoiEditorEdit(state.selectedAoiId)
  else store.openAoiEditorEdit(null)
}

function onDocClick(e) {
  if (areasGroupWrap.value && !areasGroupWrap.value.contains(e.target)) {
    areasOpen.value = false
  }
}

onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))
</script>