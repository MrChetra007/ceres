<template>
  <div class="pricing-cards">
    <div
      v-for="card in cards"
      :key="card.tier"
      class="pricing-card"
      :class="{ recommended: card.recommended, current: isCurrent(card.tier) }"
    >
      <div class="pc-top">
        <h3 class="pc-name">{{ t(card.nameKey) }}</h3>
        <div class="pc-price">{{ t(card.priceKey) }}</div>
      </div>
      <p class="pc-desc">{{ t(card.descKey) }}</p>

      <ul class="pc-features">
        <li v-for="f in card.features" :key="f">
          <i class="ti ti-check"></i>{{ t(f) }}
        </li>
        <li v-for="f in card.notIncluded" :key="f" class="missing">
          <i class="ti ti-x"></i>{{ t(f) }}
        </li>
      </ul>

      <div class="pc-action">
        <button v-if="isCurrent(card.tier)" class="pc-btn current" @click="store.openPlanBillingModal()">
          <i class="ti ti-check"></i>{{ t('subs.plan_current') }}
        </button>
        <template v-else>
          <button v-if="card.tier === 'free'" class="pc-btn" @click="onFree">
            {{ t('subs.get_started') }}
          </button>
          <button v-else class="pc-btn primary" @click="store.openCheckout(card.tier)">
            {{ t('subs.subscribe') }}
          </button>
        </template>
      </div>

      <p v-if="card.tier === 'coop'" class="pc-coop-note">{{ t('subs.coop_note') }}</p>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { state } from '../store'
import * as store from '../store'
import { useI18n } from '../i18n'

const { t } = useI18n()

// Marketing copy for the 3-tier comparison. Limits (AOI count, hectares, AI
// access) mirror the tier defaults in add_subscription_tiers.sql — that SQL
// block is the single source of truth; update both together.
const cards = [
  {
    tier: 'free',
    nameKey: 'subs.free',
    priceKey: 'subs.free_price',
    descKey: 'subs.free_desc',
    features: ['subs.feat_core', 'subs.feat_weather', 'subs.feat_telegram', 'subs.feat_free_areas', 'subs.feat_free_hectares'],
    notIncluded: ['subs.feat_free_ai'],
    recommended: false,
  },
  {
    tier: 'individual',
    nameKey: 'subs.individual',
    priceKey: 'subs.individual_price',
    descKey: 'subs.individual_desc',
    features: ['subs.feat_core', 'subs.feat_weather', 'subs.feat_telegram', 'subs.feat_ind_areas', 'subs.feat_ind_hectares', 'subs.feat_ind_ai'],
    notIncluded: [],
    recommended: true,
  },
  {
    tier: 'coop',
    nameKey: 'subs.coop',
    priceKey: 'subs.coop_price',
    descKey: 'subs.coop_desc',
    features: ['subs.feat_core', 'subs.feat_weather', 'subs.feat_telegram', 'subs.feat_coop_areas', 'subs.feat_coop_hectares', 'subs.feat_coop_ai'],
    notIncluded: [],
    recommended: false,
  },
]

function isCurrent(tier) {
  return !!state.supabaseUser && state.subscription.tier === tier
}

function onFree() {
  if (state.supabaseUser) store.openPlanBillingModal()
  else store.goToMap()
}
</script>

<style scoped>
.pricing-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 16px;
  max-width: 1000px;
  margin: 0 auto;
}
.pricing-card {
  background: var(--panel-2);
  border: 0.5px solid var(--panel-border-strong);
  border-radius: var(--radius-lg);
  padding: 20px;
  display: flex;
  flex-direction: column;
  color: var(--text);
  box-shadow: var(--shadow);
}
.pricing-card.recommended {
  border-color: rgba(34, 201, 142, 0.55);
  background: var(--panel-3);
}
.pricing-card.current {
  border-color: rgba(34, 201, 142, 0.8);
}
.pc-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}
.pc-name {
  font-size: 1.1rem;
  font-weight: 700;
  margin: 0;
  color: var(--text);
}
.pc-price {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--accent);
  white-space: nowrap;
}
.pc-desc {
  font-size: 0.85rem;
  color: var(--text-dim);
  margin: 8px 0 14px;
  min-height: 2.6em;
}
.pc-features {
  list-style: none;
  padding: 0;
  margin: 0 0 18px;
  flex: 1;
}
.pc-features li {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
  color: var(--text-dim);
  padding: 4px 0;
}
.pc-features li i {
  color: var(--accent);
  font-size: 1rem;
}
.pc-features li.missing {
  color: var(--text-faint);
  opacity: 0.55;
}
.pc-features li.missing i {
  color: var(--red);
}
.pc-action {
  margin-top: auto;
}
.pc-btn {
  width: 100%;
  padding: 10px 14px;
  border-radius: var(--radius-md);
  border: 0.5px solid var(--panel-border-strong);
  background: rgba(255, 255, 255, 0.06);
  color: var(--text);
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, transform 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.pc-btn:hover {
  background: rgba(255, 255, 255, 0.12);
}
.pc-btn.primary {
  background: var(--accent);
  color: #0b0f14;
  border-color: transparent;
}
.pc-btn.primary:hover {
  background: #1bb37d;
}
.pc-btn.current {
  background: var(--accent-dim);
  color: var(--accent);
  border-color: rgba(34, 201, 142, 0.4);
  cursor: default;
}
.pc-btn.current i {
  font-size: 1rem;
}
.pc-coop-note {
  margin: 10px 0 0;
  font-size: 0.75rem;
  color: var(--text-faint);
}
@media (max-width: 720px) {
  .pricing-cards {
    grid-template-columns: 1fr;
  }
}
</style>