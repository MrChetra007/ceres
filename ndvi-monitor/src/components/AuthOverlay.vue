<template>
  <div id="auth-overlay" class="auth-overlay" v-show="state.authOverlayVisible">
    <div class="auth-card">
      <h2>NDVI Rice Crop Health Monitor</h2>
      <p class="subtitle">Battambang, Cambodia</p>
      <div class="auth-fields">
        <div v-if="!state.supabaseUser" class="auth-section">
          <label class="auth-label" for="auth-email">Sign in to sync your fields</label>
          <input type="email" id="auth-email" v-model="email" placeholder="you@email.com" @keydown.enter="sendLink" />
          <button class="auth-email-btn" :disabled="sending" @click="sendLink">{{ sending ? 'Sending...' : 'Send magic link' }}</button>
          <p class="auth-message" :class="{ error: messageError }">{{ message }}</p>
        </div>
        <div v-if="!state.eeReady && !state.supabaseUser" class="auth-divider"><span>or</span></div>
        <div v-if="!state.eeReady" class="auth-section">
          <label class="auth-label">Connect satellite data</label>
          <button id="sign-in-btn" @click="store.authenticate()">Sign in with Google</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { state } from '../store'
import * as store from '../store'

const email = ref('')
const message = ref('')
const messageError = ref(false)
const sending = ref(false)

async function sendLink() {
  if (!email.value.trim()) {
    message.value = 'Enter your email first.'
    messageError.value = true
    return
  }
  sending.value = true
  message.value = ''
  const res = await store.sendMagicLink(email.value)
  sending.value = false
  if (res && res.error) {
    message.value = res.error.message
    messageError.value = true
    return
  }
  message.value = 'Magic link sent \u2014 check your inbox.'
  messageError.value = false
}
</script>
