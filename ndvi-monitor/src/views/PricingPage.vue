<template>
  <div class="pricing-page">
    <header class="pp-nav">
      <div class="brand-chip">
        <span class="brand-mark">
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M12 2L3 7v10l9 5 9-5V7l-9-5z" stroke="#E3A72E" stroke-width="1.4" />
            <path d="M12 2v20M3 7l9 5 9-5" stroke="#E3A72E" stroke-width="1.1" opacity=".55" />
          </svg>
        </span>
        <span class="brand-text">
          <span class="brand-name">{{ t('app.name') }}</span>
          <span class="brand-loc mono">Battambang, Cambodia</span>
        </span>
      </div>
      <div class="pp-nav-right">
        <div class="lang-seg">
          <button :class="{ on: state.preferredLanguage === 'en' }" @click="state.preferredLanguage = 'en'">EN</button>
          <button :class="{ on: state.preferredLanguage === 'km' }" @click="state.preferredLanguage = 'km'">ខ្មែរ</button>
        </div>
        <button v-if="state.supabaseUser" class="pp-btn" @click="go('/map')">
          <i class="ti ti-arrow-left"></i>{{ t('pricing.back_to_app') }}
        </button>
        <template v-else>
          <button class="pp-btn ghost" @click="go('/')">{{ t('pricing.back_home') }}</button>
          <button class="pp-btn primary" @click="go('/map')">{{ t('auth.google') }}</button>
        </template>
      </div>
    </header>

    <main class="pp-main">
      <h1 class="pp-title">{{ t('subs.pricing_title') }}</h1>
      <p class="pp-subtitle">{{ t('subs.pricing_subtitle') }}</p>
      <PricingCards />
      <p class="pp-note">{{ t('subs.billing_pending') }}</p>
    </main>
  </div>
</template>

<script setup>
import { state } from '../store'
import PricingCards from '../components/PricingCards.vue'
import { useI18n } from '../i18n'

const { t } = useI18n()

function go(path) {
  import('../router/index.js').then((m) => m.default.push(path))
}
</script>

<style scoped>
.pricing-page {
  min-height: 100vh;
  background: radial-gradient(1200px 600px at 50% -10%, #16222b 0%, #0b0f14 60%);
  color: var(--text);
}
.pp-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 20px;
  border-bottom: 0.5px solid var(--panel-border);
  flex-wrap: wrap;
}
.brand-chip {
  display: flex;
  align-items: center;
  gap: 10px;
}
.brand-mark {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.brand-mark svg {
  width: 24px;
  height: 24px;
}
.brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}
.brand-name {
  font-weight: 700;
  font-size: 0.95rem;
}
.brand-loc {
  font-size: 0.72rem;
  color: var(--text-dim);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.pp-nav-right {
  display: flex;
  align-items: center;
  gap: 10px;
}
.lang-seg {
  display: flex;
  border: 0.5px solid var(--panel-border-strong);
  border-radius: var(--radius-md);
  overflow: hidden;
}
.lang-seg button {
  background: transparent;
  color: var(--text-dim);
  border: none;
  padding: 7px 12px;
  font-size: 0.78rem;
  cursor: pointer;
}
.lang-seg button.on {
  background: var(--accent-dim);
  color: var(--accent);
}
.pp-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: var(--radius-md);
  border: 0.5px solid var(--panel-border-strong);
  background: rgba(255, 255, 255, 0.06);
  color: var(--text);
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
}
.pp-btn.primary {
  background: var(--accent);
  color: #0b0f14;
  border-color: transparent;
}
.pp-main {
  padding: 40px 20px 60px;
  text-align: center;
}
.pp-title {
  font-size: 1.8rem;
  margin: 0 0 8px;
}
.pp-subtitle {
  color: var(--text-dim);
  margin: 0 0 32px;
}
.pp-note {
  margin-top: 32px;
  font-size: 0.8rem;
  color: var(--text-faint);
}
</style>