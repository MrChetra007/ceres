<template>
  <div
    v-if="state.landingVisible"
    class="landing"
    :class="{ leaving: leaving }"
  >
    <header class="landing-nav">
      <div class="brand-chip">
        <img class="brand-mark" :src="logo1" alt="" />
        <div class="brand-text">
          <span class="brand-name">NDVI Rice Monitor</span>
          <span class="brand-loc mono">{{ t('landing.loc_sub') }}</span>
        </div>
      </div>
      <div class="nav-right">
        <button
          class="lang-seg"
          :aria-label="state.preferredLanguage === 'en' ? 'ខ្មែរ' : 'English'"
          :title="state.preferredLanguage === 'en' ? 'ខ្មែរ' : 'English'"
          @click="toggleLang"
        >
          <i class="ti ti-world"></i>
          {{ state.preferredLanguage === 'en' ? 'EN' : 'ខ្មែរ' }}
        </button>
        <button
          class="landing-cta ghost small download-btn"
          :aria-label="t('landing.download')"
          :title="t('landing.download')"
          @click="promptInstall"
        >
          <i class="ti ti-device-mobile-down"></i>
          <span>{{ t('landing.download') }}</span>
        </button>
        <button class="landing-cta primary small" @click="enter">
          {{ t('landing.sign_in') }}
        </button>
      </div>
    </header>

    <section class="landing-hero" ref="heroSection">
      <div class="hero-bg" ref="heroBg" style="--wipe: 38%">
        <img
          class="layer truecolor"
          src="https://commons.wikimedia.org/wiki/Special:FilePath/Cambodia%20Rice%20Fields%20(9728041389).jpg"
          alt="Rice fields in Cambodia, true color"
        />
        <img
          class="layer ndvi"
          src="https://commons.wikimedia.org/wiki/Special:FilePath/Cambodia%20Rice%20Fields%20(9728041389).jpg"
          alt=""
        />
        <div class="ndvi-tint"></div>
        <div class="scanbar"></div>
        <div class="scanlabel">{{ t('landing.scan_label') }}</div>
        <div class="scrim"></div>
      </div>

      <div class="sat-stage" ref="satStage">
        <svg class="orbit-svg" viewBox="0 0 420 150">
          <ellipse cx="210" cy="75" rx="205" ry="58" />
        </svg>
        <div class="sat-orbiter" ref="satOrbiter">
          <div class="sat-glow"></div>
          <div class="sat-beam"></div>
          <div class="beam-target">
            <i></i><i></i><i></i>
            <div class="dot"></div>
          </div>
          <div class="sat3d" ref="sat3d">
            <div class="sat-panel left"></div>
            <div class="sat-panel right"></div>
            <div class="sat-body">
              <div class="sat-face f"></div>
              <div class="sat-face b"></div>
              <div class="sat-face l"></div>
              <div class="sat-face r"></div>
              <div class="sat-face t"></div>
              <div class="sat-face d"></div>
            </div>
            <div class="sat-dish"></div>
          </div>
        </div>
      </div>

      <div class="landing-hero-content">
        <div class="landing-eyebrow mono">
          {{ t('landing.eyebrow') }}
        </div>
        <h1 class="landing-title">
          {{ t('landing.title_a') }}
          <span class="landing-title-accent">{{ t('landing.title_accent') }}</span>
          {{ t('landing.title_b') }}
        </h1>
        <p class="landing-subtitle">
          {{ t('landing.subtitle') }}
        </p>

        <div class="landing-cta-row">
          <button class="landing-cta primary" @click="enter">
            <i class="ti ti-brand-google"></i> {{ t('landing.cta_primary') }}
          </button>
          <button class="landing-cta ghost" @click="scrollTo('#landing-how')">
            {{ t('landing.cta_secondary') }}
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
      </div>

      <div class="scroll-cue">{{ t('landing.scroll') }}<span class="bar"></span></div>
    </section>

    <section
      id="landing-problem"
      class="landing-section landing-problem-grid reveal"
    >
      <div class="problem-copy">
        <div class="landing-eyebrow mono">{{ t('landing.problem_kicker') }}</div>
        <h2 class="landing-h2 align-left">
          {{ t('landing.problem_title') }}
        </h2>
        <p class="landing-lead align-left">
          {{ t('landing.problem_desc') }}
        </p>
      </div>
      <div class="problem-cards">
        <div class="landing-card stacked">
          <span class="tag tag-red">{{ t('landing.problem_1_tag') }}</span>
          <p>
            {{ t('landing.problem_1_text') }}
          </p>
        </div>
        <div class="landing-card stacked">
          <span class="tag tag-gold">{{ t('landing.problem_2_tag') }}</span>
          <p>
            {{ t('landing.problem_2_text') }}
          </p>
        </div>
        <div class="landing-card stacked">
          <span class="tag tag-green">{{ t('landing.problem_3_tag') }}</span>
          <p>
            {{ t('landing.problem_3_text') }}
          </p>
        </div>
      </div>
    </section>

    <section id="landing-how" class="landing-section reveal">
      <div class="landing-eyebrow mono center">{{ t('landing.how_kicker') }}</div>
      <h2 class="landing-h2">{{ t('landing.how_title') }}</h2>
      <p class="landing-lead">
        {{ t('landing.how_desc') }}
      </p>

      <div class="landing-steps-media">
        <div class="step-row reveal">
          <div class="step-media">
            <img
              src="https://commons.wikimedia.org/wiki/Special:FilePath/Rice%20fields%20around%20Angkor%20Thom%20-%20Cambodia%20-%20panoramio.jpg"
              alt="Aerial view of rice fields near Angkor Thom, Cambodia"
            />
            <div class="cap">{{ t('landing.how_1_cap') }}</div>
          </div>
          <div class="step-text">
            <span class="landing-step-num mono">01 / 05</span>
            <h3>{{ t('landing.how_1_title') }}</h3>
            <p>
              {{ t('landing.how_1_text') }}
            </p>
          </div>
        </div>

        <div class="step-row rev reveal">
          <div class="step-media">
            <img
              src="https://www.nasa.gov/wp-content/uploads/2023/03/applied_geosolutions_1.png"
              alt="Satellite data over the Mekong Delta rice region, NASA"
            />
            <div class="cap">{{ t('landing.how_2_cap') }}</div>
          </div>
          <div class="step-text">
            <span class="landing-step-num mono">02 / 05</span>
            <h3>{{ t('landing.how_2_title') }}</h3>
            <p>
              {{ t('landing.how_2_text') }}
            </p>
          </div>
        </div>

        <div class="step-row reveal">
          <div class="step-media">
            <img
              src="https://commons.wikimedia.org/wiki/Special:FilePath/Rice%20paddy%20with%20water%20buffalo%20(26446016828).jpg"
              alt="Farmer with water buffalo in a rice paddy"
            />
            <div class="cap">{{ t('landing.how_3_cap') }}</div>
          </div>
          <div class="step-text">
            <span class="landing-step-num mono">03 / 05</span>
            <h3>{{ t('landing.how_3_title') }}</h3>
            <p>
              {{ t('landing.how_3_text') }}
            </p>
          </div>
        </div>

        <div class="step-row rev reveal">
          <div class="step-media">
            <img
              src="https://commons.wikimedia.org/wiki/Special:FilePath/Sc%C3%A8nes%20de%20repiquage%20dans%20une%20rizi%C3%A8re%20cambodgienne.jpg"
              alt="Farmers transplanting rice seedlings in Cambodia"
            />
            <div class="cap">{{ t('landing.how_4_cap') }}</div>
          </div>
          <div class="step-text">
            <span class="landing-step-num mono">04 / 05</span>
            <h3>{{ t('landing.how_4_title') }}</h3>
            <p>
              {{ t('landing.how_4_text') }}
            </p>
          </div>
        </div>

        <div class="step-row reveal">
          <div class="step-media">
            <img
              src="https://commons.wikimedia.org/wiki/Special:FilePath/Cambodia%20Rice%20Fields%20(9728041389).jpg"
              alt="Rice fields in Cambodia at sunset"
            />
            <div class="cap">{{ t('landing.how_5_cap') }}</div>
          </div>
          <div class="step-text">
            <span class="landing-step-num mono">05 / 05</span>
            <h3>{{ t('landing.how_5_title') }}</h3>
            <p>
              {{ t('landing.how_5_text') }}
            </p>
          </div>
        </div>
      </div>
    </section>

    <section id="landing-features" class="landing-section reveal">
      <div class="landing-eyebrow mono center">{{ t('landing.features_kicker') }}</div>
      <h2 class="landing-h2">
        {{ t('landing.features_title') }}
      </h2>
      <div class="landing-grid">
        <div class="landing-card tilt">
          <div class="landing-card-icon"><i class="ti ti-chart-line"></i></div>
          <h3>{{ t('landing.feat_1_title') }}</h3>
          <p>
            {{ t('landing.feat_1_text') }}
          </p>
        </div>
        <div class="landing-card tilt">
          <div class="landing-card-icon"><i class="ti ti-sprout"></i></div>
          <h3>{{ t('landing.feat_2_title') }}</h3>
          <p>
            {{ t('landing.feat_2_text') }}
          </p>
        </div>
        <div class="landing-card tilt">
          <div class="landing-card-icon"><i class="ti ti-cloud-off"></i></div>
          <h3>{{ t('landing.feat_3_title') }}</h3>
          <p>
            {{ t('landing.feat_3_text') }}
          </p>
        </div>
        <div class="landing-card tilt">
          <div class="landing-card-icon"><i class="ti ti-cloud-rain"></i></div>
          <h3>{{ t('landing.feat_4_title') }}</h3>
          <p>
            {{ t('landing.feat_4_text') }}
          </p>
        </div>
        <div class="landing-card tilt">
          <div class="landing-card-icon"><i class="ti ti-robot"></i></div>
          <h3>{{ t('landing.feat_5_title') }}</h3>
          <p>
            {{ t('landing.feat_5_text') }}
          </p>
        </div>
        <div class="landing-card tilt">
          <div class="landing-card-icon">
            <i class="ti ti-brand-telegram"></i>
          </div>
          <h3>{{ t('landing.feat_6_title') }}</h3>
          <p>
            {{ t('landing.feat_6_text') }}
          </p>
        </div>
      </div>
    </section>

    <section id="landing-indices" class="landing-section reveal">
      <div class="landing-eyebrow mono center">{{ t('landing.indices_kicker') }}</div>
      <h2 class="landing-h2">{{ t('landing.indices_title') }}</h2>
      <p class="landing-lead">
        {{ t('landing.indices_desc') }}
      </p>
      <IndexSection
        v-for="item in landingIndices"
        :key="item.key"
        :index="item"
      />
    </section>

    <section id="landing-lang" class="landing-section reveal">
      <div class="mock-wrap">
        <div class="lang-copy">
          <div class="landing-eyebrow mono">
            {{ t('landing.lang_kicker') }}
          </div>
          <h2 class="landing-h2 align-left">
            {{ t('landing.lang_title') }}
          </h2>
          <p class="landing-lead align-left">
            {{ t('landing.lang_desc') }}
          </p>
          <div class="lang-switch">
            <button
              :class="{ on: state.preferredLanguage === 'en' }"
              @click="setLang('en')"
            >
              EN
            </button>
            <button
              :class="{ on: state.preferredLanguage === 'km' }"
              @click="setLang('km')"
            >
              ខ្មែរ
            </button>
          </div>
        </div>

        <div class="mock-panel">
          <div class="mock-topbar">
            <div class="mock-dots"><span></span><span></span><span></span></div>
            <span class="mock-badge">{{ t('landing.mock_badge') }}</span>
          </div>
          <div class="mock-map">
            <svg viewBox="0 0 400 200" preserveAspectRatio="none">
              <defs>
                <linearGradient
                  id="landingMapGradient"
                  x1="0"
                  y1="0"
                  x2="1"
                  y2="1"
                >
                  <stop offset="0" stop-color="#6BA85F" />
                  <stop offset=".5" stop-color="#E3A72E" />
                  <stop offset="1" stop-color="#C1443C" />
                </linearGradient>
              </defs>
              <rect x="0" y="0" width="400" height="200" fill="#12281c" />
              <path
                d="M0 120 Q100 90 200 110 T400 100 V200 H0 Z"
                fill="url(#landingMapGradient)"
                opacity="0.55"
              />
              <path
                d="M0 150 Q120 130 220 150 T400 140 V200 H0 Z"
                fill="#0e2318"
                opacity="0.6"
              />
            </svg>
            <div class="mock-field"></div>
            <div class="mock-legend">
              <i style="background: #6ba85f"></i
              ><i style="background: #e3a72e"></i
              ><i style="background: #c1443c"></i>
            </div>
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
      </div>
    </section>

    <section id="landing-trust" class="landing-section reveal">
      <div class="landing-eyebrow mono">{{ t('landing.trust_kicker') }}</div>
      <h2 class="landing-h2 small align-left">
        {{ t('landing.trust_title') }}
      </h2>
      <div class="landing-trust-strip">
        <span class="trust-chip"><i></i>{{ t('landing.trust_s2') }}</span>
        <span class="trust-chip"><i></i>{{ t('landing.trust_s1') }}</span>
        <span class="trust-chip"><i></i>{{ t('landing.trust_chirps') }}</span>
        <span class="trust-chip"><i></i>{{ t('landing.trust_gee') }}</span>
        <span class="trust-chip"><i></i>{{ t('landing.trust_nominatim') }}</span>
      </div>
    </section>

    <section id="landing-pricing" class="landing-section reveal">
      <div class="landing-eyebrow mono center">{{ t('landing.pricing_kicker') }}</div>
      <h2 class="landing-h2">{{ t('landing.pricing_title') }}</h2>
      <p class="landing-lead">
        {{ t('landing.pricing_desc') }}
      </p>
      <PricingCards />
    </section>

    <section class="landing-cta-section">
      <h2 class="landing-cta-title">
        {{ t('landing.cta_title') }}
      </h2>
      <p class="landing-cta-sub">
        {{ t('landing.cta_sub') }}
      </p>
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
      <span class="footer-credit"
        >{{ t('landing.footer_credit') }}</span
      >
      <div class="footer-links">
        <button @click="scrollTo('#landing-how')">{{ t('landing.footer_how') }}</button>
        <button @click="scrollTo('#landing-features')">{{ t('landing.footer_features') }}</button>
        <button @click="enter">{{ t('landing.footer_signin') }}</button>
      </div>
    </footer>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick } from "vue";
import { useRouter } from "vue-router";
import { state } from "../store.js";
import * as store from "../store.js";
import { sb } from "../services/supabase.js";
import { landingIndices } from "../data/landing-indices.js";
import logo1 from "../assets/logos-icons/logo1.png";
import IndexSection from "../components/landing-page/IndexSection.vue";
import PricingCards from "../components/PricingCards.vue";
import { promptInstall } from "../services/pwa.js";
import { useI18n } from "../i18n";

const { t } = useI18n();
const leaving = ref(false);

const heroSection = ref(null);
const heroBg = ref(null);
const satStage = ref(null);
const sat3d = ref(null);
const satOrbiter = ref(null);

let rafIds = [];
let io = null;
let mouseMoveHandler = null;
let orbitMouseHandler = null;
let tiltCleanups = [];

function setLang(lang) {
  store.setLanguage(lang);
}

function toggleLang() {
  setLang(state.preferredLanguage === "en" ? "km" : "en");
}

function scrollTo(sel) {
  document.querySelector(sel)?.scrollIntoView({ behavior: "smooth" });
}

function enter() {
  leaving.value = true;
  setTimeout(() => {
    store.dismissLanding();
    import("../router/index.js").then((m) => {
      const router = m.default;
      if (router.currentRoute.value.path !== "/map") router.push("/map");
    });
  }, 400);
}

onMounted(async () => {
  // If user is already logged in (persisted Supabase session), skip landing
  const router = useRouter();
  const { data } = await sb.auth.getSession();
  if (data.session && data.session.user) {
    router.replace("/map");
    return;
  }

  await nextTick();

  // ---- hero NDVI scan wipe (auto sweep) ----
  if (heroBg.value) {
    let wipe = 38;
    let dir = 1;
    const autoSweep = () => {
      if (!heroBg.value) return;
      wipe += dir * 0.18;
      if (wipe > 78) dir = -1;
      if (wipe < 22) dir = 1;
      heroBg.value.style.setProperty("--wipe", wipe + "%");
      rafIds.push(requestAnimationFrame(autoSweep));
    };
    rafIds.push(requestAnimationFrame(autoSweep));
  }

  // ---- 3D satellite parallax on mouse ----
  if (satStage.value && sat3d.value && heroSection.value) {
    mouseMoveHandler = (e) => {
      const r = heroSection.value.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      sat3d.value.style.setProperty("--my", 22 + px * 26 + "deg");
      sat3d.value.style.setProperty("--mx", -14 - py * 18 + "deg");
      satStage.value.style.setProperty("--beamskew", px * 9 + "deg");
    };
    heroSection.value.addEventListener("mousemove", mouseMoveHandler);
  }

  // ---- satellite orbital motion + fading trajectory-dot trail ----
  if (satOrbiter.value && satStage.value) {
    const ORBIT_RX = 205,
      ORBIT_RY = 58,
      ORBIT_PERIOD = 16000;
    const TRAIL_COUNT = 14,
      SAMPLE_EVERY = 3;
    const trailPool = [];
    const trailHistory = [];
    let frameCount = 0;

    for (let i = 0; i < TRAIL_COUNT; i++) {
      const d = document.createElement("div");
      d.className = "trail-dot";
      satStage.value.appendChild(d);
      trailPool.push(d);
    }
    tiltCleanups.push(() => trailPool.forEach((d) => d.remove()));

    const orbitTick = (now) => {
      if (!satOrbiter.value) return;
      const angle = ((now % ORBIT_PERIOD) / ORBIT_PERIOD) * Math.PI * 2;
      const dx = Math.cos(angle) * ORBIT_RX;
      const dy = Math.sin(angle) * ORBIT_RY;
      satOrbiter.value.style.transform =
        "translate(" + dx.toFixed(1) + "px," + dy.toFixed(1) + "px)";

      frameCount++;
      if (frameCount % SAMPLE_EVERY === 0) {
        trailHistory.unshift({ x: dx, y: dy });
        if (trailHistory.length > TRAIL_COUNT) trailHistory.pop();
      }
      for (let j = 0; j < trailPool.length; j++) {
        const p = trailHistory[j];
        if (p) {
          const fade = 1 - j / trailPool.length;
          trailPool[j].style.opacity = (fade * 0.55).toFixed(2);
          trailPool[j].style.transform =
            "translate(" +
            p.x.toFixed(1) +
            "px," +
            p.y.toFixed(1) +
            "px) scale(" +
            (0.4 + fade * 0.6).toFixed(2) +
            ")";
        } else {
          trailPool[j].style.opacity = 0;
        }
      }
      rafIds.push(requestAnimationFrame(orbitTick));
    };
    rafIds.push(requestAnimationFrame(orbitTick));
  }

  // ---- scroll reveal ----
  const revealEls = document.querySelectorAll(".landing .reveal");
  if ("IntersectionObserver" in window) {
    io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -60px 0px" },
    );
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add("in"));
  }

  // ---- feature card tilt ----
  const tiltCards = document.querySelectorAll(".landing .tilt");
  tiltCards.forEach((card) => {
    const onMove = (e) => {
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      card.style.transform =
        "perspective(700px) rotateY(" +
        px * 10 +
        "deg) rotateX(" +
        -py * 10 +
        "deg) translateY(-3px)";
    };
    const onLeave = () => {
      card.style.transform =
        "perspective(700px) rotateY(0deg) rotateX(0deg) translateY(0px)";
    };
    card.addEventListener("mousemove", onMove);
    card.addEventListener("mouseleave", onLeave);
    tiltCleanups.push(() => {
      card.removeEventListener("mousemove", onMove);
      card.removeEventListener("mouseleave", onLeave);
    });
  });
});

onBeforeUnmount(() => {
  rafIds.forEach((id) => cancelAnimationFrame(id));
  rafIds = [];
  if (io) io.disconnect();
  if (mouseMoveHandler && heroSection.value) {
    heroSection.value.removeEventListener("mousemove", mouseMoveHandler);
  }
  tiltCleanups.forEach((fn) => fn());
  tiltCleanups = [];
});
</script>

<style scoped>
/* ============ tokens (scoped to landing) ============ */
.landing {
  --paddy-night: #0f1f16;
  --canopy: #1b3a28;
  --husk-paper: #f3eedc;
  --husk-paper-dim: #e7e0c9;
  --stress-red: #c1443c;
  --ripening-gold: #e3a72e;
  --canopy-green: #6ba85f;
  --line-on-dark: rgba(243, 238, 220, 0.14);
  --line-on-light: rgba(15, 31, 22, 0.12);
  --font-display: "Space Grotesk", sans-serif;
  --font-body: "IBM Plex Sans", sans-serif;
  --font-mono: "IBM Plex Mono", monospace;
  --landing-ease: cubic-bezier(0.22, 0.61, 0.36, 1);

  position: fixed;
  inset: 0;
  z-index: 3000;
  overflow-y: auto;
  background: var(--paddy-night);
  color: var(--husk-paper);
  font-family: var(--font-body);
  line-height: 1.5;
  transition: opacity 0.4s var(--landing-ease);
}
.landing.leaving {
  opacity: 0;
  pointer-events: none;
}
.landing .mono {
  font-family: var(--font-mono);
}
.landing img {
  max-width: 100%;
  display: block;
}
.landing section {
  position: relative;
}

@media (prefers-reduced-motion: reduce) {
  .landing * {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
  }
}

/* ============ NAV ============ */
.landing-nav {
  position: sticky;
  top: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 28px;
  background: linear-gradient(
    to bottom,
    rgba(15, 31, 22, 0.92),
    rgba(15, 31, 22, 0)
  );
  backdrop-filter: blur(6px);
}
.brand-chip {
  display: flex;
  align-items: center;
  gap: 10px;
}
.brand-mark {
  height: 26px;
  width: auto;
  max-width: 200px;
  object-fit: contain;
  flex: none;
}
.brand-text {
  display: flex;
  flex-direction: column;
}
.brand-name {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 15px;
  letter-spacing: 0.01em;
  color: var(--husk-paper);
}
.brand-loc {
  font-size: 9px;
  letter-spacing: 0.14em;
  color: var(--ripening-gold);
  text-transform: uppercase;
  margin-top: 1px;
}
.nav-right {
  display: flex;
  align-items: center;
  gap: 16px;
}
.lang-seg {
  background: none;
  border: none;
  color: var(--husk-paper);
  opacity: 0.8;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 8px;
  font-family: var(--font-mono);
  font-size: 12px;
  letter-spacing: 0.04em;
  cursor: pointer;
  transition:
    color 0.25s var(--landing-ease),
    opacity 0.25s;
}
.lang-seg:hover {
  color: var(--ripening-gold);
  opacity: 1;
}

.landing-cta {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 13.5px;
  padding: 10px 18px;
  border-radius: 8px;
  border: 1px solid transparent;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  transition:
    transform 0.35s var(--landing-ease),
    background 0.25s,
    border-color 0.25s,
    box-shadow 0.3s;
}
.landing-cta.primary {
  background: var(--ripening-gold);
  color: var(--paddy-night);
}
.landing-cta.primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 24px -8px rgba(227, 167, 46, 0.55);
}
.landing-cta.ghost {
  border-color: var(--line-on-dark);
  color: var(--husk-paper);
  background: transparent;
}
.landing-cta.ghost:hover {
  border-color: var(--ripening-gold);
  color: var(--ripening-gold);
}
.landing-cta.small {
  padding: 8px 14px;
  font-size: 12px;
}

/* ============ HERO ============ */
.landing-hero {
  min-height: 100svh;
  display: flex;
  align-items: flex-end;
  padding: 60px 28px 64px;
}
.hero-bg {
  position: absolute;
  inset: 0;
  overflow: hidden;
}
.hero-bg .layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.hero-bg .layer.truecolor {
  filter: saturate(1.05) brightness(0.72) contrast(1.05);
}
.hero-bg .layer.ndvi {
  filter: hue-rotate(-28deg) saturate(2.6) contrast(1.25) brightness(0.62)
    sepia(0.15);
  clip-path: polygon(0 0, var(--wipe, 38%) 0, var(--wipe, 38%) 100%, 0 100%);
  transition: clip-path 1.4s var(--landing-ease);
}
.hero-bg .ndvi-tint {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    100deg,
    rgba(193, 68, 60, 0.28) 0%,
    rgba(227, 167, 46, 0.24) 45%,
    rgba(107, 168, 95, 0.34) 100%
  );
  clip-path: polygon(0 0, var(--wipe, 38%) 0, var(--wipe, 38%) 100%, 0 100%);
  mix-blend-mode: color;
  transition: clip-path 1.4s var(--landing-ease);
}
.hero-bg .scanbar {
  position: absolute;
  top: 0;
  bottom: 0;
  left: var(--wipe, 38%);
  width: 3px;
  transform: translateX(-1.5px);
  background: linear-gradient(
    to bottom,
    transparent,
    var(--ripening-gold),
    transparent
  );
  box-shadow: 0 0 24px 2px rgba(227, 167, 46, 0.7);
  transition: left 1.4s var(--landing-ease);
}
.hero-bg .scrim {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to top,
    var(--paddy-night) 2%,
    rgba(15, 31, 22, 0.35) 46%,
    rgba(15, 31, 22, 0.55) 100%
  );
}
.hero-bg .scanlabel {
  position: absolute;
  top: 24px;
  left: var(--wipe, 38%);
  transform: translateX(14px);
  font-family: var(--font-mono);
  font-size: 10.5px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ripening-gold);
  background: rgba(15, 31, 22, 0.55);
  padding: 5px 9px;
  border: 1px solid rgba(227, 167, 46, 0.4);
  border-radius: 4px;
  white-space: nowrap;
  transition: left 1.4s var(--landing-ease);
}

.landing-hero-content {
  position: relative;
  z-index: 5;
  width: 100%;
  max-width: 1080px;
  margin: 0 auto;
}
.landing-eyebrow {
  font-size: 11.5px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ripening-gold);
  margin-bottom: 18px;
  display: flex;
  align-items: center;
  gap: 9px;
}
.landing-eyebrow.center {
  justify-content: center;
}
.landing-eyebrow::before {
  content: "";
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--canopy-green);
  box-shadow: 0 0 0 3px rgba(107, 168, 95, 0.25);
  animation: landing-pulse 2.4s ease-in-out infinite;
}
@keyframes landing-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
}

.landing-title {
  font-family: var(--font-display);
  font-weight: 600;
  letter-spacing: -0.02em;
  font-size: clamp(32px, 6vw, 62px);
  line-height: 1.03;
  max-width: 760px;
  margin-bottom: 22px;
  color: var(--husk-paper);
}
.landing-title-accent {
  color: var(--ripening-gold);
}
.landing-subtitle {
  max-width: 520px;
  font-size: 16.5px;
  color: var(--husk-paper-dim);
  margin-bottom: 34px;
}
.landing-cta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  margin-bottom: 46px;
}

.landing-stats {
  display: flex;
  gap: 36px;
  flex-wrap: wrap;
  border-top: 1px solid var(--line-on-dark);
  padding-top: 22px;
  max-width: 640px;
}
.landing-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.landing-stat-num {
  font-family: var(--font-mono);
  font-size: 26px;
  color: var(--husk-paper);
  font-weight: 500;
}
.landing-stat-lbl {
  font-size: 11.5px;
  color: var(--husk-paper-dim);
  letter-spacing: 0.03em;
}

/* ---- 3D satellite ---- */
.sat-stage {
  position: absolute;
  right: 4%;
  top: 16%;
  width: 280px;
  height: 280px;
  perspective: 900px;
  z-index: 4;
  display: none;
}
@media (min-width: 900px) {
  .sat-stage {
    display: block;
  }
}
.sat3d {
  width: 100%;
  height: 100%;
  position: relative;
  transform-style: preserve-3d;
  transform: rotateX(var(--mx, -14deg)) rotateY(var(--my, 22deg));
  animation: landing-satspin 22s linear infinite;
  transition: transform 0.4s var(--landing-ease);
}
@keyframes landing-satspin {
  from {
    margin-left: 0;
  }
  to {
    margin-left: 0;
  }
}
.sat-body {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 56px;
  height: 56px;
  margin: -28px 0 0 -28px;
  transform-style: preserve-3d;
  animation: landing-bodyspin 16s linear infinite;
}
@keyframes landing-bodyspin {
  from {
    transform: rotateY(0deg);
  }
  to {
    transform: rotateY(360deg);
  }
}
.sat-face {
  position: absolute;
  width: 56px;
  height: 56px;
  background: linear-gradient(135deg, var(--husk-paper) 0%, #cfc8ac 100%);
  border: 1px solid rgba(15, 31, 22, 0.4);
}
.sat-face.f {
  transform: translateZ(28px);
}
.sat-face.b {
  transform: translateZ(-28px) rotateY(180deg);
}
.sat-face.l {
  transform: rotateY(-90deg) translateZ(28px);
  background: linear-gradient(135deg, #cfc8ac, #a9a186);
}
.sat-face.r {
  transform: rotateY(90deg) translateZ(28px);
  background: linear-gradient(135deg, #cfc8ac, #a9a186);
}
.sat-face.t {
  transform: rotateX(90deg) translateZ(28px);
  background: #e8e2c8;
}
.sat-face.d {
  transform: rotateX(-90deg) translateZ(28px);
  background: #8f8870;
}
.sat-panel {
  position: absolute;
  top: 50%;
  width: 78px;
  height: 30px;
  margin-top: -15px;
  background: repeating-linear-gradient(90deg, #14304c 0 8px, #1c3f63 8px 16px);
  border: 1px solid rgba(227, 167, 46, 0.5);
  transform-style: preserve-3d;
}
.sat-panel.left {
  left: 50%;
  margin-left: -134px;
  transform: rotateX(8deg) rotateY(4deg);
}
.sat-panel.right {
  left: 50%;
  margin-left: 56px;
  transform: rotateX(8deg) rotateY(4deg);
}
.sat-dish {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 30px;
  height: 30px;
  margin: -46px 0 0 -15px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #f4efd9, #b7ad8b 70%);
  border: 1px solid rgba(15, 31, 22, 0.5);
  transform: rotateX(55deg);
}
.sat-glow {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    rgba(227, 167, 46, 0.18),
    transparent 65%
  );
  filter: blur(6px);
}
.orbit-svg {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 420px;
  height: 150px;
  transform: translate(-50%, -50%);
  overflow: visible;
  z-index: 1;
  pointer-events: none;
}
.orbit-svg ellipse {
  fill: none;
  stroke: rgba(243, 238, 220, 0.16);
  stroke-width: 1;
  stroke-dasharray: 2 7;
}
.sat-orbiter {
  position: absolute;
  inset: 0;
  will-change: transform;
  z-index: 2;
}
:deep(.trail-dot) {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 5px;
  height: 5px;
  margin: -2.5px 0 0 -2.5px;
  border-radius: 50%;
  background: var(--ripening-gold);
  z-index: 1;
  pointer-events: none;
  opacity: 0;
  box-shadow: 0 0 6px 1px rgba(227, 167, 46, 0.55);
  will-change: transform, opacity;
}
.sat-beam {
  position: absolute;
  left: 50%;
  top: 98px;
  width: 240px;
  height: 280px;
  margin-left: -120px;
  transform-origin: top center;
  transform: skewX(var(--beamskew, 0deg));
  clip-path: polygon(48.5% 0%, 51.5% 0%, 100% 100%, 0% 100%);
  background: linear-gradient(
    to bottom,
    rgba(227, 167, 46, 0.62) 0%,
    rgba(227, 167, 46, 0.22) 40%,
    rgba(227, 167, 46, 0.06) 75%,
    rgba(227, 167, 46, 0) 100%
  );
  mix-blend-mode: screen;
  z-index: 2;
  pointer-events: none;
  animation: landing-beampulse 3.6s ease-in-out infinite;
}
@keyframes landing-beampulse {
  0%,
  100% {
    opacity: 0.55;
    filter: brightness(1);
  }
  50% {
    opacity: 0.95;
    filter: brightness(1.25);
  }
}
.beam-target {
  position: absolute;
  left: 50%;
  top: 376px;
  width: 64px;
  height: 64px;
  margin: -32px 0 0 -32px;
  z-index: 2;
  pointer-events: none;
}
.beam-target i {
  position: absolute;
  inset: 0;
  border: 1.4px solid rgba(227, 167, 46, 0.6);
  border-radius: 50%;
  animation: landing-pingring 3.6s ease-out infinite;
}
.beam-target i:nth-child(2) {
  animation-delay: 1.2s;
}
.beam-target i:nth-child(3) {
  animation-delay: 2.4s;
}
.beam-target .dot {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 6px;
  height: 6px;
  margin: -3px 0 0 -3px;
  background: var(--ripening-gold);
  border-radius: 50%;
  box-shadow: 0 0 14px 3px rgba(227, 167, 46, 0.85);
}
@keyframes landing-pingring {
  0% {
    transform: scale(0.15);
    opacity: 0.85;
  }
  100% {
    transform: scale(1);
    opacity: 0;
  }
}

.scroll-cue {
  position: absolute;
  bottom: 20px;
  left: 28px;
  z-index: 5;
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--husk-paper-dim);
  display: flex;
  align-items: center;
  gap: 8px;
}
.scroll-cue .bar {
  width: 1px;
  height: 26px;
  background: linear-gradient(to bottom, var(--ripening-gold), transparent);
  animation: landing-scrollcue 1.8s ease-in-out infinite;
}
@keyframes landing-scrollcue {
  0% {
    transform: scaleY(0.3);
    opacity: 0.3;
  }
  50% {
    transform: scaleY(1);
    opacity: 1;
  }
  100% {
    transform: scaleY(0.3);
    opacity: 0.3;
  }
}

/* ============ SECTIONS ============ */
.landing-section {
  max-width: 1080px;
  margin: 0 auto;
  padding: 90px 28px;
}

/* New indices block: intro sits tight against the first comparison below it,
   so the six IndexSection rows create the visual rhythm, not the header. */
#landing-indices {
  padding-bottom: 40px;
}
.landing-eyebrow {
  margin-bottom: 14px;
}
.landing-h2 {
  font-family: var(--font-display);
  font-weight: 600;
  letter-spacing: -0.015em;
  font-size: clamp(26px, 4vw, 40px);
  max-width: 640px;
  margin: 0 auto 18px;
  line-height: 1.08;
  text-align: center;
  color: var(--husk-paper);
}
.landing-h2.align-left {
  text-align: left;
  margin-left: 0;
}
.landing-h2.small {
  font-size: clamp(22px, 3vw, 30px);
}
.landing-lead {
  max-width: 560px;
  color: var(--husk-paper-dim);
  font-size: 15.5px;
  margin: 0 auto;
  text-align: center;
}
.landing-lead.align-left {
  text-align: left;
  margin-left: 0;
}

.reveal {
  opacity: 0;
  transform: translateY(28px);
  transition:
    opacity 0.8s var(--landing-ease),
    transform 0.8s var(--landing-ease);
}
.reveal.in {
  opacity: 1;
  transform: translateY(0);
}

/* ---- Problem ---- */
.landing-problem-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 40px;
  align-items: start;
}
@media (min-width: 800px) {
  .landing-problem-grid {
    grid-template-columns: 1.1fr 0.9fr;
  }
}
.problem-cards {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.landing-card.stacked p {
  font-size: 14.5px;
  color: var(--husk-paper-dim);
}

/* ---- Cards / features ---- */
.landing-card {
  background: var(--canopy);
  border: 1px solid var(--line-on-dark);
  border-radius: 14px;
  padding: 26px;
  transform-style: preserve-3d;
  transition:
    transform 0.25s var(--landing-ease),
    border-color 0.25s;
  will-change: transform;
}
.landing-card:hover {
  border-color: rgba(227, 167, 46, 0.45);
}
.landing-card-icon {
  width: 34px;
  height: 34px;
  margin-bottom: 18px;
  color: var(--ripening-gold);
  font-size: 22px;
  display: flex;
  align-items: center;
}
.landing-card h3 {
  font-family: var(--font-display);
  font-size: 16.5px;
  font-weight: 600;
  margin-bottom: 8px;
  letter-spacing: -0.005em;
  color: var(--husk-paper);
}
.landing-card p {
  font-size: 13.5px;
  color: var(--husk-paper-dim);
}
.landing-grid {
  margin-top: 50px;
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
}
@media (min-width: 640px) {
  .landing-grid {
    grid-template-columns: 1fr 1fr;
  }
}
@media (min-width: 1000px) {
  .landing-grid {
    grid-template-columns: 1fr 1fr 1fr;
  }
}

.tag {
  font-family: var(--font-mono);
  font-size: 10.5px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  padding: 3px 8px;
  border-radius: 4px;
  display: inline-block;
  margin-bottom: 10px;
}
.tag-red {
  background: rgba(193, 68, 60, 0.18);
  color: #e8837c;
}
.tag-gold {
  background: rgba(227, 167, 46, 0.16);
  color: var(--ripening-gold);
}
.tag-green {
  background: rgba(107, 168, 95, 0.18);
  color: var(--canopy-green);
}

/* ---- How it works ---- */
.landing-steps-media {
  margin-top: 56px;
  display: flex;
  flex-direction: column;
}
.step-row {
  display: grid;
  grid-template-columns: 1fr;
  gap: 26px;
  padding: 44px 0;
  border-top: 1px solid var(--line-on-dark);
  align-items: center;
}
@media (min-width: 820px) {
  .step-row {
    grid-template-columns: 0.9fr 1.1fr;
  }
  .step-row.rev .step-media {
    order: 2;
  }
  .step-row.rev .step-text {
    order: 1;
  }
}
.landing-step-num {
  font-size: 13px;
  color: var(--ripening-gold);
  letter-spacing: 0.06em;
  margin-bottom: 10px;
  display: block;
}
.step-text h3 {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 22px;
  margin-bottom: 10px;
  letter-spacing: -0.01em;
  color: var(--husk-paper);
}
.step-text p {
  font-size: 14.5px;
  color: var(--husk-paper-dim);
  max-width: 440px;
}
.step-media {
  position: relative;
  border-radius: 14px;
  overflow: hidden;
  aspect-ratio: 4/3;
  transition:
    transform 0.5s var(--landing-ease),
    box-shadow 0.5s var(--landing-ease);
  box-shadow: 0 18px 40px -20px rgba(0, 0, 0, 0.45);
}
.step-media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.step-media:hover {
  transform: perspective(900px) rotateY(-4deg) rotateX(2deg) scale(1.015);
  box-shadow: 0 30px 54px -18px rgba(0, 0, 0, 0.55);
}
.step-media .cap {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 10px 14px;
  background: linear-gradient(to top, rgba(15, 31, 22, 0.9), transparent);
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.06em;
  color: var(--husk-paper-dim);
}

/* ---- Language / mock ---- */
.mock-wrap {
  margin-top: 10px;
  display: grid;
  grid-template-columns: 1fr;
  gap: 40px;
  align-items: center;
}
@media (min-width: 900px) {
  .mock-wrap {
    grid-template-columns: 1fr 1.05fr;
  }
}
.lang-switch {
  display: flex;
  gap: 10px;
  margin-top: 26px;
}
.lang-switch button {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.04em;
  padding: 8px 16px;
  border-radius: 999px;
  border: 1px solid var(--line-on-dark);
  background: rgba(255, 255, 255, 0.04);
  color: var(--husk-paper-dim);
  cursor: pointer;
}
.lang-switch button.on {
  background: var(--ripening-gold);
  color: var(--paddy-night);
  border-color: transparent;
  font-weight: 700;
}

.mock-panel {
  background: var(--canopy);
  border: 1px solid var(--line-on-dark);
  border-radius: 16px;
  padding: 18px;
  transform: perspective(1200px) rotateY(-6deg) rotateX(2deg);
  transition: transform 0.5s var(--landing-ease);
  box-shadow: 0 30px 60px -24px rgba(0, 0, 0, 0.5);
}
.mock-panel:hover {
  transform: perspective(1200px) rotateY(0deg) rotateX(0deg);
}
.mock-topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}
.mock-dots {
  display: flex;
  gap: 5px;
}
.mock-dots span {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--line-on-dark);
}
.mock-badge {
  font-family: var(--font-mono);
  font-size: 9.5px;
  color: var(--canopy-green);
  border: 1px solid rgba(107, 168, 95, 0.4);
  padding: 2px 7px;
  border-radius: 4px;
}
.mock-map {
  position: relative;
  height: 200px;
  border-radius: 10px;
  overflow: hidden;
  margin-bottom: 14px;
  background: linear-gradient(120deg, #173322, #0e2318 55%, #1e4028);
}
.mock-map svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.mock-field {
  position: absolute;
  left: 34%;
  top: 32%;
  width: 78px;
  height: 54px;
  border: 2px solid var(--ripening-gold);
  border-radius: 4px;
  box-shadow: 0 0 0 4px rgba(227, 167, 46, 0.12);
}
.mock-legend {
  position: absolute;
  bottom: 8px;
  left: 8px;
  display: flex;
  gap: 4px;
}
.mock-legend i {
  width: 16px;
  height: 6px;
  border-radius: 2px;
  display: block;
}
.mock-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 9px 2px;
  border-top: 1px solid var(--line-on-dark);
  font-size: 12.5px;
  color: var(--husk-paper-dim);
}
.mock-row b {
  font-weight: 500;
  color: var(--husk-paper);
}
.mock-row .pill {
  font-family: var(--font-mono);
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 999px;
}
.pill.healthy {
  background: rgba(107, 168, 95, 0.18);
  color: var(--canopy-green);
}
.pill.moderate {
  background: rgba(227, 167, 46, 0.18);
  color: var(--ripening-gold);
}

/* ---- Trust ---- */
.landing-trust-strip {
  margin-top: 44px;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.trust-chip {
  font-family: var(--font-mono);
  font-size: 12px;
  letter-spacing: 0.02em;
  border: 1px solid var(--line-on-dark);
  border-radius: 999px;
  padding: 9px 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--husk-paper-dim);
}
.trust-chip i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--canopy-green);
  display: block;
}

/* ---- CTA ---- */
.landing-cta-section {
  padding: 120px 28px;
  text-align: center;
  position: relative;
  overflow: hidden;
}
.landing-cta-section::before {
  content: "";
  position: absolute;
  inset: -20%;
  background: radial-gradient(
    circle at 50% 30%,
    rgba(227, 167, 46, 0.14),
    transparent 60%
  );
}
.landing-cta-title {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: clamp(28px, 5vw, 48px);
  max-width: 680px;
  margin: 0 auto 20px;
  letter-spacing: -0.02em;
  position: relative;
  color: var(--husk-paper);
}
.landing-cta-sub {
  color: var(--husk-paper-dim);
  max-width: 480px;
  margin: 0 auto 34px;
  position: relative;
}
.landing-cta-row.inline {
  justify-content: center;
  position: relative;
  margin-bottom: 0;
}

/* ---- Footer ---- */
.landing-footer {
  max-width: 1080px;
  margin: 0 auto;
  border-top: 1px solid var(--line-on-dark);
  padding: 36px 28px;
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 20px;
  align-items: center;
}
.footer-credit {
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: var(--husk-paper-dim);
  opacity: 0.7;
  max-width: 520px;
  line-height: 1.6;
}
.footer-links {
  display: flex;
  gap: 18px;
  font-size: 12.5px;
}
.footer-links button {
  background: none;
  border: none;
  padding: 0;
  color: var(--husk-paper-dim);
  cursor: pointer;
  font-family: inherit;
  font-size: inherit;
}
.footer-links button:hover {
  color: var(--ripening-gold);
}

/* Compact nav on phones: hide the location subtitle (nothing meaningful
   pre-login) instead of truncating it; drop the Install label to icon-only
   so the row stays unwrapped. */
@media (max-width: 640px) {
  .landing-nav .brand-loc {
    display: none;
  }
}
@media (max-width: 520px) {
  .landing-nav {
    padding: 12px 14px;
  }
  .nav-right {
    gap: 8px;
  }
  .download-btn span {
    display: none;
  }
  .download-btn {
    padding: 8px 10px;
  }
}
</style>
