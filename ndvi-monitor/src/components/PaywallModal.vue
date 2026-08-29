<template>
  <div class="help-overlay" v-show="state.paywall.visible" @click.self="store.hidePaywall()">
    <div class="bb-modal bb-paywall">
      <div class="bb-header">
        <h3>{{ t('subs.your_plan', { plan: t(tierKey) }) }}</h3>
        <button class="bb-close" @click="store.hidePaywall()"><i class="ti ti-x"></i></button>
      </div>

      <div class="bb-body centered">
        <div class="pw-icon" :class="reason"><i class="ti ti-lock"></i></div>
        <p class="pw-message">{{ t(messageKey) }}</p>

        <div class="pw-actions">
          <button class="bb-btn primary" @click="seePlans">
            <i class="ti ti-crown"></i>{{ t('subs.see_plans') }}
          </button>
          <button class="bb-btn" @click="store.hidePaywall()">{{ t('subs.got_it') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { state } from '../store'
import * as store from '../store'
import { useI18n } from '../i18n'

const { t } = useI18n()

const REASON_KEYS = {
  aoi: 'subs.aoi_cap_reached',
  hectare: 'subs.hectare_cap_reached',
  ai: 'subs.ai_not_in_plan',
}

const reason = computed(() => state.paywall.reason || 'aoi')
const messageKey = computed(() => REASON_KEYS[reason.value] || 'subs.aoi_cap_reached')
const tierKey = computed(() => {
  const map = { free: 'subs.free', individual: 'subs.individual', coop: 'subs.coop' }
  return map[state.subscription.tier] || 'subs.free'
})

function seePlans() {
  store.hidePaywall()
  store.goToPricing()
}
</script>

<style scoped>
.bb-modal {
  background: var(--panel-2);
  border: 0.5px solid var(--panel-border-strong);
  color: var(--text);
}
.bb-paywall {
  width: 92%;
  max-width: 380px;
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
  font-size: 1.02rem;
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
  padding: 1.6rem 1.25rem;
}
.pw-icon {
  width: 56px;
  height: 56px;
  margin: 0 auto 14px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  background: var(--amber-dim);
  color: var(--amber);
}
.pw-icon.ai {
  background: var(--accent-dim);
  color: var(--accent);
}
.pw-icon.hectare {
  background: var(--blue);
  color: #0b0f14;
}
.pw-message {
  font-size: 0.92rem;
  color: var(--text-dim);
  line-height: 1.5;
  margin: 0 0 20px;
}
.pw-actions {
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
.bb-btn.primary:hover {
  background: #1bb37d;
}
</style>