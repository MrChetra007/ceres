<template>
  <TopBar @menu="openDashboard" />
  <LeafletMap />
  <div v-if="state.loading" class="map-loading"></div>

  <TimeControl />
  <MapLegend />
  <HealthZonePanel />

  <CollapsibleDrawer v-model="leftDrawerOpen" position="left" :width="300">
    <template #title><i class="ti ti-list-details"></i> {{ t('sidebar.monitored_fields') }}</template>
    <Sidebar />
  </CollapsibleDrawer>

  <CollapsibleDrawer v-model="state.infoPanelVisible" position="right" :width="360" no-header>
    <FieldDetailPanel />
  </CollapsibleDrawer>

  <CollapsibleBottomSheet v-model="state.observationsVisible">
    <ObservationsPanel />
    <div class="sheet-divider"></div>
    <BandPanel />
  </CollapsibleBottomSheet>

  <div id="status-bar" class="status-toast" :class="{ hidden: !state.statusText }">{{ state.statusText }}</div>

  <PresetEditor />
  <AoiEditor />
  <HelpModal />
  <ChartModal />
  <AuthOverlay />
  <DatePickerModal />
  <TelegramModal />

  <div id="toast-stack" class="toast-stack">
    <transition-group name="toast">
      <div
        v-for="toast in state.toasts"
        :key="toast.id"
        class="toast"
      >{{ toast.msg }}</div>
    </transition-group>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'
import { state } from '../store'
import * as store from '../store'
import TopBar from '../components/TopBar.vue'
import LeafletMap from '../components/LeafletMap.vue'
import TimeControl from '../components/TimeControl.vue'
import BandPanel from '../components/BandPanel.vue'
import MapLegend from '../components/MapLegend.vue'
import HealthZonePanel from '../components/HealthZonePanel.vue'
import CollapsibleDrawer from '../components/CollapsibleDrawer.vue'
import CollapsibleBottomSheet from '../components/CollapsibleBottomSheet.vue'
import Sidebar from '../components/Sidebar.vue'
import FieldDetailPanel from '../components/FieldDetailPanel.vue'
import ObservationsPanel from '../components/ObservationsPanel.vue'
import PresetEditor from '../components/PresetEditor.vue'
import AoiEditor from '../components/AoiEditor.vue'
import HelpModal from '../components/HelpModal.vue'
import ChartModal from '../components/ChartModal.vue'
import AuthOverlay from '../components/AuthOverlay.vue'
import DatePickerModal from '../components/DatePickerModal.vue'
import TelegramModal from '../components/TelegramModal.vue'
import { useI18n } from '../i18n'

const { t } = useI18n()
const leftDrawerOpen = ref(false)
let statusTimer = null

function openDashboard() {
  leftDrawerOpen.value = true
}

watch(leftDrawerOpen, (v) => {
  document.body.style.overflow = v ? 'hidden' : ''
})

watch(() => state.statusText, () => {
  clearTimeout(statusTimer)
  if (state.statusState === 'ready' && state.statusText) {
    statusTimer = setTimeout(() => { state.statusText = '' }, 2500)
  }
})

onMounted(() => {
  store.applyRangeFromUrl()
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.isDrawing) store.cancelDraw()
    else if (e.key === 'Escape' && state.isAoiDraw) store.cancelAoiDraw()
  })
})

watch(
  [() => state.observationsVisible, () => state.currentFieldId],
  ([visible, fieldId]) => {
    if (!visible) return
    if (!fieldId) { store.resetObservations(); return }
    store.fetchObservations()
  },
)
</script>
