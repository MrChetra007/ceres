<template>
  <div id="user-menu" class="user-menu" :style="{ display: userMenuVisible ? 'flex' : 'none' }" @click="onUserMenuClick">
    <span id="user-email-label" class="user-email">{{ userMenuLabel }}</span>
    <button v-if="state.supabaseUser" id="sign-out-btn" class="sign-out-btn" @click.stop="store.signOut()">Sign out</button>
  </div>

  <div id="dashboard-toggle" class="dashboard-toggle" title="My fields" @click="openDashboard">&#9776;</div>
  <Dashboard ref="dashboardRef" />
  <PresetPanel />
  <LeafletMap />

  <div id="status-bar" class="status-toast" :class="{ hidden: !state.statusText }">{{ state.statusText }}</div>

  <SliderPanel />
  <InfoPanel />
  <PresetEditor />
  <AoiEditor />
  <HelpModal />
  <ChartModal />
  <AuthOverlay />
  <DatePickerModal />

  <button id="help-btn" class="help-btn" title="How this works" @click="state.helpVisible = true">?</button>
  <div id="toast" class="toast" :class="{ show: !!state.toast }">{{ state.toast }}</div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { state } from './store'
import * as store from './store'
import Dashboard from './components/Dashboard.vue'
import PresetPanel from './components/PresetPanel.vue'
import LeafletMap from './components/LeafletMap.vue'
import SliderPanel from './components/SliderPanel.vue'
import InfoPanel from './components/InfoPanel.vue'
import PresetEditor from './components/PresetEditor.vue'
import AoiEditor from './components/AoiEditor.vue'
import HelpModal from './components/HelpModal.vue'
import ChartModal from './components/ChartModal.vue'
import AuthOverlay from './components/AuthOverlay.vue'
import DatePickerModal from './components/DatePickerModal.vue'

const dashboardRef = ref(null)
let statusTimer = null

function openDashboard() {
  if (dashboardRef.value) dashboardRef.value.open = true
}

const userMenuVisible = computed(() => !!state.supabaseUser || state.eeReady || !state.authOverlayVisible)
const userMenuLabel = computed(() =>
  state.supabaseUser ? (state.supabaseUser.email || 'Signed in') : 'Sign in'
)

function onUserMenuClick(e) {
  if (e.target.id === 'sign-out-btn') return
  if (!state.supabaseUser || !state.eeReady) store.showAuthOverlay()
}

watch(() => state.statusText, () => {
  clearTimeout(statusTimer)
  if (state.statusState === 'ready' && state.statusText) {
    statusTimer = setTimeout(() => { state.statusText = '' }, 2500)
  }
})

onMounted(() => {
  store.restoreSavedSession()
})
</script>
