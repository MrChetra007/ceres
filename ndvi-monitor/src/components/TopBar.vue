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

    <div class="topbar-center">
      <button
        class="glass-pill"
        :class="{ active: state.compareMode }"
        :title="t('topbar.compare_title')"
        @click="state.compareMode = !state.compareMode"
      ><i class="ti ti-columns-3"></i><span class="pill-text">{{ t('topbar.compare') }}</span></button>
      <button
        class="glass-pill"
        :class="{ active: state.observationsVisible }"
        :title="t('obs.title')"
        @click="state.observationsVisible = !state.observationsVisible"
      ><i class="ti ti-satellite"></i><span class="pill-text">{{ t('obs.short') }}</span></button>
    </div>

    <div class="topbar-right">
      <span class="topbar-desktop-controls">
        <button class="glass-pill icon" :title="t('topbar.my_fields')" @click="$emit('menu')">
          <i class="ti ti-list-details"></i>
        </button>

        <div class="settings-dropdown" ref="settingsWrap">
          <button class="glass-pill icon" :title="t('topbar.settings')" @click="toggleSettingsMenu">
            <i class="ti ti-dots-vertical"></i>
          </button>
          <div class="settings-menu" v-show="settingsOpen" @click.stop>
            <button class="settings-item" @click="chooseExport('png')"><i class="ti ti-photo"></i>{{ t('topbar.export_png') }}</button>
            <button class="settings-item" @click="chooseExport('pdf')"><i class="ti ti-file-text"></i>{{ t('topbar.export_pdf') }}</button>
            <button class="settings-item" :class="{ on: state.telegramChatId }" @click="openTelegram">
              <i class="ti ti-brand-telegram"></i>{{ t('common.telegram_alerts') }}
              <span class="tg-status-dot" :class="{ on: state.telegramChatId }"></span>
            </button>
            <button class="settings-item" @click="state.helpVisible = true"><i class="ti ti-help"></i>{{ t('topbar.help') }}</button>
            <div class="settings-item lang-toggle">
              <i class="ti ti-language"></i>
              <span>{{ t('common.language') }}</span>
              <div class="lang-seg">
                <button :class="{ on: state.preferredLanguage === 'en' }" @click="setLang('en')">EN</button>
                <button :class="{ on: state.preferredLanguage === 'km' }" @click="setLang('km')">ខ្មែរ</button>
              </div>
            </div>
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
            <button v-if="state.supabaseUser" class="user-menu-item sign-out" @click="doSignOut">
              <i class="ti ti-logout"></i> {{ t('common.sign_out') }}
            </button>
          </div>
        </div>
      </span>

      <button class="glass-pill drawer-toggle" :title="t('topbar.settings')" @click="$emit('menu')" aria-label="Menu">
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

const settingsOpen = ref(false)
const settingsWrap = ref(null)
const userWrap = ref(null)
const userMenuOpen = ref(false)
const searchQuery = ref('')

const userLabel = computed(() =>
  state.supabaseUser ? (state.supabaseUser.email || t('topbar.signed_in')) : t('topbar.sign_in')
)

function onUserClick(e) {
  if (e.target.classList.contains('sign-out-btn')) return
  settingsOpen.value = false
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
  settingsOpen.value = false
  if (!state.supabaseUser) {
    store.showAuthOverlay()
    return
  }
  store.openTelegramModal()
}

function setLang(lang) {
  userMenuOpen.value = false
  settingsOpen.value = false
  store.setLanguage(lang)
}

function toggleSettingsMenu() {
  settingsOpen.value = !settingsOpen.value
  userMenuOpen.value = false
}

function chooseExport(fmt) {
  settingsOpen.value = false
  if (fmt === 'png') store.exportChart()
  else store.exportPdf()
}

function doSearch() {
  store.searchPlace(searchQuery.value)
}

function onDocClick(e) {
  if (settingsWrap.value && !settingsWrap.value.contains(e.target)) {
    settingsOpen.value = false
  }
  if (userWrap.value && !userWrap.value.contains(e.target)) {
    userMenuOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', onDocClick)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
})
</script>
