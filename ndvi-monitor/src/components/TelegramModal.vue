<template>
  <div id="telegram-modal" class="tg-overlay" v-show="state.telegramModalVisible" @click.self="close">
    <div class="tg-modal">
      <h3>{{ t('telegram.title') }}</h3>
      <p class="tg-desc">{{ t('telegram.desc') }}</p>

      <template v-if="state.telegramChatId">
        <div class="tg-linked">
          <div class="tg-status-icon"><i class="ti ti-brand-telegram"></i></div>
          <div>
            <strong>{{ t('telegram.connected') }}</strong>
            <span class="tg-muted">{{ t('telegram.linked_desc') }}</span>
          </div>
        </div>
        <div class="tg-footer">
          <button class="tg-cancel" @click="close">{{ t('common.close') }}</button>
          <button class="tg-danger" @click="doDisconnect" :disabled="disconnecting">
            {{ disconnecting ? t('telegram.disconnecting') : t('telegram.disconnect') }}
          </button>
        </div>
      </template>

      <template v-else-if="linkInfo">
        <div class="tg-steps">
          <div class="tg-step">
            <span class="tg-step-num">1</span>
            <span>{{ t('telegram.step1') }}<code>/start {{ linkInfo.code }}</code>{{ t('telegram.step1_end') }}</span>
          </div>
          <a class="tg-link" :href="linkInfo.link" target="_blank" rel="noopener">
            <i class="ti ti-brand-telegram"></i>
            t.me/{{ botUsername }}
          </a>
          <div class="tg-step">
            <span class="tg-step-num">2</span>
            <span>{{ t('telegram.tap') }}<strong>{{ t('common.start') }}</strong>{{ t('telegram.detect') }}</span>
          </div>
        </div>
        <p class="tg-wait"><i class="ti ti-loader" :class="{ spin: state.telegramLinking }"></i>
          {{ state.telegramLinking ? t('telegram.waiting_tg') : t('telegram.waiting') }}</p>
        <div class="tg-footer">
          <button class="tg-cancel" @click="close">{{ t('common.cancel') }}</button>
          <button class="tg-again" @click="newCode" :disabled="state.telegramLinking">{{ t('telegram.new_code') }}</button>
        </div>
      </template>

      <template v-else>
        <p class="tg-muted">{{ t('telegram.link_desc') }}</p>
        <div class="tg-footer">
          <button class="tg-cancel" @click="close">{{ t('common.cancel') }}</button>
          <button class="tg-connect" @click="start" :disabled="starting">{{ starting ? t('telegram.creating_link') : t('telegram.connect') }}</button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { state } from '../store'
import * as store from '../store'
import { TELEGRAM_BOT_USERNAME } from '../config'
import { useI18n } from '../i18n'

const { t } = useI18n()
const linkInfo = ref(null)
const starting = ref(false)
const disconnecting = ref(false)

const botUsername = computed(() => TELEGRAM_BOT_USERNAME)

watch(() => state.telegramModalVisible, (open) => {
  if (open) {
    linkInfo.value = null
    if (state.telegramChatId) store.stopTelegramPolling()
  }
})

async function start() {
  starting.value = true
  linkInfo.value = await store.connectTelegram()
  starting.value = false
}

function newCode() {
  linkInfo.value = null
  start()
}

async function doDisconnect() {
  disconnecting.value = true
  await store.disconnectTelegram()
  disconnecting.value = false
  linkInfo.value = null
}

function close() {
  store.closeTelegramModal()
}

onBeforeUnmount(() => store.stopTelegramPolling())
</script>
