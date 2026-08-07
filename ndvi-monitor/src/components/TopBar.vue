<template>
  <div class="topbar">
    <div class="topbar-left">
      <div class="brand-chip">
        <span class="brand-icon"><i class="ti ti-leaf"></i></span>
        <div class="brand-text">
          <span class="brand-name">{{ t('app.name') }}</span>
          <span class="brand-loc mono">BATTAMBANG · {{ fieldCountLabel }}</span>
        </div>
      </div>
      <div class="place-search">
        <i class="ti ti-search"></i>
        <input
          type="text"
          v-model="searchQuery"
          :placeholder="t('topbar.search_place')"
          @keydown.enter="doSearch"
        />
      </div>
    </div>

    <div class="topbar-right">
      <button
        class="glass-pill"
        :class="{ active: state.currentBase === 'street' }"
        :title="t('topbar.street_map')"
        @click="store.setBaseLayer('street')"
      ><i class="ti ti-map-2"></i><span class="pill-text">{{ t('topbar.street') }}</span></button>
      <button
        class="glass-pill"
        :class="{ active: state.currentBase === 'satellite' }"
        :title="t('topbar.satellite_imagery')"
        @click="store.setBaseLayer('satellite')"
      ><i class="ti ti-planet"></i><span class="pill-text">{{ t('topbar.satellite') }}</span></button>

      <button
        class="glass-pill"
        :class="{ active: state.compareMode }"
        :title="t('topbar.compare_title')"
        @click="state.compareMode = !state.compareMode"
      ><i class="ti ti-columns-3"></i><span class="pill-text">{{ t('topbar.compare') }}</span></button>

      <div class="export-dropdown" ref="exportWrap">
        <button class="glass-pill" :title="t('topbar.export_report')" @click="toggleExportMenu">
          <i class="ti ti-download"></i><span class="pill-text">{{ t('topbar.export') }}</span> <i class="ti ti-chevron-down"></i>
        </button>
        <div class="export-menu" v-show="exportMenuOpen">
          <button @click="chooseExport('png')">{{ t('topbar.export_png') }}</button>
          <button @click="chooseExport('pdf')">{{ t('topbar.export_pdf') }}</button>
        </div>
      </div>

      <button
        class="glass-pill"
        :class="{ active: state.telegramChatId }"
        :title="t('common.telegram_alerts')"
        @click="openTelegram"
      ><i class="ti ti-brand-telegram"></i><span class="pill-text">{{ t('common.telegram_alerts') }}</span><i class="tg-pill-dot" :class="{ on: state.telegramChatId }"></i></button>

      <button class="glass-pill" :title="t('topbar.how_this_works')" @click="state.helpVisible = true">
        <i class="ti ti-help"></i><span class="pill-text">{{ t('topbar.help') }}</span>
      </button>

      <div class="glass-pill lang-pill" :title="t('common.language')">
        <i class="ti ti-language"></i>
        <div class="lang-seg">
          <button :class="{ on: state.preferredLanguage === 'en' }" @click="setLang('en')">EN</button>
          <button :class="{ on: state.preferredLanguage === 'km' }" @click="setLang('km')">ខ្មែរ</button>
        </div>
      </div>

      <div
        v-if="state.supabaseUser || state.eeReady || !state.authOverlayVisible"
        ref="userWrap"
        class="topbar-user"
        :class="{ 'menu-open': userMenuOpen }"
        :title="state.supabaseUser ? t('topbar.signed_in') : t('topbar.sign_in_sync')"
        @click="onUserClick"
      >
        <i class="ti ti-user"></i>
        <span class="user-email">{{ userLabel }}</span>
        <button v-if="state.supabaseUser" class="sign-out-btn" @click.stop="doSignOut">{{ t('common.sign_out') }}</button>
        <div class="topbar-user-menu" v-show="userMenuOpen" @click.stop>
          <span class="user-menu-email">{{ userLabel }}</span>
          <button class="user-menu-item" @click="openTelegram">
            <i class="ti ti-brand-telegram"></i>
            {{ t('common.telegram_alerts') }}
            <span class="tg-status-dot" :class="{ on: state.telegramChatId }"></span>
          </button>
          <div class="user-menu-item lang-toggle">
            <i class="ti ti-language"></i>
            <span>{{ t('common.language') }}</span>
            <div class="lang-seg">
              <button :class="{ on: state.preferredLanguage === 'en' }" @click="setLang('en')">EN</button>
              <button :class="{ on: state.preferredLanguage === 'km' }" @click="setLang('km')">ខ្មែរ</button>
            </div>
          </div>
          <button v-if="state.supabaseUser" class="user-menu-item sign-out" @click="doSignOut">
            <i class="ti ti-logout"></i> {{ t('common.sign_out') }}
          </button>
        </div>
      </div>

      <button class="glass-pill icon" :title="t('topbar.my_fields')" @click="$emit('menu')">
        <i class="ti ti-menu-2"></i>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { state } from '../store'
import * as store from '../store'
import { useI18n } from '../i18n'

defineEmits(['menu'])

const { t } = useI18n()

const fieldCountLabel = computed(() => {
  const n = state.fields.length
  if (n === 1) return '1 ' + t('app.monitored_field')
  return n + ' ' + t('app.monitored_fields')
})

const exportMenuOpen = ref(false)
const exportWrap = ref(null)
const userWrap = ref(null)
const userMenuOpen = ref(false)
const searchQuery = ref('')

const userLabel = computed(() =>
  state.supabaseUser ? (state.supabaseUser.email || t('topbar.signed_in')) : t('topbar.sign_in')
)

function onUserClick(e) {
  if (e.target.classList.contains('sign-out-btn')) return
  if (state.supabaseUser && state.eeReady) {
    userMenuOpen.value = !userMenuOpen.value
    return
  }
  store.showAuthOverlay()
}

function doSignOut() {
  userMenuOpen.value = false
  store.signOut()
}

function openTelegram() {
  userMenuOpen.value = false
  if (!state.supabaseUser) {
    store.showAuthOverlay()
    return
  }
  store.openTelegramModal()
}

function setLang(lang) {
  userMenuOpen.value = false
  store.setLanguage(lang)
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
  if (userWrap.value && !userWrap.value.contains(e.target)) {
    userMenuOpen.value = false
  }
}

onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))
</script>