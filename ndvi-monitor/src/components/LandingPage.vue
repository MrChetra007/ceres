<template>
  <div v-if="state.landingVisible" class="landing" :class="{ leaving: leaving }">
    <div class="landing-shell">
      <header class="landing-nav">
        <div class="brand-chip">
          <span class="brand-icon"><i class="ti ti-leaf"></i></span>
          <div class="brand-text">
            <span class="brand-name">{{ t('app.name') }}</span>
            <span class="brand-loc mono">{{ t('landing.loc_sub') }}</span>
          </div>
        </div>
        <div class="nav-right">
          <div class="lang-seg">
            <button :class="{ on: state.preferredLanguage === 'en' }" @click="setLang('en')">EN</button>
            <button :class="{ on: state.preferredLanguage === 'km' }" @click="setLang('km')">ខ្មែរ</button>
          </div>
          <button class="landing-cta primary small" @click="enter">{{ t('landing.sign_in') }}</button>
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
            <i class="ti ti-brand-google"></i> {{ t('landing.cta_primary') }}
          </button>
          <button class="landing-cta ghost" @click="scrollTo('#landing-how')">
            <i class="ti ti-arrow-down"></i> {{ t('landing.cta_secondary') }}
          </button>
        </div>

        <div class="landing-stats">
          <div class="landing-stat">
            <span class="landing-stat-num">5</span>
            <span class="landing-stat-lbl">{{ t('landing.stat_fields') }}</span>
          </div>
          <div class="landing-stat">
            <span class="landing-stat-num">14</span>
            <span class="landing-stat-lbl">{{ t('landing.stat_weather') }}</span>
          </div>
          <div class="landing-stat">
            <span class="landing-stat-num">3</span>
            <span class="landing-stat-lbl">{{ t('landing.stat_alerts') }}</span>
          </div>
        </div>

        <div class="landing-index-chips">
          <span class="index-chip">NDVI</span>
          <span class="index-chip">NDWI</span>
          <span class="index-chip">LSWI</span>
          <span class="index-chip">RVI</span>
        </div>
      </main>

      <section id="landing-problem" class="landing-section">
        <div class="landing-eyebrow mono">{{ t('landing.problem_kicker') }}</div>
        <h2 class="landing-h2">{{ t('landing.problem_title') }}</h2>
        <p class="landing-lead">{{ t('landing.problem_desc') }}</p>
        <div class="landing-grid">
          <div class="landing-card">
            <span class="tag tag-red">{{ t('landing.problem_1_tag') }}</span>
            <p>{{ t('landing.problem_1_text') }}</p>
          </div>
          <div class="landing-card">
            <span class="tag tag-gold">{{ t('landing.problem_2_tag') }}</span>
            <p>{{ t('landing.problem_2_text') }}</p>
          </div>
          <div class="landing-card">
            <span class="tag tag-green">{{ t('landing.problem_3_tag') }}</span>
            <p>{{ t('landing.problem_3_text') }}</p>
          </div>
        </div>
      </section>

      <section id="landing-how" class="landing-section">
        <div class="landing-eyebrow mono">{{ t('landing.how_kicker') }}</div>
        <h2 class="landing-h2">{{ t('landing.how_title') }}</h2>
        <p class="landing-lead">{{ t('landing.how_desc') }}</p>
        <div class="landing-steps">
          <div class="landing-step">
            <span class="landing-step-num mono">01 / 05</span>
            <h3>{{ t('landing.how_1_title') }}</h3>
            <p>{{ t('landing.how_1_text') }}</p>
          </div>
          <div class="landing-step">
            <span class="landing-step-num mono">02 / 05</span>
            <h3>{{ t('landing.how_2_title') }}</h3>
            <p>{{ t('landing.how_2_text') }}</p>
          </div>
          <div class="landing-step">
            <span class="landing-step-num mono">03 / 05</span>
            <h3>{{ t('landing.how_3_title') }}</h3>
            <p>{{ t('landing.how_3_text') }}</p>
          </div>
          <div class="landing-step">
            <span class="landing-step-num mono">04 / 05</span>
            <h3>{{ t('landing.how_4_title') }}</h3>
            <p>{{ t('landing.how_4_text') }}</p>
          </div>
          <div class="landing-step">
            <span class="landing-step-num mono">05 / 05</span>
            <h3>{{ t('landing.how_5_title') }}</h3>
            <p>{{ t('landing.how_5_text') }}</p>
          </div>
        </div>
      </section>

      <section id="landing-features" class="landing-section">
        <div class="landing-eyebrow mono">{{ t('landing.features_kicker') }}</div>
        <h2 class="landing-h2">{{ t('landing.features_title') }}</h2>
        <div class="landing-grid">
          <div class="landing-card">
            <div class="landing-card-icon"><i class="ti ti-satellite"></i></div>
            <h3>{{ t('landing.feat_1_title') }}</h3>
            <p>{{ t('landing.feat_1_text') }}</p>
          </div>
          <div class="landing-card">
            <div class="landing-card-icon"><i class="ti ti-sprout"></i></div>
            <h3>{{ t('landing.feat_2_title') }}</h3>
            <p>{{ t('landing.feat_2_text') }}</p>
          </div>
          <div class="landing-card">
            <div class="landing-card-icon"><i class="ti ti-cloud-off"></i></div>
            <h3>{{ t('landing.feat_3_title') }}</h3>
            <p>{{ t('landing.feat_3_text') }}</p>
          </div>
          <div class="landing-card">
            <div class="landing-card-icon"><i class="ti ti-cloud-rain"></i></div>
            <h3>{{ t('landing.feat_4_title') }}</h3>
            <p>{{ t('landing.feat_4_text') }}</p>
          </div>
          <div class="landing-card">
            <div class="landing-card-icon"><i class="ti ti-robot"></i></div>
            <h3>{{ t('landing.feat_5_title') }}</h3>
            <p>{{ t('landing.feat_5_text') }}</p>
          </div>
          <div class="landing-card">
            <div class="landing-card-icon"><i class="ti ti-brand-telegram"></i></div>
            <h3>{{ t('landing.feat_6_title') }}</h3>
            <p>{{ t('landing.feat_6_text') }}</p>
          </div>
        </div>
      </section>

      <section id="landing-lang" class="landing-section">
        <div class="landing-eyebrow mono">{{ t('landing.lang_kicker') }}</div>
        <h2 class="landing-h2">{{ t('landing.lang_title') }}</h2>
        <p class="landing-lead">{{ t('landing.lang_desc') }}</p>

        <div class="mock-panel">
          <div class="mock-topbar">
            <div class="mock-dots"><span></span><span></span><span></span></div>
            <span class="mock-badge">{{ t('landing.mock_badge') }}</span>
          </div>
          <div class="mock-map">
            <div class="mock-map-bg"></div>
            <div class="mock-field"></div>
            <div class="mock-legend"><i style="background:#6BA85F"></i><i style="background:#E3A72E"></i><i style="background:#C1443C"></i></div>
          </div>
          <div class="mock-row">
            <b>{{ t('landing.mock_plot') }}</b>
            <span class="pill healthy">{{ t('landing.mock_healthy') }}</span>
          </div>
          <div class="mock-row">
            <b>{{ t('landing.mock_growth_label') }}</b>
            <span>{{ t('landing.mock_growth_value') }}</span>
          </div>
          <div class="mock-row">
            <b>{{ t('landing.mock_plot2') }}</b>
            <span class="pill moderate">{{ t('landing.mock_moderate') }}</span>
          </div>
          <div class="mock-row">
            <b>{{ t('landing.mock_rain_label') }}</b>
            <span>{{ t('landing.mock_rain_value') }}</span>
          </div>
        </div>

        <div class="lang-switch">
          <button :class="{ on: state.preferredLanguage === 'en' }" @click="setLang('en')">EN</button>
          <button :class="{ on: state.preferredLanguage === 'km' }" @click="setLang('km')">ខ្មែរ</button>
        </div>
      </section>

      <section id="landing-trust" class="landing-section">
        <div class="landing-eyebrow mono">{{ t('landing.trust_kicker') }}</div>
        <h2 class="landing-h2 small">{{ t('landing.trust_title') }}</h2>
        <div class="landing-trust-strip">
          <span class="trust-chip"><i></i>Sentinel-2 (ESA / Copernicus)</span>
          <span class="trust-chip"><i></i>Sentinel-1 radar (RVI fallback)</span>
          <span class="trust-chip"><i></i>CHIRPS rainfall</span>
          <span class="trust-chip"><i></i>Google Earth Engine</span>
          <span class="trust-chip"><i></i>Nominatim / OSM place search</span>
        </div>
      </section>

      <section class="landing-cta-band">
        <div>
          <p class="landing-cta-title">{{ t('landing.cta_title') }}</p>
          <p class="landing-cta-sub">{{ t('landing.cta_sub') }}</p>
        </div>
        <div class="landing-cta-row inline">
          <button class="landing-cta primary" @click="enter">
            <i class="ti ti-brand-google"></i> {{ t('landing.cta_primary') }}
          </button>
          <button class="landing-cta ghost" @click="enter">
            <i class="ti ti-brand-telegram"></i> {{ t('landing.cta_telegram') }}
          </button>
        </div>
      </section>

      <footer class="landing-footer">
        <span class="footer-credit">{{ t('landing.footer_credit') }}</span>
        <div class="footer-links">
          <button @click="scrollTo('#landing-how')">{{ t('landing.footer_how') }}</button>
          <button @click="scrollTo('#landing-features')">{{ t('landing.footer_features') }}</button>
          <button @click="enter">{{ t('landing.footer_signin') }}</button>
        </div>
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

/* Nav right */
.landing-nav .nav-right { display: flex; align-items: center; gap: 12px; }
.landing-cta.small { padding: 8px 16px; font-size: 13px; }

/* Section copy */
.landing-lead {
  max-width: 640px;
  margin: 0 auto 34px;
  font-size: 15px;
  line-height: 1.7;
  color: var(--text-dim);
}
.landing-section .landing-eyebrow { margin-bottom: 14px; }
.landing-h2.small { font-size: clamp(20px, 2.6vw, 26px); margin-bottom: 22px; }

/* Tags */
.tag {
  display: inline-block;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10.5px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  padding: 3px 9px;
  border-radius: 6px;
  margin-bottom: 12px;
}
.tag-red { background: rgba(193, 68, 60, 0.16); color: #e8837c; }
.tag-gold { background: rgba(227, 167, 46, 0.16); color: #e3a72e; }
.tag-green { background: rgba(107, 168, 95, 0.18); color: #6ba85f; }

/* Mock panel */
.mock-panel {
  max-width: 560px;
  margin: 0 auto;
  background: rgba(255, 255, 255, 0.035);
  border: 0.5px solid var(--panel-border);
  border-radius: var(--radius-lg);
  padding: 18px;
}
.mock-topbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
.mock-dots { display: flex; gap: 5px; }
.mock-dots span { width: 7px; height: 7px; border-radius: 50%; background: var(--panel-border-strong); }
.mock-badge {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  letter-spacing: 0.05em;
  color: var(--accent);
  border: 0.5px solid rgba(34, 201, 142, 0.35);
  padding: 2px 8px;
  border-radius: 6px;
}
.mock-map {
  position: relative;
  height: 170px;
  border-radius: var(--radius-md);
  overflow: hidden;
  margin-bottom: 14px;
}
.mock-map-bg {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(120% 90% at 20% 90%, rgba(34, 201, 142, 0.18), transparent 55%),
    linear-gradient(120deg, #173322, #0e2318 55%, #1e4028);
}
.mock-map-bg::after {
  content: '';
  position: absolute;
  left: -10%;
  right: -10%;
  top: 55%;
  height: 46%;
  border-radius: 50%;
  background: linear-gradient(100deg, #2c4a35, #173322);
  opacity: 0.7;
}
.mock-field {
  position: absolute;
  left: 34%;
  top: 32%;
  width: 78px;
  height: 54px;
  border: 2px solid var(--accent);
  border-radius: 5px;
  box-shadow: 0 0 0 4px rgba(34, 201, 142, 0.12);
}
.mock-legend { position: absolute; bottom: 8px; left: 8px; display: flex; gap: 4px; }
.mock-legend i { width: 16px; height: 6px; border-radius: 2px; display: block; }
.mock-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 9px 2px;
  border-top: 0.5px solid var(--panel-border);
  font-size: 13px;
  color: var(--text-dim);
}
.mock-row b { font-weight: 600; color: var(--text); white-space: nowrap; }
.mock-row .pill {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  padding: 2px 9px;
  border-radius: 999px;
  white-space: nowrap;
  flex: none;
}
.pill.healthy { background: rgba(34, 201, 142, 0.16); color: var(--accent); }
.pill.moderate { background: rgba(227, 167, 46, 0.16); color: #e3a72e; }

.lang-switch { display: flex; gap: 8px; justify-content: center; margin-top: 26px; }
.lang-switch button {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  letter-spacing: 0.04em;
  padding: 7px 16px;
  border-radius: 999px;
  border: 0.5px solid var(--panel-border-strong);
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-dim);
  cursor: pointer;
}
.lang-switch button.on {
  background: var(--accent);
  color: #0b0f14;
  border-color: transparent;
  font-weight: 700;
}

/* Trust */
.landing-trust-strip { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; }
.trust-chip {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  border: 0.5px solid var(--panel-border-strong);
  border-radius: 999px;
  padding: 8px 15px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--text-dim);
}
.trust-chip i { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); flex: none; }

/* CTA band */
.landing-cta-title {
  font-size: clamp(22px, 3vw, 30px);
  font-weight: 800;
  letter-spacing: -0.01em;
  color: var(--text);
}
.landing-cta-sub { font-size: 15px; color: var(--text-dim); margin-top: 8px; max-width: 520px; line-height: 1.7; }
.landing-cta-row.inline { margin-top: 6px; }

/* Footer */
.footer-credit { max-width: 620px; line-height: 1.6; }
.footer-links { display: flex; gap: 16px; }
.footer-links button {
  background: none;
  border: none;
  padding: 0;
  color: var(--text-faint);
  font-size: 12.5px;
  cursor: pointer;
}
.footer-links button:hover { color: var(--accent); }

@keyframes landing-rise {
  from { opacity: 0; transform: translateY(14px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>