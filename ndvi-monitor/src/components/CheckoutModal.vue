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
import { upgradeSubscription } from '../services/supabase'

const { t } = useI18n()
const working = ref(false)

const PLAN_KEYS = { individual: 'subs.individual', coop: 'subs.coop' }
const PRICE_KEYS = { individual: 'subs.individual_price', coop: 'subs.coop_price' }
const DESC_KEYS = { individual: 'subs.individual_desc', coop: 'subs.coop_desc' }

const planKey = computed(() => PLAN_KEYS[state.checkoutTier] || 'subs.individual')
const priceKey = computed(() => PRICE_KEYS[state.checkoutTier] || 'subs.individual_price')
const descKey = computed(() => DESC_KEYS[state.checkoutTier] || 'subs.individual_desc')

// ---------------------------------------------------------------------------
// PLACEHOLDER checkout payment function — THE single swap point for real ABA
// PayWay later. Today it grants the tier directly in the DB via
// upgrade_my_subscription() with NO real payment (ABA sandbox is blocked).
// To wire in real billing, replace only the body of this function with a call
// to ABA's Purchase API (or a redirect to their hosted checkout); nothing else
// in this component or the store needs to change.
async function initiatePayment(tier) {
  await upgradeSubscription(tier)
}

async function confirm() {
  if (!state.checkoutTier || working.value) return
  working.value = true
  try {
    await store.confirmCheckout(state.checkoutTier)
    store.showToast(t('subs.checkout_success', { plan: t(planKey.value) }))
    store.openPlanBillingModal()
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