<template>
  <div class="topbar">
    <div class="topbar-left">
      <div class="brand-chip">
        <span class="brand-icon"><i class="ti ti-leaf"></i></span>
        <div class="brand-text">
          <span class="brand-name">NDVI Rice Monitor</span>
          <span class="brand-loc mono">BATTAMBANG · {{ state.fields.length }} monitored field{{ state.fields.length === 1 ? '' : 's' }}</span>
        </div>
      </div>
      <div class="place-search">
        <i class="ti ti-search"></i>
        <input
          type="text"
          v-model="searchQuery"
          placeholder="Search place..."
          @keydown.enter="doSearch"
        />
      </div>
    </div>

    <div class="topbar-right">
      <button
        class="glass-pill"
        :class="{ active: state.currentBase === 'street' }"
        title="Street map"
        @click="store.setBaseLayer('street')"
      ><i class="ti ti-map-2"></i><span class="pill-text">Street</span></button>
      <button
        class="glass-pill"
        :class="{ active: state.currentBase === 'satellite' }"
        title="Satellite imagery"
        @click="store.setBaseLayer('satellite')"
      ><i class="ti ti-planet"></i><span class="pill-text">Satellite</span></button>

      <button
        class="glass-pill"
        :class="{ active: state.compareMode }"
        title="Compare two dates side by side"
        @click="state.compareMode = !state.compareMode"
      ><i class="ti ti-columns-3"></i><span class="pill-text">Compare</span></button>

      <div class="export-dropdown" ref="exportWrap">
        <button class="glass-pill" title="Export report" @click="toggleExportMenu">
          <i class="ti ti-download"></i><span class="pill-text">Export</span> <i class="ti ti-chevron-down"></i>
        </button>
        <div class="export-menu" v-show="exportMenuOpen">
          <button @click="chooseExport('png')">Export as PNG</button>
          <button @click="chooseExport('pdf')">Export as PDF</button>
        </div>
      </div>

      <button class="glass-pill" title="How this works" @click="state.helpVisible = true">
        <i class="ti ti-help"></i><span class="pill-text">Help</span>
      </button>

      <div
        v-if="state.supabaseUser || state.eeReady || !state.authOverlayVisible"
        class="topbar-user"
        :title="state.supabaseUser ? 'Signed in' : 'Sign in to sync fields'"
        @click="onUserClick"
      >
        <span class="user-email">{{ userLabel }}</span>
        <button v-if="state.supabaseUser" class="sign-out-btn" @click.stop="store.signOut()">Sign out</button>
      </div>

      <button class="glass-pill icon" title="My fields" @click="$emit('menu')">
        <i class="ti ti-menu-2"></i>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { state } from '../store'
import * as store from '../store'

defineEmits(['menu'])

const exportMenuOpen = ref(false)
const exportWrap = ref(null)
const searchQuery = ref('')

const userLabel = computed(() =>
  state.supabaseUser ? (state.supabaseUser.email || 'Signed in') : 'Sign in'
)

function onUserClick(e) {
  if (e.target.classList.contains('sign-out-btn')) return
  if (!state.supabaseUser || !state.eeReady) store.showAuthOverlay()
}

function toggleExportMenu() {
  exportMenuOpen.value = !exportMenuOpen.value
}

function chooseExport(fmt) {
  exportMenuOpen.value = false
  if (fmt === 'png') store.exportChart()
  else store.exportPdf()
}

function doSearch() {
  store.searchPlace(searchQuery.value)
}

function onDocClick(e) {
  if (exportWrap.value && !exportWrap.value.contains(e.target)) {
    exportMenuOpen.value = false
  }
}

onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))
</script>
