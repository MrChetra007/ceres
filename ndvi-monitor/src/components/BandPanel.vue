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
        <Tooltip
          v-for="idx in ['ndvi', 'ndwi', 'lswi', 'savi', 'evi', 'gndvi', 'rvi', 'truecolor']"
          :key="idx"
          :text="bandTip(idx)"
        >
          <button
            class="segmented-btn"
            :class="{ active: state.currentIndex === idx }"
            :data-index="idx"
            @click="store.setIndex(idx)"
          >{{ idx === 'truecolor' ? t('band.truecolor') : idx.toUpperCase() }}</button>
        </Tooltip>
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
      <!-- AIM F5 — a consistent classification legend follows the ACTIVE tab;
           switching indices swaps only the range labels, keeping the grammar. -->
      <IndexLegend v-if="effectiveIndex() !== 'truecolor'" :index="effectiveIndex()" compact />
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
          <button class="areas-btn" :class="{ active: areasOpen || atAreaCap }" :title="t('band.switch_area')" @click="areasOpen = !areasOpen">
            <i class="ti ti-map-pin"></i>
            <span class="areas-btn-label">{{ selectedAoiLabel }}</span>
            <i class="ti ti-chevron-down"></i>
            <span class="band-btn-caption">{{ t('band.areas') }}</span>
            <span v-if="atAreaCap" class="areas-cap-dot" :title="t('band.areas_cap')"></span>
          </button>
          <Teleport to="body">
            <div class="areas-menu" v-show="areasOpen" ref="areasMenuRef">
              <div class="areas-menu-title">{{ t('band.my_areas') }}</div>
              <button
                v-for="a in state.aois"
                :key="a.id"
                class="areas-item"
                :class="{ active: a.id === state.selectedAoiId }"
                @click="pick(a)"
              >
                <span class="areas-item-name">{{ displayAoiName(a) }}</span>
                <span class="areas-item-actions">
                  <i class="ti ti-pencil" :title="t('band.edit_area')" @click.stop="store.openAoiEditorEdit(a.id)"></i>
                  <i class="ti ti-trash" :title="t('band.delete_area')" @click.stop="remove(a)"></i>
                </span>
              </button>
              <div class="areas-empty" v-if="state.aois.length === 0">{{ t('band.no_areas') }}</div>
              <button v-if="!atAreaCap" class="areas-new" @click="openNewArea">
                <i class="ti ti-plus"></i> {{ t('band.new_area') }}
              </button>
              <div v-else class="areas-cap">{{ t('band.areas_cap') }}</div>
            </div>
          </Teleport>
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
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { state, effectiveIndex } from '../store'
import * as store from '../store'
import Tooltip from './Tooltip.vue'
import IndexLegend from './IndexLegend.vue'
import { INDICES, TRUE_COLOR } from '../config'
import { useI18n } from '../i18n'

const { t } = useI18n()
const areasOpen = ref(false)
const areasWrap = ref(null)
const areasGroupWrap = ref(null)
const areasMenuRef = ref(null)

const explainerText = computed(() => {
  const cfg = INDICES[state.currentIndex] || TRUE_COLOR
  return cfg.name + ' \u00b7 ' + (state.preferredLanguage === 'km' ? cfg.fullKhm : cfg.full)
})

const selectedAoiLabel = computed(() => {
  const aoi = state.aois.find((a) => a.id === state.selectedAoiId)
  return aoi ? displayAoiName(aoi) : t('band.areas')
})

// Area cap comes from the user's current plan (profiles.max_aois), not a
// hardcoded number — Free=1, Individual=5, Co-op=20+.
const atAreaCap = computed(() => state.aois.length >= state.subscription.maxAois)

function displayAoiName(aoi) {
  return aoi.name === 'Battambang (default)' ? t('band.default_area') : aoi.name
}

function bandTip(idx) {
  const map = {
    ndvi: t('band.tip_ndvi'),
    ndwi: t('band.tip_ndwi'),
    lswi: t('band.tip_lswi'),
    savi: t('band.tip_savi'),
    evi: t('band.tip_evi'),
    gndvi: t('band.tip_gndvi'),
    rvi: t('band.tip_rvi'),
    truecolor: t('band.tip_truecolor'),
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

watch(areasOpen, async (open) => {
  if (open) {
    await nextTick()
    positionMenu()
  }
})

function positionMenu() {
  if (!areasGroupWrap.value || !areasMenuRef.value) return
  const btn = areasGroupWrap.value.querySelector('.areas-btn')
  if (!btn) return
  const rect = btn.getBoundingClientRect()
  const menu = areasMenuRef.value
  menu.style.position = 'fixed'
  menu.style.right = (window.innerWidth - rect.right) + 'px'
  menu.style.bottom = (window.innerHeight - rect.top + 6) + 'px'
  menu.style.left = 'auto'
  menu.style.top = 'auto'
  menu.style.zIndex = '2000'
  menu.style.maxWidth = 'calc(100vw - 24px)'

  // Clamp within viewport: if the menu extends past the left or right edge,
  // re-anchor it so it stays fully visible.
  const m = menu.getBoundingClientRect()
  if (m.left < 12) {
    menu.style.left = '12px'
    menu.style.right = 'auto'
  } else if (m.right > window.innerWidth - 12) {
    menu.style.right = '12px'
    menu.style.left = 'auto'
  }
}

function remove(a) {
  if (!window.confirm(t('band.delete_confirm', { name: a.name }))) return
  store.deleteAoi(a.id)
}

function openNewArea() {
  areasOpen.value = false
  if (atAreaCap.value) {
    store.showPaywall('aoi')
    return
  }
  // Start drawing the new AOI polygon directly on the map. `startAoiDraw`
  // closes the editor if open, arms leaflet-draw, and reopens the editor to
  // name/save once the polygon is finished.
  if (state.isAoiDraw) store.cancelAoiDraw()
  store.startAoiDraw()
}

function editArea() {
  areasOpen.value = false
  // Edit the currently active area (or fall back to creating if none yet).
  if (state.selectedAoiId) store.openAoiEditorEdit(state.selectedAoiId)
  else openNewArea()
}

function onDocClick(e) {
  if (areasGroupWrap.value && !areasGroupWrap.value.contains(e.target) &&
      !(areasMenuRef.value && areasMenuRef.value.contains(e.target))) {
    areasOpen.value = false
  }
}

onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))
</script>