<template>
  <div id="telegram-modal" class="tg-overlay" v-show="state.telegramModalVisible" @click.self="close">
    <div class="tg-modal">
      <h3>Telegram alerts</h3>
      <p class="tg-desc">Get a message on Telegram when one of your fields hits a stress state.</p>

      <template v-if="state.telegramChatId">
        <div class="tg-linked">
          <div class="tg-status-icon"><i class="ti ti-brand-telegram"></i></div>
          <div>
            <strong>Connected</strong>
            <span class="tg-muted">Stress alerts are sent to your linked Telegram chat.</span>
          </div>
        </div>
        <div class="tg-footer">
          <button class="tg-cancel" @click="close">Close</button>
          <button class="tg-danger" @click="doDisconnect" :disabled="disconnecting">
            {{ disconnecting ? 'Disconnecting...' : 'Disconnect Telegram' }}
          </button>
        </div>
      </template>

      <template v-else-if="linkInfo">
        <div class="tg-steps">
          <div class="tg-step">
            <span class="tg-step-num">1</span>
            <span>Open this link (or send <code>/start {{ linkInfo.code }}</code> to the bot in Telegram):</span>
          </div>
          <a class="tg-link" :href="linkInfo.link" target="_blank" rel="noopener">
            <i class="ti ti-brand-telegram"></i>
            t.me/{{ botUsername }}
          </a>
          <div class="tg-step">
            <span class="tg-step-num">2</span>
            <span>Tap <strong>Start</strong> — we'll detect it automatically.</span>
          </div>
        </div>
        <p class="tg-wait"><i class="ti ti-loader" :class="{ spin: state.telegramLinking }"></i>
          {{ state.telegramLinking ? 'Waiting for Telegram...' : 'Waiting...' }}</p>
        <div class="tg-footer">
          <button class="tg-cancel" @click="close">Cancel</button>
          <button class="tg-again" @click="newCode" :disabled="state.telegramLinking">Generate a new code</button>
        </div>
      </template>

      <template v-else>
        <p class="tg-muted">Link your Telegram account so the nightly field check can notify you here.</p>
        <div class="tg-footer">
          <button class="tg-cancel" @click="close">Cancel</button>
          <button class="tg-connect" @click="start" :disabled="starting">{{ starting ? 'Creating link...' : 'Connect Telegram' }}</button>
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
