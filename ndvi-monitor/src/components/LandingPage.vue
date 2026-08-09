<template>
  <div v-if="state.landingVisible" class="landing" :class="{ leaving: leaving }">
    <div class="landing-shell">
      <header class="landing-nav">
        <div class="brand-chip">
          <span class="brand-icon"><i class="ti ti-leaf"></i></span>
          <div class="brand-text">
            <span class="brand-name">{{ t('app.name') }}</span>
            <span class="brand-loc mono">BATTAMBANG</span>
          </div>
        </div>
        <div class="lang-seg">
          <button :class="{ on: state.preferredLanguage === 'en' }" @click="setLang('en')">EN</button>
          <button :class="{ on: state.preferredLanguage === 'km' }" @click="setLang('km')">ខ្មែរ</button>
        </div>
      </header>

      <main class="landing-hero">
        <div class="landing-eyebrow mono">{{ t('landing.eyebrow') }}</div>
        <h1 class="landing-title">
          {{ t('landing.title_a') }}
          <span class="landing-title-accent">{{ t('landing.title_b') }}</span>
        </h1>
        <p class="landing-subtitle">{{ t('landing.subtitle') }}</p>

        <div class="landing-cta-row">
          <button class="landing-cta primary" @click="enter">
            <i class="ti ti-map-2"></i> {{ t('landing.cta_primary') }}
          </button>
          <button class="landing-cta ghost" @click="scrollTo('#landing-how')">
            <i class="ti ti-arrow-down"></i> {{ t('landing.cta_secondary') }}
          </button>
        </div>

        <div class="landing-stats">
          <div class="landing-stat">
            <span class="landing-stat-num">50+</span>
            <span class="landing-stat-lbl">{{ t('landing.stat_fields') }}</span>
          </div>
          <div class="landing-stat">
            <span class="landing-stat-num">12</span>
            <span class="landing-stat-lbl">{{ t('landing.stat_weather') }}</span>
          </div>
          <div class="landing-stat">
            <span class="landing-stat-num">24/7</span>
            <span class="landing-stat-lbl">{{ t('landing.stat_alerts') }}</span>
          </div>
        </div>

        <div class="landing-index-chips">
          <span class="index-chip">NDVI</span>
          <span class="index-chip">NDWI</span>
          <span class="index-chip">LSWI</span>
        </div>
      </main>

      <section id="landing-features" class="landing-section">
        <h2 class="landing-h2">{{ t('landing.features_title') }}</h2>
        <div class="landing-grid">
          <div class="landing-card">
            <div class="landing-card-icon"><i class="ti ti-satellite"></i></div>
            <h3>{{ t('landing.feat_ndvi_title') }}</h3>
            <p>{{ t('landing.feat_ndvi_text') }}</p>
          </div>
          <div class="landing-card">
            <div class="landing-card-icon"><i class="ti ti-sprout"></i></div>
            <h3>{{ t('landing.feat_stage_title') }}</h3>
            <p>{{ t('landing.feat_stage_text') }}</p>
          </div>
          <div class="landing-card">
            <div class="landing-card-icon"><i class="ti ti-columns-3"></i></div>
            <h3>{{ t('landing.feat_compare_title') }}</h3>
            <p>{{ t('landing.feat_compare_text') }}</p>
          </div>
          <div class="landing-card">
            <div class="landing-card-icon"><i class="ti ti-brand-telegram"></i></div>
            <h3>{{ t('landing.feat_alerts_title') }}</h3>
            <p>{{ t('landing.feat_alerts_text') }}</p>
          </div>
          <div class="landing-card">
            <div class="landing-card-icon"><i class="ti ti-file-text"></i></div>
            <h3>{{ t('landing.feat_export_title') }}</h3>
            <p>{{ t('landing.feat_export_text') }}</p>
          </div>
          <div class="landing-card">
            <div class="landing-card-icon"><i class="ti ti-robot"></i></div>
            <h3>{{ t('landing.ai') }}</h3>
            <p>{{ t('landing.feat_stage_text') }}</p>
          </div>
        </div>
      </section>

      <section id="landing-how" class="landing-section">
        <h2 class="landing-h2">{{ t('landing.how_title') }}</h2>
        <div class="landing-steps">
          <div class="landing-step">
            <span class="landing-step-num mono">01</span>
            <h3>{{ t('landing.how_1_title') }}</h3>
            <p>{{ t('landing.how_1_text') }}</p>
          </div>
          <div class="landing-step">
            <span class="landing-step-num mono">02</span>
            <h3>{{ t('landing.how_2_title') }}</h3>
            <p>{{ t('landing.how_2_text') }}</p>
          </div>
          <div class="landing-step">
            <span class="landing-step-num mono">03</span>
            <h3>{{ t('landing.how_3_title') }}</h3>
            <p>{{ t('landing.how_3_text') }}</p>
          </div>
        </div>
      </section>

      <section class="landing-cta-band">
        <p class="landing-cta-text">{{ t('landing.cta_bottom') }}</p>
        <button class="landing-cta primary" @click="enter">
          <i class="ti ti-arrow-right"></i> {{ t('landing.cta_primary') }}
        </button>
      </section>

      <footer class="landing-footer">
        <span>{{ t('landing.made_with') }} {{ t('landing.location') }}.</span>
        <span class="footer-source">{{ t('landing.sat_cloud') }} · Sentinel-2</span>
      </footer>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { state } from '../store'
import * as store from '../store'
import { useI18n } from '../i18n'

const { t } = useI18n()
const leaving = ref(false)

function setLang(lang) {
  state.preferredLanguage = lang
}

function scrollTo(sel) {
  document.querySelector(sel)?.scrollIntoView({ behavior: 'smooth' })
}

function enter() {
  leaving.value = true
  setTimeout(() => { store.dismissLanding() }, 400)
}
</script>

<style scoped>
.landing {
  position: fixed;
  inset: 0;
  z-index: 3000;
  background:
    radial-gradient(1200px 600px at 80% -10%, rgba(34, 201, 142, 0.16), transparent 60%),
    radial-gradient(900px 500px at 0% 110%, rgba(34, 201, 142, 0.12), transparent 55%),
    var(--bg-base, #10151b);
  overflow-y: auto;
  transition: opacity 0.4s var(--ease);
}
.landing.leaving { opacity: 0; pointer-events: none; }

.landing-shell {
  max-width: 1080px;
  margin: 0 auto;
  padding: 22px 28px 40px;
}

/* Nav */
.landing-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 4px 26px;
}
.landing-nav .brand-chip { display: flex; align-items: center; gap: 10px; }
.landing-nav .brand-icon {
  width: 38px; height: 38px;
  display: grid; place-items: center;
  border-radius: var(--radius-md);
  background: var(--accent-dim);
  color: var(--accent);
  font-size: 20px;
  border: 0.5px solid rgba(34, 201, 142, 0.35);
}
.landing-nav .brand-text { display: flex; flex-direction: column; gap: 1px; }
.landing-nav .brand-name { font-size: 15px; font-weight: 700; color: var(--text); }
.landing-nav .brand-loc { font-size: 10px; letter-spacing: 0.14em; color: var(--text-faint); }

/* Hero */
.landing-hero {
  text-align: center;
  padding: 70px 12px 30px;
  animation: landing-rise 0.7s var(--ease);
}
.landing-eyebrow {
  font-size: 11px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--text-dim);
  margin-bottom: 22px;
}
.landing-title {
  font-size: clamp(34px, 5vw, 58px);
  line-height: 1.15;
  font-weight: 800;
  color: var(--text);
  letter-spacing: -0.02em;
  margin-bottom: 18px;
}
.landing-title-accent {
  display: block;
  background: linear-gradient(90deg, var(--accent), #6ee7b7);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.landing-subtitle {
  max-width: 640px;
  margin: 0 auto 34px;
  font-size: 16px;
  line-height: 1.7;
  color: var(--text-dim);
}

.landing-cta-row {
  display: flex;
  gap: 14px;
  justify-content: center;
  flex-wrap: wrap;
}
.landing-cta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 13px 26px;
  border-radius: 999px;
  border: 0.5px solid var(--panel-border-strong);
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.15s var(--ease), box-shadow 0.15s var(--ease), background 0.15s;
}
.landing-cta.primary {
  background: var(--accent);
  color: #0b0f14;
  border-color: transparent;
  box-shadow: 0 6px 24px rgba(34, 201, 142, 0.35);
}
.landing-cta.primary:hover { transform: translateY(-1px); box-shadow: 0 10px 30px rgba(34, 201, 142, 0.45); }
.landing-cta.ghost {
  background: rgba(255, 255, 255, 0.05);
  color: var(--text);
}
.landing-cta.ghost:hover { background: rgba(255, 255, 255, 0.09); }

/* Stats */
.landing-stats {
  display: flex;
  gap: 46px;
  justify-content: center;
  align-items: center;
  margin-top: 54px;
  flex-wrap: wrap;
}
.landing-stat { display: flex; flex-direction: column; gap: 2px; }
.landing-stat-num {
  font-family: 'JetBrains Mono', monospace;
  font-size: 26px;
  font-weight: 700;
  color: var(--accent);
}
.landing-stat-lbl { font-size: 12px; color: var(--text-faint); letter-spacing: 0.03em; }

.landing-index-chips {
  display: flex;
  gap: 10px;
  justify-content: center;
  margin-top: 30px;
}
.index-chip {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  letter-spacing: 0.08em;
  color: var(--text-dim);
  padding: 5px 12px;
  border-radius: 999px;
  border: 0.5px solid var(--panel-border-strong);
  background: rgba(255, 255, 255, 0.04);
}

/* Sections */
.landing-section {
  margin-top: 70px;
  padding-top: 8px;
}
.landing-h2 {
  text-align: center;
  font-size: clamp(22px, 3vw, 30px);
  font-weight: 800;
  letter-spacing: -0.01em;
  color: var(--text);
  margin-bottom: 34px;
}

.landing-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}
@media (max-width: 760px) {
  .landing-grid { grid-template-columns: 1fr; }
}
.landing-card {
  background: rgba(255, 255, 255, 0.035);
  border: 0.5px solid var(--panel-border);
  border-radius: var(--radius-lg);
  padding: 26px 22px;
  transition: transform 0.18s var(--ease), border-color 0.18s, background 0.18s;
}
.landing-card:hover {
  transform: translateY(-3px);
  border-color: rgba(34, 201, 142, 0.35);
  background: rgba(255, 255, 255, 0.05);
}
.landing-card-icon {
  width: 42px; height: 42px;
  display: grid; place-items: center;
  border-radius: var(--radius-md);
  background: var(--accent-dim);
  color: var(--accent);
  font-size: 20px;
  margin-bottom: 16px;
}
.landing-card h3 { font-size: 16px; font-weight: 700; color: var(--text); margin-bottom: 8px; }
.landing-card p { font-size: 14px; line-height: 1.65; color: var(--text-dim); }

/* Steps */
.landing-steps {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}
@media (max-width: 760px) {
  .landing-steps { grid-template-columns: 1fr; }
}
.landing-step {
  background: rgba(255, 255, 255, 0.025);
  border: 0.5px solid var(--panel-border);
  border-radius: var(--radius-lg);
  padding: 26px 22px;
}
.landing-step-num {
  font-size: 12px;
  letter-spacing: 0.12em;
  color: var(--accent);
  display: block;
  margin-bottom: 10px;
}
.landing-step h3 { font-size: 16px; font-weight: 700; color: var(--text); margin-bottom: 8px; }
.landing-step p { font-size: 14px; line-height: 1.65; color: var(--text-dim); }

/* CTA band */
.landing-cta-band {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  flex-wrap: wrap;
  margin-top: 70px;
  padding: 32px 34px;
  border-radius: var(--radius-lg);
  background: linear-gradient(120deg, var(--accent-dim), rgba(255, 255, 255, 0.03));
  border: 0.5px solid rgba(34, 201, 142, 0.3);
}
.landing-cta-text { font-size: 18px; font-weight: 700; color: var(--text); }

/* Footer */
.landing-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 46px;
  padding-top: 22px;
  border-top: 0.5px solid var(--panel-border);
  font-size: 13px;
  color: var(--text-faint);
}
.footer-chip { font-size: 12px; letter-spacing: 0.05em; }

@keyframes landing-rise {
  from { opacity: 0; transform: translateY(14px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>