<template>
  <div class="help-overlay" v-show="state.checkoutTier" @click.self="store.closeCheckout()">
    <div class="bb-modal bb-checkout">
      <div class="bb-header">
        <h3>{{ t('subs.checkout_title', { plan: t(planKey) }) }}</h3>
        <button class="bb-close" @click="store.closeCheckout()"><i class="ti ti-x"></i></button>
      </div>

      <div class="bb-body centered">
        <div class="co-plan-icon"><i class="ti ti-crown"></i></div>
        <div class="co-plan-name">{{ t(planKey) }}</div>
        <div class="co-price">{{ t(priceKey) }}</div>
        <p v-if="state.checkoutTier === 'coop'" class="co-rule">{{ t('subs.coop_note') }}</p>

        <div class="co-placeholder">
          <i class="ti ti-info-circle"></i>
          {{ t('subs.checkout_placeholder_note') }}
        </div>

        <p class="co-what-you-get"><b>{{ t(planKey) }}</b> — {{ t(descKey) }}</p>

        <div class="co-actions">
          <button class="bb-btn primary" :disabled="working" @click="confirm">
            <i class="ti ti-check"></i>{{ t('subs.confirm_subscribe') }}
          </button>
          <button class="bb-btn" @click="store.closeCheckout()">{{ t('common.cancel') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { state } from '../store'
import * as store from '../store'
import { useI18n } from '../i18n'
import { startAbaCheckout } from '../services/supabase'

const { t } = useI18n()
const working = ref(false)

const PLAN_KEYS = { individual: 'subs.individual', coop: 'subs.coop' }
const PRICE_KEYS = { individual: 'subs.individual_price', coop: 'subs.coop_price' }
const DESC_KEYS = { individual: 'subs.individual_desc', coop: 'subs.coop_desc' }

const planKey = computed(() => PLAN_KEYS[state.checkoutTier] || 'subs.individual')
const priceKey = computed(() => PRICE_KEYS[state.checkoutTier] || 'subs.individual_price')
const descKey = computed(() => DESC_KEYS[state.checkoutTier] || 'subs.individual_desc')

// ---------------------------------------------------------------------------
// REAL ABA PayWay hosted checkout. Calls the initiate-payment Edge Function to
// get a server-computed Purchase payload + HMAC-SHA512 signature, then lets the
// browser POST that form to ABA's hosted checkout (bottom-sheet via the
// AbaPayway plugin when available, else a plain form redirect). No amount is
// ever trusted from the client — it's looked up from subscription_prices on the
// server.
async function initiatePayment(tier) {
  const data = await startAbaCheckout(tier)

  // Build a hidden form mirroring ABA's sample — same field names/order that
  // the Edge Function hashed.
  const form = document.createElement('form')
  form.method = 'POST'
  form.action = data.checkout_url
  form.style.display = 'none'
  form.id = 'aba-checkout-form'
  for (const [name, value] of Object.entries(data.fields)) {
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = name
    input.value = value
    form.appendChild(input)
  }
  const hashInput = document.createElement('input')
  hashInput.type = 'hidden'
  hashInput.name = 'hash'
  hashInput.value = data.hash
  form.appendChild(hashInput)
  document.body.appendChild(form)

  // Prefer ABA's hosted checkout bottom-sheet for the dark in-app feel; fall
  // back to a plain submit if the plugin script can't load. Removed after
  // redirect so repeated checkouts always build a fresh form.
  try {
    await loadAbaCheckoutScript(data.checkout_script)
    if (typeof window.AbaPayway !== 'undefined') {
      window.AbaPayway.checkout({
        checkoutUrl: data.checkout_url,
        key: data.hash,
        ...data.fields,
      })
      return
    }
  } catch (e) {
    console.warn('[checkout] AbaPayway plugin unavailable, falling back to form submit', e)
  }
  form.submit()
}

// Load ABA's checkout plugin once. This single script URL works for both
// sandbox and production — do NOT swap it for ABA_API_BASE_URL.
function loadAbaCheckoutScript(src) {
  if (window.__abaScriptLoaded) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = src
    s.async = true
    s.onload = () => { window.__abaScriptLoaded = true; resolve() }
    s.onerror = () => reject(new Error('failed to load ABA checkout script'))
    document.head.appendChild(s)
  })
}

async function confirm() {
  if (!state.checkoutTier || working.value) return
  working.value = true
  try {
    await initiatePayment(state.checkoutTier)
    // On redirect back from ABA (/billing?status=success|cancelled) the subscription
    // is re-fetched and the plan modal shown; tier flip already happened server-side
    // via the webhook, so this is just a UI sync. The plugin may open an in-app
    // overlay rather than navigate away — resetting state keeps the modal usable.
    store.closeCheckout()
  } catch (e) {
    store.showToast(t('subs.checkout_failed') + (e.message ? ': ' + e.message : ''))
  } finally {
    working.value = false
  }
}

watch(() => state.checkoutTier, () => {
  working.value = false
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
.co-placeholder {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--amber-dim);
  color: var(--amber);
  border-radius: var(--radius-md);
  padding: 10px 12px;
  font-size: 0.82rem;
  text-align: left;
  margin-bottom: 12px;
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
</style>