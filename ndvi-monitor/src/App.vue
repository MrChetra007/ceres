<template>
  <TopBar @menu="openDashboard" />
  <LeafletMap />
  <div v-if="state.loading" class="map-loading"></div>

  <TimeControl />
  <BandPanel />
  <MapLegend />

  <Sidebar ref="sidebarRef" />
  <FieldDetailPanel />
  <ObservationsPanel />

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
        v-for="t in state.toasts"
        :key="t.id"
        class="toast"
      >{{ t.msg }}</div>
    </transition-group>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { state } from './store'
import * as store from './store'
import TopBar from './components/TopBar.vue'
import LeafletMap from './components/LeafletMap.vue'
import TimeControl from './components/TimeControl.vue'
import BandPanel from './components/BandPanel.vue'
import MapLegend from './components/MapLegend.vue'
import Sidebar from './components/Sidebar.vue'
import FieldDetailPanel from './components/FieldDetailPanel.vue'
import ObservationsPanel from './components/ObservationsPanel.vue'
import PresetEditor from './components/PresetEditor.vue'
import AoiEditor from './components/AoiEditor.vue'
import HelpModal from './components/HelpModal.vue'
import ChartModal from './components/ChartModal.vue'
import AuthOverlay from './components/AuthOverlay.vue'
import DatePickerModal from './components/DatePickerModal.vue'
import TelegramModal from './components/TelegramModal.vue'

const sidebarRef = ref(null)
let statusTimer = null

function openDashboard() {
  if (sidebarRef.value) sidebarRef.value.open = true
}

watch(() => state.statusText, () => {
  clearTimeout(statusTimer)
  if (state.statusState === 'ready' && state.statusText) {
    statusTimer = setTimeout(() => { state.statusText = '' }, 2500)
  }
})

onMounted(() => {
  store.restoreSavedSession()
  store.applyRangeFromUrl()
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.isDrawing) store.cancelDraw()
    else if (e.key === 'Escape' && state.isAoiDraw) store.cancelAoiDraw()
  })
})

// Load the per-pass observation list lazily: whenever the toggle opens the
// panel or the selected field changes, (re-)pull observations for that field.
watch(
  [() => state.observationsVisible, () => state.currentFieldId],
  ([visible, fieldId]) => {
    if (!visible) return
    if (!fieldId) { store.resetObservations(); return }
    store.fetchObservations()
  },
)
</script>
