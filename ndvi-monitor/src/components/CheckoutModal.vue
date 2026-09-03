<template>
  <div class="help-overlay" v-show="state.checkoutTier" @click.self="store.closeCheckout()">
    <div class="bb-modal bb-checkout">
      <div class="bb-header">
        <h3>{{ t('subs.checkout_title', { plan: t(planKey) }) }}</h3>
        <button class="bb-close" @click="store.closeCheckout()"><i class="ti ti-x"></i></button>
      </div>

      <div class="bb-body centered">
        <template v-if="phase === 'idle'">
          <div class="co-plan-icon"><i class="ti ti-crown"></i></div>
          <div class="co-plan-name">{{ t(planKey) }}</div>
          <div class="co-price">{{ t(priceKey) }}</div>
          <p v-if="state.checkoutTier === 'coop'" class="co-rule">{{ t('subs.coop_note') }}</p>

          <p class="co-what-you-get"><b>{{ t(planKey) }}</b> — {{ t(descKey) }}</p>

          <div class="co-actions">
            <button class="bb-btn primary" :disabled="working" @click="confirm">
              <i class="ti ti-check"></i>{{ t('subs.confirm_subscribe') }}
            </button>
            <button class="bb-btn" @click="store.closeCheckout()">{{ t('common.cancel') }}</button>
          </div>
        </template>

        <template v-else-if="phase === 'paying'">
          <div class="co-plan-icon"><i class="ti ti-qrcode"></i></div>
          <div class="co-plan-name">{{ t(planKey) }}</div>
          <div class="co-price">{{ t(priceKey) }}</div>

          <div class="co-qr-wrap">
            <img v-if="qrImage" class="co-qr" :src="qrImage" :alt="t('subs.pay_qr_alt')" />
            <div v-else class="co-qr co-qr-empty"><i class="ti ti-loader-2 ti-spin"></i></div>
          </div>

          <p class="co-pay-hint">{{ t('subs.pay_scan_or_open') }}</p>

          <div class="co-actions">
            <a
              v-if="abapayDeeplink"
              class="bb-btn primary co-open-aba"
              :href="abapayDeeplink"
              @click.prevent="openAba"
            >
              <i class="ti ti-device-mobile"></i>{{ t('subs.pay_open_aba') }}
            </a>
            <div class="co-store-links" v-if="appStore || playStore">
              <a v-if="appStore" :href="appStore" target="_blank" rel="noopener" class="co-store">
                {{ t('subs.pay_app_store') }}
              </a>
              <a v-if="playStore" :href="playStore" target="_blank" rel="noopener" class="co-store">
                {{ t('subs.pay_play_store') }}
              </a>
            </div>
            <p class="co-waiting"><i class="ti ti-loader-2 ti-spin"></i>{{ t('subs.pay_waiting') }}</p>
            <button class="bb-btn" @click="store.closeCheckout()">{{ t('common.cancel') }}</button>
          </div>
        </template>

        <template v-else-if="phase === 'approved'">
          <div class="co-plan-icon co-ok"><i class="ti ti-circle-check"></i></div>
          <div class="co-plan-name">{{ t('subs.pay_success_title') }}</div>
          <p class="co-what-you-get">{{ t('subs.checkout_success', { plan: t(planKey) }) }}</p>
          <div class="co-actions">
            <button class="bb-btn primary" @click="store.closeCheckout()">{{ t('common.close') }}</button>
          </div>
        </template>

        <template v-else>
          <div class="co-plan-icon co-err"><i class="ti ti-alert-triangle"></i></div>
          <div class="co-plan-name">{{ t('subs.pay_failed_title') }}</div>
          <p class="co-what-you-get">
            {{ phase === 'expired' ? t('subs.pay_expired') : t('subs.pay_failed') }}
          </p>
          <div class="co-actions">
            <button class="bb-btn primary" @click="startPayment">
              <i class="ti ti-refresh"></i>{{ t('subs.pay_retry') }}
            </button>
            <button class="bb-btn" @click="store.closeCheckout()">{{ t('common.cancel') }}</button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'
import { state } from '../store'
import * as store from '../store'
import { useI18n } from '../i18n'
import { startAbaCheckout, waitForPayment, sb } from '../services/supabase'

const { t } = useI18n()
const working = ref(false)
const phase = ref('idle')
const qrImage = ref('')
const abapayDeeplink = ref('')
const appStore = ref('')
const playStore = ref('')
let tranId = ''
let pollToken = 0

const PLAN_KEYS = { individual: 'subs.individual', coop: 'subs.coop' }
const PRICE_KEYS = { individual: 'subs.individual_price', coop: 'subs.coop_price' }
const DESC_KEYS = { individual: 'subs.individual_desc', coop: 'subs.coop_desc' }

const planKey = computed(() => PLAN_KEYS[state.checkoutTier] || 'subs.individual')
const priceKey = computed(() => PRICE_KEYS[state.checkoutTier] || 'subs.individual_price')
const descKey = computed(() => DESC_KEYS[state.checkoutTier] || 'subs.individual_desc')

// Reset the payment sheet each time the checkout is (re)opened.
function reset() {
  phase.value = 'idle'
  working.value = false
  qrImage.value = ''
  abapayDeeplink.value = ''
  appStore.value = ''
  playStore.value = ''
  tranId = ''
  pollToken = 0
}

// Kick off a fresh ABA KHQR purchase for the current tier and start watching it.
async function startPayment() {
  if (!state.checkoutTier || working.value) return
  working.value = true
  phase.value = 'paying'
  qrImage.value = ''
  abapayDeeplink.value = ''
  appStore.value = ''
  playStore.value = ''
  try {
    const data = await startAbaCheckout(state.checkoutTier)
    tranId = data.tran_id
    qrImage.value = data.qrImage || ''
    abapayDeeplink.value = data.abapay_deeplink || ''
    appStore.value = data.app_store || ''
    playStore.value = data.play_store || ''
    watchPayment()

    // TEMP: dev-only payment simulation — remove this block before production launch.
    if (import.meta.env.DEV) {
      setTimeout(async () => {
        const { data, error } = await sb.functions.invoke('simulate-payment', {
          body: { tran_id: tranId },
        })
        if (error) console.error('[simulate-payment]', error)
      }, 2000)
    }
  } catch (e) {
    phase.value = 'failed'
    store.showToast(t('subs.checkout_failed') + (e.message ? ': ' + e.message : ''))
  } finally {
    working.value = false
  }
}

// Poll the authoritative payment_transactions row until approved/failed/timeout.
// A token guards against a stale watcher firing after the user re-opens checkout.
async function watchPayment() {
  const token = ++pollToken
  const status = await waitForPayment(tranId, { intervalMs: 3000, timeoutMs: 120000 })
  // Refresh the plan state even if the modal was closed mid-payment — the tier
  // flip still landed on the server, so the limits must update regardless.
  if (status === 'approved') {
    await store.refreshPlanState()
    if (token === pollToken && phase.value === 'paying') phase.value = 'approved'
    store.showToast(t('subs.checkout_success', { plan: t(planKey.value) }))
  } else if (status === 'failed') {
    if (token === pollToken && phase.value === 'paying') phase.value = 'failed'
  } else {
    if (token === pollToken && phase.value === 'paying') {
      phase.value = 'expired'
      store.showToast(t('subs.pay_expired'))
    }
  }
}

// "Open ABA Mobile": try the deeplink; if the app isn't installed the browser
// just won't navigate away, so fall back to the store links after a short wait.
function openAba() {
  if (!abapayDeeplink.value) return
  const timer = setTimeout(() => {
    if (!document.hidden) {
      // Still on this tab — the deeplink didn't open another app. Let the user
      // pick a store link instead; the store buttons are already shown below.
      store.showToast(t('subs.pay_deeplink_miss'))
    }
  }, 1800)
  const onVis = () => {
    if (document.hidden) clearTimeout(timer)
    window.removeEventListener('visibilitychange', onVis)
  }
  window.addEventListener('visibilitychange', onVis)
  // The scheme handler opens ABA Mobile without our tab navigating away (we
  // stay put and watch the payment row).
  window.open(abapayDeeplink.value, '_blank', 'noopener')
}

async function confirm() {
  if (!state.checkoutTier || working.value) return
  // startPayment() manages the working flag itself (it also powers retry).
  await startPayment()
}

watch(() => state.checkoutTier, (tier) => {
  pollToken = 0
  if (tier) reset()
})

onUnmounted(() => {
  pollToken = 0
})
</script>

<style scoped>
.bb-modal {
  background: var(--panel-2);
  border: 0.5px solid var(--panel-border-strong);
  color: var(--text);
}
.bb-checkout {
  width: 92%;
  max-width: 420px;
  max-height: 90vh;
  overflow-y: auto;
}
.bb-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem 0.6rem;
  border-bottom: 0.5px solid var(--panel-border);
}
.bb-header h3 {
  margin: 0;
  font-size: 1.05rem;
  color: var(--text);
}
.bb-close {
  background: transparent;
  border: none;
  color: var(--text-dim);
  font-size: 1.15rem;
  cursor: pointer;
  padding: 4px;
}
.bb-close:hover {
  color: var(--text);
}
.bb-body.centered {
  text-align: center;
  padding: 1.5rem 1.25rem;
}
.co-plan-icon {
  font-size: 2.2rem;
  color: var(--accent);
  margin-bottom: 6px;
}
.co-plan-icon.co-ok {
  color: var(--success, var(--accent));
}
.co-plan-icon.co-err {
  color: var(--red, #ff5c6c);
}
.co-plan-name {
  font-size: 1.3rem;
  font-weight: 700;
}
.co-price {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--accent);
  margin-top: 4px;
}
.co-rule {
  font-size: 0.78rem;
  color: var(--text-faint);
  margin: 2px 0 14px;
}
.co-what-you-get {
  font-size: 0.85rem;
  color: var(--text-dim);
  margin: 0 0 18px;
}
.co-what-you-get b {
  color: var(--text);
}
.co-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.bb-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 14px;
  border-radius: var(--radius-md);
  border: 0.5px solid var(--panel-border-strong);
  background: rgba(255, 255, 255, 0.06);
  color: var(--text);
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
  text-decoration: none;
}
.bb-btn.primary {
  background: var(--accent);
  color: #0b0f14;
  border-color: transparent;
}
.bb-btn.primary:hover:not([disabled]) {
  background: #1bb37d;
}
.bb-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.co-qr-wrap {
  margin: 16px auto;
  padding: 12px;
  background: #fff;
  border-radius: var(--radius-lg, 12px);
  display: inline-block;
}
.co-qr {
  display: block;
  width: 200px;
  height: 200px;
  image-rendering: pixelated;
}
.co-qr-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #0b0f14;
  font-size: 1.6rem;
}
.co-pay-hint {
  font-size: 0.85rem;
  color: var(--text-dim);
  margin: 0 0 16px;
}
.co-store-links {
  display: flex;
  gap: 8px;
  justify-content: center;
}
.co-store {
  font-size: 0.78rem;
  color: var(--accent);
  text-decoration: none;
}
.co-waiting {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 0.82rem;
  color: var(--text-faint);
  margin: 4px 0;
}
</style>
