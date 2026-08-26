<template>
  <div id="auth-overlay" class="auth-overlay" v-show="state.authOverlayVisible">
    <div class="auth-card">
      <button class="auth-close" :title="t('common.close')" @click="store.hideAuthOverlay()"><i class="ti ti-x"></i></button>

      <div class="auth-brand">
        <span class="auth-brand-icon"><i class="ti ti-leaf"></i></span>
      </div>
      <h2>{{ t('app.name') }}</h2>
      <p class="subtitle mono">BATTAMBANG · CAMBODIA</p>
      <p class="auth-tagline">{{ t('auth.tagline') }}</p>

      <div class="auth-fields">
        <div v-if="!state.supabaseUser" class="auth-section">
          <button class="auth-google-btn" @click="store.signInWithSupabaseGoogle()">
            <svg class="g-icon" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            <span>{{ t('auth.google') }}</span>
          </button>
          <p class="auth-hint">{{ t('auth.sync_hint') }}</p>
        </div>

        <div v-if="!state.supabaseUser" class="auth-divider"><span>{{ t('auth.or_email') }}</span></div>

        <div v-if="!state.supabaseUser" class="auth-section">
          <div class="auth-tabs" role="tablist">
            <button
              class="auth-tab"
              :class="{ active: authMode === 'signin' }"
              :aria-selected="authMode === 'signin'"
              @click="setAuthMode('signin')"
            >{{ t('auth.tab_sign_in') }}</button>
            <button
              class="auth-tab"
              :class="{ active: authMode === 'signup' }"
              :aria-selected="authMode === 'signup'"
              @click="setAuthMode('signup')"
            >{{ t('auth.tab_create_account') }}</button>
          </div>

          <div class="auth-field">
            <label class="auth-label" for="auth-email">{{ t('auth.email') }}</label>
            <input
              id="auth-email"
              class="auth-input"
              type="email"
              autocomplete="email"
              :placeholder="t('auth.email_placeholder')"
              v-model="email"
              @input="authError = ''"
            />
          </div>

          <div class="auth-field">
            <label class="auth-label" for="auth-password">{{ t('auth.password') }}</label>
            <input
              id="auth-password"
              class="auth-input"
              type="password"
              :autocomplete="authMode === 'signup' ? 'new-password' : 'current-password'"
              :placeholder="t('auth.password_placeholder')"
              v-model="password"
              @input="authError = ''"
              @keydown.enter="submitEmailAuth"
            />
          </div>

          <p v-if="authError" class="auth-error" role="alert">{{ authError }}</p>

          <button class="auth-email-btn" :disabled="authSubmitting" @click="submitEmailAuth">
            <span v-if="authSubmitting" class="auth-spinner" aria-hidden="true"></span>
            {{ authSubmitting ? t('auth.submitting') : (authMode === 'signin' ? t('auth.tab_sign_in') : t('auth.tab_create_account')) }}
          </button>
        </div>
      </div>

      <div class="auth-skip">
        <button class="auth-skip-btn" @click="store.hideAuthOverlay()">{{ t('auth.explore') }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { state } from '../store'
import * as store from '../store'
import { useI18n } from '../i18n'

const { t } = useI18n()

const authMode = ref('signin')
const email = ref('')
const password = ref('')
const authError = ref('')
const authSubmitting = ref(false)

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function setAuthMode(mode) {
  authMode.value = mode
  authError.value = ''
}

function validate() {
  const em = email.value.trim()
  if (!EMAIL_RE.test(em)) {
    authError.value = t('auth.err_email')
    return false
  }
  if (password.value.length < 6) {
    authError.value = t('auth.err_password')
    return false
  }
  return true
}

async function submitEmailAuth() {
  if (authSubmitting.value) return
  authError.value = ''
  if (!validate()) return
  authSubmitting.value = true
  try {
    const res = authMode.value === 'signin'
      ? await store.signInWithEmailPassword(email.value.trim(), password.value)
      : await store.signUpWithEmail(email.value.trim(), password.value)
    if (res && res.error) {
      authError.value = res.error.message || t('auth.err_generic')
      return
    }
    // Success: the store's onAuthStateChange listener fires SIGNED_IN and
    // loads fields/AOIs. Signing in also unlocks satellite data (ee-data Edge
    // Function), so the overlay closes and the map loads — one login for
    // everything.
    password.value = ''
  } finally {
    authSubmitting.value = false
  }
}
</script>
