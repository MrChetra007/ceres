<template>
  <div
    v-if="state.landingVisible"
    class="ceres-landing bg-grain"
    :class="{ leaving: leaving }"
  >
    <!-- ============ NAV ============ -->
    <nav class="cl-nav">
      <div class="cl-nav-inner">
        <a href="#" class="cl-brand" @click.prevent>
          <div class="cl-brand-mark">
            <svg viewBox="0 0 32 32">
              <circle cx="16" cy="16" r="11" fill="none" stroke="var(--green)" stroke-width="1.2" />
              <ellipse cx="16" cy="16" rx="14" ry="5" fill="none" stroke="var(--blue)" stroke-width="1" transform="rotate(-28 16 16)" />
              <circle cx="16" cy="16" r="2.5" fill="var(--green)" />
              <circle cx="28" cy="9" r="1.5" fill="var(--blue)" />
            </svg>
          </div>
          <div class="cl-brand-text">
            <div class="cl-brand-name">Ceres</div>
            <div class="cl-brand-sub">CE-01 · CAMBODIA</div>
          </div>
        </a>

        <div class="cl-nav-links">
          <a href="#problem" @click.prevent="scrollTo('#problem')">Problem</a>
          <a href="#how" @click.prevent="scrollTo('#how')">How it works</a>
          <a href="#features" @click.prevent="scrollTo('#features')">Features</a>
          <a href="#tiers" @click.prevent="scrollTo('#tiers')">Who it's for</a>
        </div>

        <div class="cl-nav-right">
          <div class="cl-lang-seg">
            <button :class="{ on: state.preferredLanguage === 'en' }" @click="setLang('en')">EN</button>
            <button :class="{ on: state.preferredLanguage === 'km' }" @click="setLang('km')">ខ្មែរ</button>
          </div>
          <button class="cl-btn ghost" @click="enter">Sign in</button>
          <button class="cl-btn primary" @click="enter">
            Join the pilot
            <i class="ti ti-arrow-right"></i>
          </button>
        </div>
      </div>
    </nav>

    <!-- ============ HERO ============ -->
    <section id="hero" class="cl-hero">
      <div id="hero-globe" ref="heroGlobe"></div>
      <div class="cl-hero-vignette"></div>

      <div class="cl-hud cl-hud-left">
        <div class="cl-hud-live"><span class="cl-dot green pulse-dot"></span> Sentinel-2 · live feed</div>
        <div>11.5564°N · 104.9282°E</div>
        <div>Battambang · Kampong Thom</div>
      </div>

      <div class="cl-hud cl-hud-right">
        <div>SOL 241 · ORBIT 27,914</div>
        <div>CLOUD COVER · 8%</div>
        <div>NEXT PASS · 02:47 UTC</div>
      </div>

      <div class="cl-hero-content">
        <div class="cl-eyebrow mb"><span class="cl-eyebrow-line"></span>For Cambodia's rain-fed rice farms</div>
        <h1 class="cl-h1">
          <span class="font-serif italic">Early warning</span><br />
          <span class="font-light">from </span><span class="font-medium">orbit</span><span class="font-light">,</span><br />
          <span class="font-light">for the </span><span class="font-serif italic text-gradient-green">rice field.</span>
        </h1>
        <p class="cl-hero-sub">
          Ceres reads Sentinel-2 and Sentinel-1 satellite imagery and turns it into plain-language
          crop health alerts — sent straight to Telegram, in Khmer or English, before stress is ever
          visible to the eye.
        </p>
        <p class="cl-hero-khmer" lang="km">សេរេសអានរូបភាពផ្កាយរណប និងប្រាប់អ្នកពីសុខភាពស្រែរបស់អ្នក — មុនពេលមើលឃើញដោយភ្នែក។</p>

        <div class="cl-cta-row">
          <button class="cl-btn primary lg" @click="enter">
            Join the pilot — free for farmers
            <i class="ti ti-arrow-right"></i>
          </button>
          <button class="cl-btn ghost lg" @click="scrollTo('#how')">
            <i class="ti ti-player-play"></i> See how it works
          </button>
        </div>
      </div>

      <div class="cl-marquee">
        <div class="cl-marquee-track">
          <template v-for="n in 2" :key="n">
            <span class="cl-marquee-item"><span class="cl-dot green"></span> NDVI · Normalized Difference Vegetation Index</span>
            <span class="cl-marquee-item"><span class="cl-dot blue"></span> NDWI · Water stress</span>
            <span class="cl-marquee-item"><span class="cl-dot bright"></span> LSWI · Leaf water content</span>
            <span class="cl-marquee-item"><span class="cl-dot amber"></span> RVI · Radar vegetation index (cloud-penetration)</span>
            <span class="cl-marquee-item"><span class="cl-dot green"></span> 6-stage rice phenology model</span>
            <span class="cl-marquee-item"><span class="cl-dot blue"></span> 10-day revisit cadence</span>
          </template>
        </div>
      </div>

      <div class="cl-scroll-hint">
        Scroll to descend
        <svg width="12" height="20" viewBox="0 0 12 20" fill="none">
          <path d="M6 1v16m0 0-4-4m4 4 4-4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
        </svg>
      </div>
    </section>

    <!-- ============ PROBLEM ============ -->
    <section id="problem" class="cl-section cl-problem">
      <div class="cl-container">
        <div class="cl-heading-grid">
          <div class="cl-heading-col">
            <div class="cl-eyebrow reveal">01 / The problem</div>
            <h2 class="cl-h2 font-light reveal delay-1">
              <span class="font-serif italic">Rain falls.</span><br />
              Rain doesn't fall.<br />
              The farmer finds out<br />
              <span class="cl-amber">two weeks late.</span>
            </h2>
          </div>
          <div class="cl-lead-col reveal delay-2">
            <p class="cl-lead">
              Most Cambodian rice farms are entirely rain-fed. No irrigation, no soil sensors, no
              drone flights. When a patch of a field starts to stress — too dry, too wet,
              nutrient-short, pest-hit — the farmer usually can't see it until the leaves yellow
              and curl. By then, the yield is already gone.
            </p>
            <p class="cl-lead-dim">
              The damage isn't visible from the ground until ~30% of the recoverable window has
              already closed. From orbit, it's visible in <span class="cl-bright">five days</span>.
            </p>
          </div>
        </div>

        <div class="reveal delay-3">
          <div class="cl-eyebrow">The cost of being late · visible-stress vs. satellite-detectable stress</div>
          <div class="cl-card p-6 lg-p8 cl-hud-card">
            <span class="hud-tl"></span><span class="hud-tr"></span><span class="hud-bl"></span><span class="hud-br"></span>

            <div class="cl-two-col mb">
              <div>
                <div class="cl-label blue">Without Ceres</div>
                <div class="cl-bignum red">~30 days</div>
                <div class="cl-small-muted">from onset to eye-visible yellowing</div>
              </div>
              <div>
                <div class="cl-label green">With Ceres</div>
                <div class="cl-bignum bright">~5 days</div>
                <div class="cl-small-muted">from onset to satellite-detectable NDVI shift</div>
              </div>
            </div>

            <div class="cl-timeline">
              <div class="cl-timeline-bar"></div>
              <div class="cl-tl-marker" style="left: 17%">
                <div class="cl-tl-line"></div>
                <div class="cl-tl-tag dark">satellite sees</div>
              </div>
              <div class="cl-tl-marker" style="left: 100%">
                <div class="cl-tl-line dim"></div>
              </div>
              <div class="cl-tl-caption" style="left: 0">Day 0 · stress onset</div>
              <div class="cl-tl-caption blue" style="left: 17%; transform: translateX(-50%)">Day 5 · Ceres alerts</div>
              <div class="cl-tl-caption red" style="right: 0">Day 30 · eye-visible</div>
            </div>

            <div class="cl-tier-stats">
              <div>
                <div class="cl-stat-num">80%</div>
                <div class="cl-stat-lbl">of Cambodian rice area is rain-fed, with no irrigation backup</div>
              </div>
              <div>
                <div class="cl-stat-num">~3M</div>
                <div class="cl-stat-lbl">households depend on rice as their primary income</div>
              </div>
              <div>
                <div class="cl-stat-num">0</div>
                <div class="cl-stat-lbl">early-warning tools built for a Khmer-speaking farmer on a $40 phone</div>
              </div>
            </div>
          </div>
        </div>

        <div class="cl-quote reveal">
          <div class="cl-quote-mark">"</div>
          <p class="cl-quote-text">
            When the leaves turn yellow, it's already over. We need to know
            <span class="cl-not-italic cl-bright">before</span> — when something can still be done.
          </p>
          <div class="cl-quote-attrib"><span class="cl-hr"></span>Sok Vanna · rice farmer, Battambang Province</div>
        </div>
      </div>
    </section>

    <!-- ============ HOW IT WORKS ============ -->
    <section id="how" class="cl-section cl-how">
      <div class="cl-grid-bg"></div>
      <div class="cl-container">
        <div class="cl-heading-grid">
          <div class="cl-heading-col">
            <div class="cl-eyebrow reveal">02 / How it works</div>
            <h2 class="cl-h2 font-light reveal delay-1">
              <span class="font-serif italic">Orbit</span> to<br />
              <span class="font-serif italic">alert,</span><br />
              in four moves.
            </h2>
          </div>
          <div class="cl-lead-col reveal delay-2">
            <p class="cl-lead">
              No new hardware in the field. No apps to install. Ceres runs on free public
              satellite data from the European Space Agency's Sentinel constellation and reaches
              farmers on the app they already use every day — Telegram.
            </p>
          </div>
        </div>

        <div class="cl-steps">
          <div class="cl-step reveal">
            <div class="cl-step-head">
              <div class="cl-step-kicker blue">Step 01</div>
              <div class="cl-step-meta">~every 5 days</div>
            </div>
            <div class="cl-step-icon">
              <svg viewBox="0 0 80 60">
                <rect x="32" y="20" width="16" height="14" fill="none" stroke="var(--blue)" stroke-width="1.2" />
                <rect x="36" y="24" width="8" height="6" fill="var(--blue)" opacity="0.3" />
                <line x1="20" y1="22" x2="32" y2="22" stroke="var(--blue)" stroke-width="1" />
                <line x1="20" y1="32" x2="32" y2="32" stroke="var(--blue)" stroke-width="1" />
                <line x1="48" y1="22" x2="60" y2="22" stroke="var(--blue)" stroke-width="1" />
                <line x1="48" y1="32" x2="60" y2="32" stroke="var(--blue)" stroke-width="1" />
                <line x1="20" y1="22" x2="20" y2="32" stroke="var(--blue)" stroke-width="1" />
                <line x1="60" y1="22" x2="60" y2="32" stroke="var(--blue)" stroke-width="1" />
                <line x1="40" y1="14" x2="40" y2="20" stroke="var(--blue)" stroke-width="1" />
                <circle cx="40" cy="12" r="2" fill="var(--blue)" />
                <path d="M30 36 L50 36 L60 52 L20 52 Z" fill="var(--blue)" opacity="0.08" />
                <path d="M30 36 L50 36" stroke="var(--blue)" stroke-width="0.8" stroke-dasharray="2 2" />
              </svg>
            </div>
            <h3 class="cl-step-title">Sentinel passes overhead</h3>
            <p class="cl-step-body">
              ESA's Sentinel-2 (optical) captures 10-metre multispectral imagery. When clouds roll
              in during monsoon, Sentinel-1's radar sees right through them.
            </p>
            <div class="cl-step-spec">
              <div>BANDS · B2 B3 B4 B8 B11 B12</div>
              <div>RESOLUTION · 10 m / pixel</div>
              <div>REVISIT · 5 days</div>
            </div>
          </div>

          <div class="cl-step reveal delay-1">
            <div class="cl-step-head">
              <div class="cl-step-kicker green">Step 02</div>
              <div class="cl-step-meta">~90 seconds</div>
            </div>
            <div class="cl-step-icon">
              <svg viewBox="0 0 80 60">
                <rect x="10" y="14" width="60" height="36" fill="none" stroke="var(--green)" stroke-width="1" opacity="0.5" />
                <g opacity="0.85">
                  <rect x="10" y="14" width="12" height="9" fill="var(--green)" />
                  <rect x="22" y="14" width="12" height="9" fill="var(--green-bright)" />
                  <rect x="34" y="14" width="12" height="9" fill="var(--green)" />
                  <rect x="46" y="14" width="12" height="9" fill="var(--amber)" />
                  <rect x="58" y="14" width="12" height="9" fill="var(--green)" />
                  <rect x="10" y="23" width="12" height="9" fill="var(--green-bright)" />
                  <rect x="22" y="23" width="12" height="9" fill="var(--green)" />
                  <rect x="34" y="23" width="12" height="9" fill="var(--amber)" />
                  <rect x="46" y="23" width="12" height="9" fill="var(--red)" opacity="0.7" />
                  <rect x="58" y="23" width="12" height="9" fill="var(--green)" />
                  <rect x="10" y="32" width="12" height="9" fill="var(--green)" />
                  <rect x="22" y="32" width="12" height="9" fill="var(--green-bright)" />
                  <rect x="34" y="32" width="12" height="9" fill="var(--green)" />
                  <rect x="46" y="32" width="12" height="9" fill="var(--amber)" />
                  <rect x="58" y="32" width="12" height="9" fill="var(--green)" />
                  <rect x="10" y="41" width="12" height="9" fill="var(--green)" />
                  <rect x="22" y="41" width="12" height="9" fill="var(--green)" />
                  <rect x="34" y="41" width="12" height="9" fill="var(--green-bright)" />
                  <rect x="46" y="41" width="12" height="9" fill="var(--green)" />
                  <rect x="58" y="41" width="12" height="9" fill="var(--green)" />
                </g>
                <circle cx="52" cy="27.5" r="5" fill="none" stroke="var(--fg)" stroke-width="1" />
                <line x1="52" y1="14" x2="52" y2="50" stroke="var(--fg)" stroke-width="0.4" stroke-dasharray="2 2" />
                <line x1="10" y1="27.5" x2="70" y2="27.5" stroke="var(--fg)" stroke-width="0.4" stroke-dasharray="2 2" />
              </svg>
            </div>
            <h3 class="cl-step-title">Ceres computes per-field health</h3>
            <p class="cl-step-body">
              NDVI, NDWI, LSWI and RVI are computed per field, then weighed against
              growth-stage-aware thresholds across 6 stages of rice phenology.
            </p>
            <div class="cl-step-spec">
              <div>STAGES · nursery → ripening</div>
              <div>RAIN CONTEXT · CHIRPS fused</div>
              <div>OUTPUT · per-zone health tag</div>
            </div>
          </div>

          <div class="cl-step reveal delay-2">
            <div class="cl-step-head">
              <div class="cl-step-kicker amber">Step 03</div>
              <div class="cl-step-meta">~3 seconds</div>
            </div>
            <div class="cl-step-icon">
              <svg viewBox="0 0 80 60">
                <rect x="22" y="18" width="36" height="24" rx="2" fill="none" stroke="var(--amber)" stroke-width="1.2" />
                <text x="40" y="33" text-anchor="middle" font-family="JetBrains Mono" font-size="8" fill="var(--amber)">LLM</text>
                <line x1="22" y1="24" x2="16" y2="24" stroke="var(--amber)" stroke-width="0.8" />
                <line x1="22" y1="30" x2="16" y2="30" stroke="var(--amber)" stroke-width="0.8" />
                <line x1="22" y1="36" x2="16" y2="36" stroke="var(--amber)" stroke-width="0.8" />
                <line x1="58" y1="24" x2="64" y2="24" stroke="var(--amber)" stroke-width="0.8" />
                <line x1="58" y1="30" x2="64" y2="30" stroke="var(--amber)" stroke-width="0.8" />
                <line x1="58" y1="36" x2="64" y2="36" stroke="var(--amber)" stroke-width="0.8" />
                <path d="M10 30 L18 30" stroke="var(--green)" stroke-width="1.2" />
                <text x="10" y="26" font-family="JetBrains Mono" font-size="6" fill="var(--green)">NDVI</text>
                <text x="10" y="42" font-family="JetBrains Mono" font-size="6" fill="var(--green)">RAIN</text>
                <path d="M62 30 L70 30" stroke="var(--amber)" stroke-width="1.2" />
                <polygon points="70,30 66,28 66,32" fill="var(--amber)" />
              </svg>
            </div>
            <h3 class="cl-step-title">An AI writes the alert</h3>
            <p class="cl-step-body">
              A language model translates the numbers into a plain-language, stage-aware
              explanation — water stress vs. nutrient stress vs. pest pressure — in Khmer and
              English.
            </p>
            <div class="cl-step-spec">
              <div>LANGUAGES · ភាសាខ្មែរ / English</div>
              <div>TONE · farmer-first, no jargon</div>
              <div>ACTION · recommends next step</div>
            </div>
          </div>

          <div class="cl-step reveal delay-3">
            <div class="cl-step-head">
              <div class="cl-step-kicker blue">Step 04</div>
              <div class="cl-step-meta">delivered</div>
            </div>
            <div class="cl-step-icon">
              <svg viewBox="0 0 80 60">
                <circle cx="40" cy="30" r="18" fill="none" stroke="var(--blue)" stroke-width="1" opacity="0.4" />
                <circle cx="40" cy="30" r="12" fill="none" stroke="var(--blue)" stroke-width="0.8" opacity="0.6" />
                <path d="M48 22 L32 30 L38 33 L40 38 L43 34 L48 36 Z" fill="var(--blue)" />
                <path d="M48 22 L38 33" stroke="var(--bg)" stroke-width="0.6" />
                <circle cx="40" cy="30" r="22" fill="none" stroke="var(--blue)" stroke-width="0.6" opacity="0.3" />
              </svg>
            </div>
            <h3 class="cl-step-title">Telegram pings the farmer</h3>
            <p class="cl-step-body">
              The alert lands in Telegram — no new app, no logins. The farmer replies with a photo
              from the field for ground-truthing; the model learns from what comes back.
            </p>
            <div class="cl-step-spec">
              <div>DELIVERY · Telegram bot</div>
              <div>REPLY · photo → ground-truth</div>
              <div>LOOP · model retrains on confirm</div>
            </div>
          </div>
        </div>

        <div class="cl-pipeline-status reveal delay-4">
          <div class="cl-ps-live"><span class="cl-dot green pulse-dot"></span> Pipeline live</div>
          <div class="cl-ps-item">Last ingest · <b>02:14 UTC</b></div>
          <div class="cl-ps-item">Fields monitored · <b>14,308</b></div>
          <div class="cl-ps-item amber">Alerts sent (24h) · <b>412</b></div>
          <div class="cl-ps-item green">Photo replies · <b>87</b></div>
          <div class="cl-ps-item hide-lg">Latency · <b>96s avg</b></div>
        </div>
      </div>
    </section>

    <!-- ============ FEATURES ============ -->
    <section id="features" class="cl-section cl-features">
      <div class="cl-container">
        <div class="cl-heading-grid">
          <div class="cl-heading-col">
            <div class="cl-eyebrow reveal">03 / Inside Ceres</div>
            <h2 class="cl-h2 font-light reveal delay-1">
              <span class="font-serif italic">A dashboard</span><br />
              that speaks<br />
              agronomy, not<br />
              telemetry.
            </h2>
          </div>
          <div class="cl-lead-col reveal delay-2">
            <p class="cl-lead">
              For a co-op agronomist, Ceres is a precision-ag monitoring platform. For an
              individual farmer, it's a Telegram bot that just talks to them. Same engine, two
              surfaces — designed so the data only matters if it ends in action.
            </p>
          </div>
        </div>

        <div class="reveal delay-2 cl-dash-wrap">
          <div class="cl-card cl-hud-card cl-dashboard">
            <span class="hud-tl"></span><span class="hud-tr"></span><span class="hud-bl"></span><span class="hud-br"></span>

            <div class="cl-dash-top">
              <div class="cl-dash-top-left">
                <span class="cl-dash-field-label green"><span class="cl-dot green pulse-dot"></span> Field dashboard</span>
                <span>AOI · Battangbam cluster</span>
                <span class="hide-md">7 fields · 18.4 ha total</span>
              </div>
              <div class="cl-dash-top-right">
                <span class="hide-md">Revisit · 5d</span>
                <span>Image · Sentinel-2 L2A</span>
                <span class="cl-bright">Live</span>
              </div>
            </div>

            <div class="cl-dash-grid">
              <div class="cl-dash-main p-lg">
                <div class="cl-dash-main-head">
                  <div>
                    <div class="cl-label muted">Field · BTB-04</div>
                    <div class="cl-dash-title">Sok Vanna's north plot</div>
                  </div>
                  <div class="cl-band-row" ref="bandRow">
                    <button class="cl-band on" @click="switchBand($event)">NDVI</button>
                    <button class="cl-band" @click="switchBand($event)">NDWI</button>
                    <button class="cl-band" @click="switchBand($event)">LSWI</button>
                    <button class="cl-band" @click="switchBand($event)">RVI</button>
                  </div>
                </div>

                <div class="cl-canvas-wrap">
                  <canvas id="ndvi-canvas" ref="ndviCanvas" class="ndvi-canvas" width="640" height="360"></canvas>
                  <div class="cl-canvas-tl">2024 · 11 · 14 · 03:21 UTC</div>
                  <div class="cl-canvas-tr">10 m / px</div>
                  <div class="cl-canvas-br">
                    <span class="cl-c-red">●</span> 0.18
                    <span class="cl-c-amber">●</span> 0.42
                    <span class="cl-c-green">●</span> 0.68
                    <span class="cl-c-bright">●</span> 0.84
                  </div>
                  <div class="cl-crosshair" style="left: 38%; top: 52%">
                    <div class="cl-crosshair-box">
                      <div class="cl-crosshair-tag">stress zone · 0.18</div>
                    </div>
                  </div>
                </div>

                <div class="cl-timeline-slider">
                  <div class="cl-ts-head">
                    <span>Timeline · 90 days</span>
                    <span>Compare mode · OFF</span>
                  </div>
                  <div class="cl-ts-track">
                    <div class="cl-ts-progress"></div>
                    <div class="cl-ts-now">
                      <div class="cl-ts-nowline"></div>
                      <div class="cl-ts-nowtag">Nov 14 · today</div>
                    </div>
                    <div class="cl-ts-ticks">
                      <span>Aug 16</span><span>Sep 5</span><span>Sep 25</span><span>Oct 15</span><span>Nov 4</span><span>Nov 14</span>
                    </div>
                  </div>
                </div>
              </div>

              <div class="cl-dash-side p-lg">
                <div>
                  <div class="cl-label muted">Field health</div>
                  <div class="cl-dash-health">
                    <div class="cl-health-num amber">0.54</div>
                    <div class="cl-health-desc">moderate stress · NW quadrant</div>
                  </div>
                  <div class="cl-health-sub">avg NDVI · down 0.12 vs 5d ago</div>
                </div>

                <div class="cl-side-block">
                  <div class="cl-label muted">Growth stage</div>
                  <div class="cl-stage-name">Tillering <span class="cl-stage-count">stage 3 / 6</span></div>
                  <div class="cl-stage-bar">
                    <i class="on"></i><i class="on"></i><i class="on bright"></i><i></i><i></i><i></i>
                  </div>
                  <div class="cl-stage-ticks">
                    <span>NR</span><span>TR</span><span>TL</span><span>PI</span><span>BT</span><span>RP</span>
                  </div>
                </div>

                <div class="cl-side-block">
                  <div class="cl-label muted">Health breakdown · 7 zones</div>
                  <div class="cl-zone" v-for="z in zones" :key="z.label">
                    <span class="cl-zone-label">{{ z.label }}</span>
                    <div class="cl-zone-bar"><div :class="z.color" :style="{ width: z.width }"></div></div>
                    <span class="cl-zone-val" :class="z.color">{{ z.value }}</span>
                  </div>
                </div>

                <div class="cl-side-block-inline">
                  <button class="cl-export">Export PDF</button>
                  <button class="cl-export">Export PNG</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="cl-feature-row">
          <div class="cl-card feature-card p-6 reveal delay-1">
            <div class="cl-feature-head">
              <div class="cl-feature-kicker green">Feature · Consult AI</div>
              <div class="cl-dot green pulse-dot"></div>
            </div>
            <h3 class="cl-feature-title">Ask the agronomist</h3>
            <p class="cl-feature-body">
              An AI that has read your field's NDVI history and local rainfall explains what's
              happening — and what to do — in plain Khmer.
            </p>
            <div class="cl-chat">
              <div class="cl-chat-in">
                <div class="cl-avatar">V</div>
                <div class="cl-bubble">តើផ្ទៃណាខ្លះកំពុងមានបញ្ហា?</div>
              </div>
              <div class="cl-chat-out">
                <div class="cl-bubble ai">
                  The north-west corner of BTB-04 dropped to NDVI 0.18 in the last pass. Rainfall in
                  your area has been 41% below the 10-year norm for this week of the season. At
                  tillering stage, this pattern matches water stress, not pest damage.
                </div>
                <div class="cl-avatar ci">C</div>
              </div>
              <div class="cl-chat-out">
                <div class="cl-bubble ai">ប្រសិនបើអ្នកអាចបូកបាន សូមផ្ញើរូបថតចម្ងាយជិង។</div>
                <div class="cl-avatar ci">C</div>
              </div>
            </div>
          </div>

          <div class="cl-card feature-card p-6 reveal delay-2">
            <div class="cl-feature-head">
              <div class="cl-feature-kicker blue">Feature · Alerts</div>
              <div class="cl-dot blue pulse-dot"></div>
            </div>
            <h3 class="cl-feature-title">A Telegram bot, not a new app</h3>
            <p class="cl-feature-body">
              Ceres sends stage-aware, rainfall-contextualized alerts in Khmer or English — and the
              farmer replies with a photo from the field for ground-truthing.
            </p>
            <div class="cl-tg-mock">
              <div class="cl-tg-head">
                <div class="cl-tg-avatar">
                  <svg viewBox="0 0 20 20"><path d="M14 6 L7 11 L10 12 L11 15 L13 12 L16 13 Z" fill="var(--blue)" /></svg>
                </div>
                <div>
                  <div class="cl-tg-name">Ceres Bot</div>
                  <div class="cl-tg-status">online · 02:47 UTC</div>
                </div>
              </div>
              <div class="cl-tg-alert">
                <div class="cl-tg-alert-head"><span class="cl-dot red"></span> Stress alert · BTB-04</div>
                <div class="cl-tg-alert-text">ស្រែរបស់អ្នកនៅតំបន់ពារព្យួរមានស្ថានភាពស្ងួត។ ភាគឦសាននៃចម្ការបានធ្លាក់ចុះ NDVI ចំនួន ០.១២។ ភ្លៀងធ្លាក់តិចជាងឆ្នាំទាំងអស់ ៤១%។ ផ្តល់អនុស្សារថាស្គាំញញក្នុងរយៈ ៥ ថ្ងៃ។</div>
                <div class="cl-tg-reply">Reply with a field photo →</div>
              </div>
            </div>
          </div>

          <div class="cl-card feature-card p-6 reveal delay-3">
            <div class="cl-feature-head">
              <div class="cl-feature-kicker amber">Feature · Co-op view</div>
              <div class="cl-dot amber pulse-dot"></div>
            </div>
            <h3 class="cl-feature-title">Roll up 400 fields at once</h3>
            <p class="cl-feature-body">
              For co-ops and extension officers: see every member's fields in one health-ranked
              view, with a time-slider history, compare mode, and one-click PDF briefs per farmer.
            </p>
            <div class="cl-coop">
              <div class="cl-coop-head">
                <span>Farmer</span><span>Field</span><span>Stage</span><span class="ta-r">NDVI · Δ5d</span>
              </div>
              <div class="cl-coop-row" v-for="r in coopRows" :key="r.name">
                <span class="cl-coop-farmer font-khmer">{{ r.name }}</span>
                <span class="cl-coop-field">{{ r.field }}</span>
                <span class="cl-coop-stage">{{ r.stage }}</span>
                <span class="cl-coop-val ta-r" :class="r.color"><b :class="r.color">{{ r.val }}</b><span :class="r.color">{{ r.delta }}</span></span>
              </div>
              <div class="cl-coop-foot">Showing 4 of 412 · <span class="cl-amber">38 need attention</span></div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ============ WHO IT'S FOR ============ -->
    <section id="tiers" class="cl-section cl-tiers">
      <div class="cl-container">
        <div class="cl-heading-grid">
          <div class="cl-heading-col">
            <div class="cl-eyebrow reveal">04 / Who it's for</div>
            <h2 class="cl-h2 font-light reveal delay-1">
              <span class="font-serif italic">Same sky.</span><br />
              Two ways<br />
              to read it.
            </h2>
          </div>
          <div class="cl-lead-col reveal delay-2">
            <p class="cl-lead">
              Ceres is built first for the farmer with one phone and one field. The co-op tier is
              the same engine, rolled up across hundreds of fields — for the agronomist who advises
              them all.
            </p>
          </div>
        </div>

        <div class="cl-tier-grid">
          <div class="cl-card cl-hud-card cl-tier reveal">
            <span class="hud-tl"></span><span class="hud-tr"></span><span class="hud-bl"></span><span class="hud-br"></span>
            <div class="cl-tier-head">
              <div>
                <div class="cl-tier-eyebrow green">Individual · farmer</div>
                <h3 class="cl-tier-title">Ceres <span class="italic">Farmer</span></h3>
                <p class="cl-tier-sub">For one farmer, one to three fields.</p>
              </div>
              <div class="ta-r">
                <div class="cl-tier-price bright">Free</div>
                <div class="cl-tier-price-sub">always</div>
              </div>
            </div>
            <p class="cl-tier-desc">
              No app to install. The farmer chats with the Ceres Telegram bot in Khmer, draws their
              field on a map once, and receives alerts whenever a satellite pass detects stress.
            </p>
            <ul class="cl-tier-list">
              <li v-for="f in farmerFeatures" :key="f"><i class="ti ti-check"></i>{{ f }}</li>
            </ul>
            <button class="cl-btn primary full" @click="enter">Add your field <i class="ti ti-arrow-right"></i></button>
          </div>

          <div class="cl-card cl-hud-card cl-tier featured reveal delay-1">
            <span class="hud-tl"></span><span class="hud-tr"></span><span class="hud-bl"></span><span class="hud-br"></span>
            <div class="cl-tier-head">
              <div>
                <div class="cl-tier-eyebrow amber">Co-op · extension officer</div>
                <h3 class="cl-tier-title">Ceres <span class="italic">Co-op</span></h3>
                <p class="cl-tier-sub">For co-ops, NGOs, and extension programs.</p>
              </div>
              <div class="ta-r">
                <div class="cl-tier-price fg">$0.40</div>
                <div class="cl-tier-price-sub">/ ha / month</div>
              </div>
            </div>
            <p class="cl-tier-desc">
              A web dashboard that rolls up every member farmer's fields into one ranked view. Built
              for the agronomist who needs to triage 400 fields in a morning.
            </p>
            <ul class="cl-tier-list">
              <li v-for="f in coopFeatures" :key="f"><i class="ti ti-check"></i>{{ f }}</li>
            </ul>
            <button class="cl-btn ghost full amber-b" @click="enter">Book a co-op demo <i class="ti ti-arrow-right"></i></button>
          </div>
        </div>

        <div class="cl-real-pricing reveal">
          <div class="cl-eyebrow center mb">Plans &amp; pricing · real tiers</div>
          <PricingCards />
        </div>
      </div>
    </section>

    <!-- ============ CTA / WAITLIST ============ -->
    <section id="waitlist" class="cl-waitlist">
      <div class="cl-waitlist-orbit">
        <div class="cl-orbit-ring ring1"></div>
        <div class="cl-orbit-ring ring2"></div>
        <div class="cl-orbit-ring ring3"></div>
      </div>
      <div class="cl-waitlist-inner">
        <div class="cl-eyebrow center mb reveal">
          <span class="cl-eyebrow-line short"></span> Pilot · 2025 wet season <span class="cl-eyebrow-line short"></span>
        </div>
        <h2 class="cl-h2 center mb reveal delay-1">
          <span class="font-serif italic">See your field</span><br />
          from 786 km up —<br />
          <span class="text-gradient-green font-serif italic">before it's too late.</span>
        </h2>
        <p class="cl-waitlist-sub reveal delay-2">
          Ceres is in pilot with rice co-ops across Battambang and Kampong Thom for the 2025 wet
          season. Farmers join free, forever. Co-ops book a 30-minute walkthrough.
        </p>
        <button class="cl-btn primary lg reveal delay-3" @click="enter">Join the pilot <i class="ti ti-arrow-right"></i></button>
        <div class="cl-waitlist-foot reveal delay-4">
          <span class="cl-wl-item"><span class="cl-dot green"></span> Free for individual farmers</span>
          <span class="cl-wl-item"><span class="cl-dot blue"></span> Works on any phone with Telegram</span>
          <span class="cl-wl-item"><span class="cl-dot amber"></span> Khmer & English</span>
        </div>
      </div>
    </section>

    <!-- ============ FOOTER ============ -->
    <footer class="cl-footer">
      <div class="cl-footer-grid">
        <div class="cl-footer-brand">
          <div class="cl-brand">
            <div class="cl-brand-mark">
              <svg viewBox="0 0 32 32">
                <circle cx="16" cy="16" r="11" fill="none" stroke="var(--green)" stroke-width="1.2" />
                <ellipse cx="16" cy="16" rx="14" ry="5" fill="none" stroke="var(--blue)" stroke-width="1" transform="rotate(-28 16 16)" />
                <circle cx="16" cy="16" r="2.5" fill="var(--green)" />
                <circle cx="28" cy="9" r="1.5" fill="var(--blue)" />
              </svg>
            </div>
            <div class="cl-footer-brand-name">Ceres</div>
          </div>
          <p class="cl-footer-desc">Early warning from orbit, for Cambodia's rice fields. Built for the AI in Motion accelerator.</p>
          <p class="cl-footer-khmer font-khmer" lang="km">សេរេស — ព្រមានមុន ពីលើអវកាស សម្រាប់ស្រែស្រូវកម្ពុជា។</p>
        </div>
        <div class="cl-footer-col">
          <div class="cl-eyebrow">Product</div>
          <a href="#how" @click.prevent="scrollTo('#how')">How it works</a>
          <a href="#features" @click.prevent="scrollTo('#features')">Features</a>
          <a href="#tiers" @click.prevent="scrollTo('#tiers')">Pricing</a>
          <a href="#waitlist" @click.prevent="scrollTo('#waitlist')">Join the pilot</a>
        </div>
        <div class="cl-footer-col">
          <div class="cl-eyebrow">Data sources</div>
          <span>Sentinel-1 · SAR</span>
          <span>Sentinel-2 · MSI L2A</span>
          <span>CHIRPS · rainfall</span>
          <span>Copernicus / ESA</span>
        </div>
        <div class="cl-footer-col">
          <div class="cl-eyebrow">Built with</div>
          <span>Three.js · WebGL</span>
          <span>Google Earth Engine</span>
          <span>Telegram Bot API</span>
          <span>LLM agronomist layer</span>
        </div>
        <div class="cl-footer-col">
          <div class="cl-eyebrow">Contact</div>
          <a href="mailto:hello@ceres.ag">hello@ceres.ag</a>
          <a href="#waitlist" @click.prevent="scrollTo('#waitlist')">Telegram · @ceres_bot</a>
          <span>Phnom Penh · Battambang</span>
        </div>
      </div>
      <div class="cl-footer-bar">
        <span>© 2025 Ceres · Prototype for AI in Motion</span>
        <div>
          <span>Mission · CE-01</span>
          <span>Orbit · sun-synchronous, 786 km</span>
          <span class="cl-sys"><span class="cl-dot green pulse-dot"></span> All systems nominal</span>
        </div>
      </div>
    </footer>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { state } from '../store'
import * as store from '../store'
import PricingCards from '../components/PricingCards.vue'

const leaving = ref(false)

const heroGlobe = ref(null)
const ndviCanvas = ref(null)
const bandRow = ref(null)

let rendererRef = null
let animId = 0
let globeIO = null
let revealIO = null
let cleanups = []
let rafIds = []

const zones = [
  { label: 'NW', width: '22%', value: '0.18', color: 'red' },
  { label: 'N', width: '48%', value: '0.42', color: 'amber' },
  { label: 'NE', width: '68%', value: '0.68', color: 'green' },
  { label: 'W', width: '71%', value: '0.71', color: 'green' },
  { label: 'C', width: '82%', value: '0.82', color: 'bright' },
  { label: 'E', width: '74%', value: '0.74', color: 'green' },
  { label: 'SW · S · SE', width: '84%', value: '0.84', color: 'bright' },
]

const farmerFeatures = [
  'Up to 3 fields, mapped once via Telegram',
  'Khmer & English alerts on every Sentinel pass',
  'Photo-reply for ground-truthing & model retraining',
  '"Consult AI" — ask anything about your field',
  'Works on any phone that runs Telegram',
]

const coopFeatures = [
  'Unlimited fields, unlimited member farmers',
  'Multi-AOI dashboard with health-zone breakdowns',
  'Time-slider historical view + compare mode',
  'One-click PDF / PNG briefs per farmer or per cluster',
  'Bulk Telegram broadcast to at-risk farmers',
  'Ground-truth photo library, organized by field & date',
]

const coopRows = [
  { name: 'សុខ វណ្ណៈ', field: 'BTB-04', stage: 'TL', val: '0.18', delta: '▼0.12', color: 'red' },
  { name: 'ចាន ដារា', field: 'BTB-11', stage: 'PI', val: '0.51', delta: '▼0.04', color: 'amber' },
  { name: 'ហ៊ុន សុភា', field: 'KPT-02', stage: 'TL', val: '0.74', delta: '▲0.02', color: 'green' },
  { name: 'ឡាយ ប៊ុន', field: 'KPT-09', stage: 'BT', val: '0.83', delta: '▲0.01', color: 'bright' },
]

function setLang(lang) {
  state.preferredLanguage = lang
}

function scrollTo(sel) {
  document.querySelector(sel)?.scrollIntoView({ behavior: 'smooth' })
}

function enter() {
  leaving.value = true
  setTimeout(() => {
    store.dismissLanding()
    import('../router/index.js').then((m) => {
      const router = m.default
      if (router.currentRoute.value.path !== '/map') router.push('/map')
    })
  }, 400)
}

function switchBand(e) {
  const row = bandRow.value
  if (!row) return
  row.querySelectorAll('button').forEach((b) => {
    b.classList.remove('on')
    b.className = 'cl-band'
  })
  e.currentTarget.classList.add('on')
}

function drawNDVI() {
  const canvas = ndviCanvas.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const w = canvas.width
  const h = canvas.height
  function ndviColor(v) {
    if (v < 0.2) { const t = v / 0.2; return `rgb(${180 + t * 40}, ${50 + t * 30}, ${40 + t * 20})` }
    else if (v < 0.4) { const t = (v - 0.2) / 0.2; return `rgb(${220 - t * 100}, ${120 + t * 60}, ${50 + t * 20})` }
    else if (v < 0.6) { const t = (v - 0.4) / 0.2; return `rgb(${120 - t * 40}, ${140 + t * 30}, ${70})` }
    else if (v < 0.8) { const t = (v - 0.6) / 0.2; return `rgb(${80 - t * 40}, ${170 + t * 20}, ${80})` }
    else { const t = (v - 0.8) / 0.2; return `rgb(${130 + t * 40}, ${190 + t * 20}, ${98})` }
  }
  const cols = 64, rows = 36
  const cw = w / cols, ch = h / rows
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      let base = 0.72
      const dx = i / cols - 0.28, dy = j / rows - 0.3
      const d = Math.sqrt(dx * dx + dy * dy)
      base -= Math.max(0, 1 - d / 0.22) * 0.55
      const nStrip = Math.max(0, 1 - Math.abs(j / rows - 0.15) / 0.12)
      base -= nStrip * 0.15
      const seDx = i / cols - 0.75, seDy = j / rows - 0.7
      const seD = Math.sqrt(seDx * seDx + seDy * seDy)
      base += Math.max(0, 1 - seD / 0.3) * 0.12
      base += (Math.random() - 0.5) * 0.06
      base += Math.sin(i * 0.3) * 0.02
      base = Math.max(0.1, Math.min(0.9, base))
      ctx.fillStyle = ndviColor(base)
      ctx.fillRect(i * cw, j * ch, cw + 0.5, ch + 0.5)
    }
  }
  ctx.strokeStyle = 'rgba(235, 231, 212, 0.6)'
  ctx.lineWidth = 1.5
  ctx.setLineDash([4, 3])
  ctx.beginPath()
  ctx.moveTo(w * 0.08, h * 0.12)
  ctx.lineTo(w * 0.42, h * 0.06)
  ctx.lineTo(w * 0.78, h * 0.14)
  ctx.lineTo(w * 0.92, h * 0.48)
  ctx.lineTo(w * 0.86, h * 0.82)
  ctx.lineTo(w * 0.52, h * 0.92)
  ctx.lineTo(w * 0.18, h * 0.84)
  ctx.lineTo(w * 0.06, h * 0.46)
  ctx.closePath()
  ctx.stroke()
  ctx.setLineDash([])
}

function initGlobe(container) {
  const THREE = window.THREE
  if (!THREE) return
  let W = container.clientWidth
  let H = container.clientHeight
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 1000)
  camera.position.set(0, 0.4, 4.2)
  camera.lookAt(0, 0, 0)
  let renderer
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  } catch (e) {
    return
  }
  rendererRef = renderer
  renderer.setSize(W, H)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  container.appendChild(renderer.domElement)

  function makeStars() {
    const count = 1500
    const geo = new THREE.BufferGeometry()
    const positions = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const r = 30 + Math.random() * 30
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
      positions[i * 3 + 2] = r * Math.cos(phi)
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const mat = new THREE.PointsMaterial({ color: 0xebe7d4, size: 0.06, sizeAttenuation: true, transparent: true, opacity: 0.7 })
    return new THREE.Points(geo, mat)
  }
  scene.add(makeStars())

  const globeGroup = new THREE.Group()
  scene.add(globeGroup)
  const R = 1.15
  const innerMat = new THREE.MeshBasicMaterial({ color: 0x0a1020 })
  globeGroup.add(new THREE.Mesh(new THREE.SphereGeometry(R * 0.985, 48, 48), innerMat))

  function makeDottedSphere(radius, density) {
    const pts = []
    for (let i = 0; i < density; i++) {
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      pts.push(radius * Math.sin(phi) * Math.cos(theta), radius * Math.sin(phi) * Math.sin(theta), radius * Math.cos(phi))
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    const mat = new THREE.PointsMaterial({ color: 0x4a6a8a, size: 0.018, sizeAttenuation: true, transparent: true, opacity: 0.85 })
    return new THREE.Points(geo, mat)
  }
  globeGroup.add(makeDottedSphere(R, 4500))

  function makeLandCluster(latCenter, lonCenter, latSpread, lonSpread, count, color, sizeFactor) {
    const pts = []
    for (let i = 0; i < count; i++) {
      const lat = latCenter + (Math.random() - 0.5) * latSpread
      const lon = lonCenter + (Math.random() - 0.5) * lonSpread
      const phi = ((90 - lat) * Math.PI) / 180
      const theta = ((lon + 180) * Math.PI) / 180
      const r = R * 1.002
      pts.push(r * Math.sin(phi) * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta), r * Math.cos(phi))
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    const mat = new THREE.PointsMaterial({ color, size: 0.025 * sizeFactor, sizeAttenuation: true, transparent: true, opacity: 0.85 })
    return new THREE.Points(geo, mat)
  }
  globeGroup.add(makeLandCluster(15, 105, 14, 18, 350, 0x8fba4a, 1.2))
  globeGroup.add(makeLandCluster(30, 80, 18, 22, 280, 0x6a9a4a, 1.0))
  globeGroup.add(makeLandCluster(50, 30, 16, 26, 220, 0x5a8a4a, 0.9))
  globeGroup.add(makeLandCluster(35, -90, 14, 24, 240, 0x5a8a4a, 0.9))
  globeGroup.add(makeLandCluster(-15, -55, 14, 18, 180, 0x6a9a4a, 0.9))
  globeGroup.add(makeLandCluster(-15, 25, 18, 22, 200, 0x5a8a4a, 0.9))
  globeGroup.add(makeLandCluster(-30, 140, 12, 18, 160, 0x6a9a4a, 0.9))

  function makeLatRing(lat) {
    const phi = ((90 - lat) * Math.PI) / 180
    const r = R * Math.sin(phi)
    const y = R * Math.cos(phi)
    const segs = 96
    const pts = []
    for (let i = 0; i <= segs; i++) { const t = (i / segs) * Math.PI * 2; pts.push(r * Math.cos(t), y, r * Math.sin(t)) }
    const geo = new THREE.BufferGeometry().setFromPoints(pts)
    const mat = new THREE.LineBasicMaterial({ color: 0x2a8aab, transparent: true, opacity: 0.18 })
    return new THREE.Line(geo, mat)
  }
  globeGroup.add(makeLatRing(0))
  globeGroup.add(makeLatRing(30))
  globeGroup.add(makeLatRing(-30))

  const segs = 128
  const eqPts = []
  for (let i = 0; i <= segs; i++) { const t = (i / segs) * Math.PI * 2; eqPts.push(R * 1.005 * Math.cos(t), 0, R * 1.005 * Math.sin(t)) }
  const eqGeo = new THREE.BufferGeometry().setFromPoints(eqPts)
  const eqMat = new THREE.LineBasicMaterial({ color: 0x4ad6e4, transparent: true, opacity: 0.35 })
  globeGroup.add(new THREE.Line(eqGeo, eqMat))

  const CAM_LAT = 11.55, CAM_LON = 104.93
  function latLonToVec3(lat, lon, radius) {
    const phi = ((90 - lat) * Math.PI) / 180
    const theta = ((lon + 180) * Math.PI) / 180
    return new THREE.Vector3(radius * Math.sin(phi) * Math.cos(theta), radius * Math.cos(phi), radius * Math.sin(phi) * Math.sin(theta))
  }
  const camPos = latLonToVec3(CAM_LAT, CAM_LON, R * 1.01)
  const marker = new THREE.Mesh(new THREE.SphereGeometry(0.022, 16, 16), new THREE.MeshBasicMaterial({ color: 0xb8e062 }))
  marker.position.copy(camPos)
  globeGroup.add(marker)

  const pulseRings = []
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.04, 0.045, 32), new THREE.MeshBasicMaterial({ color: 0x8fba4a, transparent: true, opacity: 0.6, side: THREE.DoubleSide }))
    ring.position.copy(camPos)
    ring.lookAt(0, 0, 0)
    ring.userData.phase = i / 3
    globeGroup.add(ring)
    pulseRings.push(ring)
  }

  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.35, 8), new THREE.MeshBasicMaterial({ color: 0xb8e062, transparent: true, opacity: 0.4 }))
  beam.position.copy(camPos.clone().multiplyScalar(1.15))
  beam.lookAt(0, 0, 0)
  beam.rotateX(Math.PI / 2)
  globeGroup.add(beam)

  const orbitGroup = new THREE.Group()
  scene.add(orbitGroup)
  const orbitTilt = -0.35
  const oPts = []
  for (let i = 0; i <= 200; i++) { const t = (i / 200) * Math.PI * 2; oPts.push(1.95 * Math.cos(t), 0, 1.85 * Math.sin(t)) }
  const oGeo = new THREE.BufferGeometry().setFromPoints(oPts)
  const oMat = new THREE.LineDashedMaterial({ color: 0x4ad6e4, transparent: true, opacity: 0.35, dashSize: 0.08, gapSize: 0.04 })
  const orbit = new THREE.Line(oGeo, oMat)
  orbit.computeLineDistances()
  orbit.rotation.x = orbitTilt
  orbitGroup.add(orbit)

  const satGroup = new THREE.Group()
  satGroup.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.08), new THREE.MeshBasicMaterial({ color: 0xebe7d4 })))
  const panelMat = new THREE.MeshBasicMaterial({ color: 0x2a4a6a })
  const panelL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.005, 0.05), panelMat)
  panelL.position.x = -0.12
  const panelR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.005, 0.05), panelMat)
  panelR.position.x = 0.12
  satGroup.add(panelL, panelR)
  satGroup.add(new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 12), new THREE.MeshBasicMaterial({ color: 0x4ad6e4, transparent: true, opacity: 0.25 })))
  scene.add(satGroup)

  const dlGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0)])
  const downlink = new THREE.Line(dlGeo, new THREE.LineBasicMaterial({ color: 0x4ad6e4, transparent: true, opacity: 0.4 }))
  scene.add(downlink)

  let scrollProgress = 0, targetScrollProgress = 0
  let mouseX = 0, mouseY = 0, targetMouseX = 0, targetMouseY = 0
  let isDragging = false, dragStartX = 0, dragStartY = 0, dragRotX = 0, dragRotY = 0, dragRotXTarget = 0, dragRotYTarget = 0

  container.addEventListener('mousedown', (e) => { isDragging = true; dragStartX = e.clientX; dragStartY = e.clientY; dragRotXTarget = dragRotX; dragRotYTarget = dragRotY })
  const onMouseMove = (e) => {
    if (isDragging) { dragRotYTarget = dragRotY + (e.clientX - dragStartX) * 0.005; dragRotXTarget = dragRotX + (e.clientY - dragStartY) * 0.005 }
    const rect = container.getBoundingClientRect()
    targetMouseX = ((e.clientX - rect.left) / rect.width - 0.5) * 2
    targetMouseY = ((e.clientY - rect.top) / rect.height - 0.5) * 2
  }
  window.addEventListener('mousemove', onMouseMove)
  const onMouseUp = () => { if (isDragging) { isDragging = false; dragRotX = dragRotXTarget; dragRotY = dragRotYTarget } }
  window.addEventListener('mouseup', onMouseUp)

  const onTouchStart = (e) => { if (e.touches.length === 1) { isDragging = true; dragStartX = e.touches[0].clientX; dragStartY = e.touches[0].clientY } }
  container.addEventListener('touchstart', onTouchStart, { passive: true })
  const onTouchMove = (e) => { if (isDragging && e.touches.length === 1) { dragRotYTarget = dragRotY + (e.touches[0].clientX - dragStartX) * 0.005; dragRotXTarget = dragRotX + (e.touches[0].clientY - dragStartY) * 0.005 } }
  container.addEventListener('touchmove', onTouchMove, { passive: true })
  const onTouchEnd = () => { isDragging = false; dragRotX = dragRotXTarget; dragRotY = dragRotYTarget }
  container.addEventListener('touchend', onTouchEnd)

  function updateScroll() {
    const heroEl = document.getElementById('hero')
    if (!heroEl) return
    const rect = heroEl.getBoundingClientRect()
    const heroH = heroEl.offsetHeight
    targetScrollProgress = Math.max(0, Math.min(1, -rect.top / (heroH * 0.9)))
  }
  window.addEventListener('scroll', updateScroll, { passive: true })
  updateScroll()

  let satT = 0
  const clock = new THREE.Clock()
  function animate() {
    const dt = clock.getDelta()
    const t = clock.getElapsedTime()
    scrollProgress += (targetScrollProgress - scrollProgress) * 0.08
    mouseX += (targetMouseX - mouseX) * 0.04
    mouseY += (targetMouseY - mouseY) * 0.04
    dragRotX += (dragRotXTarget - dragRotX) * 0.1
    dragRotY += (dragRotYTarget - dragRotY) * 0.1
    globeGroup.rotation.y += 0.0015 + dragRotY * 0.02
    globeGroup.rotation.x = Math.max(-0.5, Math.min(0.5, globeGroup.rotation.x + dragRotX * 0.02))
    scene.rotation.y = mouseX * 0.05
    scene.rotation.x = mouseY * 0.03
    satT += dt * 0.18
    const sx = 1.95 * Math.cos(satT), sz = 1.85 * Math.sin(satT)
    const syT = -sz * Math.sin(orbitTilt), szT = sz * Math.cos(orbitTilt)
    satGroup.position.set(sx, syT, szT)
    satGroup.lookAt(1.95 * Math.cos(satT + 0.01), 0, 1.85 * Math.sin(satT + 0.01))
    satGroup.rotateY(Math.PI / 2)
    const camWorld = camPos.clone().applyMatrix4(globeGroup.matrixWorld)
    const satWorld = satGroup.position.clone()
    const dist = satWorld.distanceTo(camWorld)
    downlink.material.opacity = Math.max(0, Math.min(0.6, 1.5 - dist * 0.4))
    const dlPos = downlink.geometry.attributes.position
    dlPos.setXYZ(0, satWorld.x, satWorld.y, satWorld.z)
    dlPos.setXYZ(1, camWorld.x, camWorld.y, camWorld.z)
    dlPos.needsUpdate = true
    pulseRings.forEach((ring) => {
      const phase = (t * 0.5 + ring.userData.phase) % 1
      const scale = 1 + phase * 5
      ring.scale.set(scale, scale, scale)
      ring.material.opacity = (1 - phase) * 0.6
    })
    const mp = 0.7 + Math.sin(t * 3) * 0.3
    marker.material.opacity = mp
    marker.scale.setScalar(0.9 + Math.sin(t * 3) * 0.15)
    const p = scrollProgress
    camera.position.z = 4.2 + (1.9 - 4.2) * p
    camera.position.y = 0.4 + (0.1 - 0.4) * p
    camera.position.x = mouseX * 0.2 * (1 - p)
    camera.lookAt(0, 0.05 - p * 0.1, 0)
    renderer.render(scene, camera)
    animId = requestAnimationFrame(animate)
  }
  animId = requestAnimationFrame(animate)

  function onResize() {
    W = container.clientWidth
    H = container.clientHeight
    camera.aspect = W / H
    camera.updateProjectionMatrix()
    renderer.setSize(W, H)
  }
  window.addEventListener('resize', onResize)

  cleanups.push(() => {
    cancelAnimationFrame(animId)
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
    window.removeEventListener('scroll', updateScroll)
    window.removeEventListener('resize', onResize)
    container.removeEventListener('mousedown', () => {})
    container.removeEventListener('touchstart', onTouchStart)
    container.removeEventListener('touchmove', onTouchMove)
    container.removeEventListener('touchend', onTouchEnd)
    if (renderer) {
      renderer.dispose()
      if (renderer.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement)
      }
    }
    rendererRef = null
  })
}

onMounted(async () => {
  const router = (await import('../router/index.js')).default
  const { data } = await (await import('../services/supabase')).sb.auth.getSession()
  if (data.session && data.session.user) {
    router.replace('/map')
    return
  }

  // ---- three.js globe ----
  if (heroGlobe.value) {
    initGlobe(heroGlobe.value)
  }

  // ---- ndvi canvas ----
  drawNDVI()

  // ---- scroll reveal ----
  const revealEls = document.querySelectorAll('.ceres-landing .reveal')
  if ('IntersectionObserver' in window && revealEls.length) {
    revealIO = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) { entry.target.classList.add('in'); revealIO.unobserve(entry.target) }
        })
      },
      { threshold: 0.15, rootMargin: '0px 0px -50px 0px' },
    )
    revealEls.forEach((el) => revealIO.observe(el))
  } else {
    revealEls.forEach((el) => el.classList.add('in'))
  }

  // ---- feature card glow ----
  document.querySelectorAll('.ceres-landing .feature-card').forEach((card) => {
    const onMove = (e) => {
      const rect = card.getBoundingClientRect()
      const x = ((e.clientX - rect.left) / rect.width) * 100
      const y = ((e.clientY - rect.top) / rect.height) * 100
      card.style.setProperty('--mx', x + '%')
      card.style.setProperty('--my', y + '%')
    }
    card.addEventListener('mousemove', onMove)
    cleanups.push(() => card.removeEventListener('mousemove', onMove))
  })
})

onBeforeUnmount(() => {
  rafIds.forEach((id) => cancelAnimationFrame(id))
  cleanups.forEach((fn) => { try { fn() } catch (e) {} })
  cleanups = []
  if (revealIO) revealIO.disconnect()
  if (globeIO) globeIO.disconnect()
})
</script>

<style scoped>
/* ============ tokens ============ */
.ceres-landing {
  --bg: #050810;
  --bg-2: #080d1a;
  --surface: #0c1322;
  --surface-2: #131c30;
  --border: rgba(120, 145, 175, 0.14);
  --border-strong: rgba(120, 145, 175, 0.32);
  --fg: #ebe7d4;
  --fg-dim: #b8b9ad;
  --muted: #6a7488;
  --green: #8fba4a;
  --green-bright: #b8e062;
  --blue: #4ad6e4;
  --blue-deep: #2a8aab;
  --amber: #f0a040;
  --red: #e85a4a;

  position: fixed;
  inset: 0;
  z-index: 3000;
  overflow-y: auto;
  overflow-x: hidden;
  background: var(--bg);
  color: var(--fg);
  font-family: "Space Grotesk", sans-serif;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  transition: opacity 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.ceres-landing.leaving {
  opacity: 0;
  pointer-events: none;
}
.ceres-landing ::selection {
  background: var(--green);
  color: var(--bg);
}
.font-serif { font-family: "Instrument Serif", serif; font-weight: 400; }
.font-mono { font-family: "JetBrains Mono", monospace; }
.font-khmer { font-family: "Noto Sans Khmer", sans-serif; }
.font-light { font-weight: 300; }
.font-medium { font-weight: 500; }
.italic { font-style: italic; }
.ta-r { text-align: right; }
.mb { margin-bottom: 1.5rem; }
.italic { font-style: italic; }

/* ============ grain ============ */
.bg-grain::after {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 100;
  opacity: 0.035;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 300 300' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  mix-blend-mode: overlay;
}

/* ============ buttons ============ */
.cl-btn {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  background: var(--green);
  color: #0a0e08;
  padding: 14px 22px;
  border-radius: 4px;
  font-weight: 500;
  font-size: 14px;
  letter-spacing: 0.01em;
  border: 1px solid var(--green);
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
  text-decoration: none;
  font-family: "Space Grotesk", sans-serif;
}
.cl-btn:hover { background: var(--green-bright); border-color: var(--green-bright); transform: translateY(-1px); box-shadow: 0 8px 24px -8px rgba(143, 186, 74, 0.5); }
.cl-btn.ghost { background: transparent; color: var(--fg); border-color: var(--border-strong); }
.cl-btn.ghost:hover { border-color: var(--blue); color: var(--blue); box-shadow: none; }
.cl-btn.ghost.amber-b { border-color: rgba(240, 160, 64, 0.4); color: var(--amber); }
.cl-btn.ghost.amber-b:hover { background: var(--amber); color: var(--bg); border-color: transparent; }
.cl-btn.lg { padding: 15px 24px; font-size: 15px; }
.cl-btn.full { width: 100%; justify-content: center; }
.cl-btn i { font-size: 14px; }

/* ============ eyebrow ============ */
.cl-eyebrow {
  font-family: "JetBrains Mono", monospace;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  color: var(--muted);
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 18px;
}
.cl-eyebrow.center { justify-content: center; }
.cl-eyebrow-line { width: 32px; height: 1px; background: var(--border-strong); }
.cl-eyebrow-line.short { width: 24px; }

/* ============ nav ============ */
.cl-nav {
  position: fixed;
  top: 0; left: 0; right: 0;
  z-index: 50;
  background: rgba(5, 8, 16, 0.72);
  border-bottom: 1px solid var(--border);
  backdrop-filter: blur(8px);
}
.cl-nav-inner {
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 24px 0 40px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.cl-brand { display: flex; align-items: center; gap: 12px; cursor: pointer; text-decoration: none; color: var(--fg); }
.cl-brand-mark { width: 28px; height: 28px; }
.cl-brand-mark svg { width: 100%; height: 100%; display: block; }
.cl-brand-text { line-height: 1.15; }
.cl-brand-name { font-family: "Instrument Serif", serif; font-size: 20px; }
.cl-brand-sub { font-family: "JetBrains Mono", monospace; font-size: 9px; letter-spacing: 0.2em; color: var(--muted); }
.cl-nav-links { display: flex; align-items: center; gap: 32px; font-size: 14px; }
.cl-nav-links a { color: var(--fg-dim); text-decoration: none; transition: color 0.2s; }
.cl-nav-links a:hover { color: var(--fg); }
.cl-nav-right { display: flex; align-items: center; gap: 12px; }
.cl-lang-seg { display: flex; border: 1px solid var(--border); border-radius: 999px; padding: 3px; gap: 2px; font-family: "JetBrains Mono", monospace; font-size: 11px; }
.cl-lang-seg button { background: none; border: none; color: var(--fg); opacity: 0.55; padding: 5px 10px; border-radius: 999px; cursor: pointer; font-family: inherit; font-size: inherit; transition: all 0.2s; }
.cl-lang-seg button.on { background: var(--green); color: var(--bg); opacity: 1; font-weight: 600; }
@media (max-width: 900px) { .cl-nav-links { display: none; } }

/* ============ hero ============ */
.cl-hero { position: relative; min-height: 100vh; overflow: hidden; }
#hero-globe { position: absolute; inset: 0; z-index: 1; }
#hero-globe canvas { display: block; cursor: grab; }
#hero-globe canvas:active { cursor: grabbing; }
.cl-hero-vignette {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  background: radial-gradient(ellipse 80% 60% at 65% 50%, transparent 0%, rgba(5,8,16,0.4) 60%, rgba(5,8,16,0.85) 100%);
}
.cl-hud {
  position: absolute;
  top: 88px;
  z-index: 10;
  font-family: "JetBrains Mono", monospace;
  font-size: 10px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.2em;
  line-height: 1.8;
  pointer-events: none;
}
.cl-hud-left { left: 40px; }
.cl-hud-right { right: 40px; text-align: right; }
.cl-hud-live { display: flex; align-items: center; gap: 8px; color: var(--green); }
@media (max-width: 760px) { .cl-hud { display: none; } }
.cl-dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; }
.cl-dot.green { background: var(--green); }
.cl-dot.blue { background: var(--blue); }
.cl-dot.bright { background: var(--green-bright); }
.cl-dot.amber { background: var(--amber); }
.cl-dot.red { width: 6px; height: 6px; border-radius: 50%; display: inline-block; background: var(--red); }
.pulse-dot { animation: cl-pulse 2.2s ease-in-out infinite; }
@keyframes cl-pulse { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(0.85); } }

.cl-hero-content {
  position: relative;
  z-index: 10;
  max-width: 1400px;
  margin: 0 auto;
  padding: 150px 40px 120px;
}
.cl-eyebrow.mb { margin-bottom: 22px; }
.cl-h1 {
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 0.98;
  font-size: clamp(40px, 7vw, 88px);
  margin-bottom: 28px;
  max-width: 800px;
}
.text-gradient-green {
  background: linear-gradient(180deg, var(--green-bright) 0%, var(--green) 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.cl-hero-sub { max-width: 680px; font-size: clamp(16px, 1.6vw, 19px); color: var(--fg-dim); line-height: 1.6; margin-bottom: 12px; }
.cl-hero-khmer { max-width: 680px; font-family: "Noto Sans Khmer", sans-serif; font-size: 15px; color: var(--muted); margin-bottom: 36px; }
.cl-cta-row { display: flex; flex-wrap: wrap; gap: 14px; }

.cl-marquee {
  position: absolute;
  bottom: 46px; left: 0; right: 0;
  z-index: 10;
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  background: rgba(5, 8, 16, 0.6);
  backdrop-filter: blur(8px);
  overflow: hidden;
}
.cl-marquee-track {
  display: inline-flex;
  gap: 64px;
  white-space: nowrap;
  font-family: "JetBrains Mono", monospace;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.15em;
  color: var(--muted);
  padding: 12px 0;
  animation: cl-marquee 40s linear infinite;
}
.cl-marquee-item { display: flex; align-items: center; gap: 12px; }
.cl-marquee-item .cl-dot { flex: none; }
@keyframes cl-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }

.cl-scroll-hint {
  position: absolute;
  bottom: 100px; left: 50%;
  transform: translateX(-50%);
  z-index: 10;
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  color: var(--muted); font-family: "JetBrains Mono", monospace; font-size: 10px; letter-spacing: 0.15em; text-transform: uppercase;
  animation: cl-scrollhint 2s ease-in-out infinite;
}
@keyframes cl-scrollhint { 0%,100% { transform: translateX(-50%) translateY(0); opacity: 0.5; } 50% { transform: translateX(-50%) translateY(6px); opacity: 1; } }

/* ============ sections ============ */
.cl-container { max-width: 1400px; margin: 0 auto; padding: 0 40px; }
.cl-section { padding: 110px 0; border-top: 1px solid var(--border); position: relative; }
.cl-problem { background: linear-gradient(180deg, var(--bg) 0%, var(--bg-2) 100%); }
.cl-how { overflow: hidden; }
.cl-features { background: var(--bg-2); }
.cl-grid-bg {
  position: absolute; inset: 0; opacity: 0.4; pointer-events: none;
  background-image: linear-gradient(rgba(120,145,175,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(120,145,175,0.04) 1px, transparent 1px);
  background-size: 60px 60px;
}
.cl-heading-grid { display: grid; grid-template-columns: 5fr 6fr; gap: 48px; margin-bottom: 80px; position: relative; }
.cl-heading-col { grid-column: 1; }
.cl-lead-col { grid-column: 2; padding-top: 8px; }
.cl-h2 { font-weight: 600; letter-spacing: -0.015em; line-height: 1.05; font-size: clamp(30px, 4.5vw, 56px); }
.cl-cl-amber, .cl-amber { color: var(--amber); }
.cl-bright, .cl-green-bright { color: var(--green-bright); }
.cl-lead { font-size: 18px; color: var(--fg-dim); line-height: 1.7; margin-bottom: 24px; }
.cl-lead-dim { font-size: 16px; color: var(--muted); line-height: 1.7; }

.cl-card { background: var(--surface); border: 1px solid var(--border); border-radius: 6px; transition: border-color 0.3s ease; }
.cl-card:hover { border-color: var(--border-strong); }
.cl-hud-card { position: relative; }
.p-6 { padding: 24px; }
.p-lg { padding: 24px; }
.lg-p8 { padding: 32px; }
@media (min-width: 900px) { .lg-p8 { padding: 40px; } }

.hud-tl, .hud-tr, .hud-bl, .hud-br { position: absolute; width: 14px; height: 14px; border-color: var(--border-strong); border-style: solid; pointer-events: none; }
.hud-tl { top: -1px; left: -1px; border-width: 1px 0 0 1px; }
.hud-tr { top: -1px; right: -1px; border-width: 1px 1px 0 0; }
.hud-bl { bottom: -1px; left: -1px; border-width: 0 0 1px 1px; }
.hud-br { bottom: -1px; right: -1px; border-width: 0 1px 1px 0; }

.cl-two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
.cl-label { font-family: "JetBrains Mono", monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 0.15em; margin-bottom: 8px; }
.cl-label.blue { color: var(--blue); }
.cl-label.green { color: var(--green); }
.cl-label.muted { color: var(--muted); }
.cl-bignum { font-family: "Instrument Serif", serif; font-size: clamp(40px, 5vw, 60px); line-height: 1; }
.cl-bignum.red { color: var(--red); }
.cl-bignum.bright { color: var(--green-bright); }
.cl-small-muted { font-size: 13px; color: var(--muted); margin-top: 4px; }

.cl-timeline { position: relative; height: 56px; border: 1px solid var(--border-strong); border-radius: 4px; overflow: hidden; margin-top: 40px; }
.cl-timeline-bar { position: absolute; inset: 0; background: linear-gradient(90deg, var(--green) 0%, var(--green) 17%, var(--amber) 30%, var(--red) 100%); }
.cl-tl-marker { position: absolute; top: 0; bottom: 0; display: flex; align-items: center; }
.cl-tl-line { width: 1px; height: 100%; background: var(--bg); opacity: 0.6; }
.cl-tl-line.dim { opacity: 0.8; }
.cl-tl-tag { position: absolute; top: -4px; transform: translateX(-50%); font-family: "JetBrains Mono", monospace; font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; white-space: nowrap; }
.cl-tl-tag.dark { color: var(--bg); }
.cl-tl-caption { position: absolute; bottom: -24px; font-family: "JetBrains Mono", monospace; font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; }
.cl-tl-caption.blue { color: var(--blue); }
.cl-tl-caption.red { color: var(--red); }

.cl-tier-stats { margin-top: 48px; padding-top: 24px; border-top: 1px solid var(--border); display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
.cl-stat-num { font-family: "Instrument Serif", serif; font-size: 32px; margin-bottom: 4px; }
.cl-stat-lbl { font-size: 12px; color: var(--muted); line-height: 1.6; }

.cl-quote { margin-top: 120px; max-width: 840px; }
.cl-quote-mark { color: var(--green); font-family: "Instrument Serif", serif; font-size: 64px; line-height: 1; margin-bottom: 16px; }
.cl-quote-text { font-family: "Instrument Serif", serif; font-size: clamp(22px, 2.6vw, 30px); line-height: 1.4; color: var(--fg); font-style: italic; margin-bottom: 24px; }
.cl-not-italic { font-style: normal; }
.cl-quote-attrib { display: flex; align-items: center; gap: 12px; font-size: 14px; color: var(--muted); }
.cl-hr { width: 32px; height: 1px; background: var(--border-strong); }

/* steps */
.cl-steps { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; background: var(--border); border: 1px solid var(--border); border-radius: 6px; overflow: hidden; position: relative; }
@media (max-width: 1000px) { .cl-steps { grid-template-columns: 1fr 1fr; } }
@media (max-width: 640px) { .cl-steps { grid-template-columns: 1fr; } }
.cl-step { background: var(--bg); padding: 28px; position: relative; }
.cl-step-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 28px; }
.cl-step-kicker { font-family: "JetBrains Mono", monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 0.15em; }
.cl-step-kicker.blue { color: var(--blue); }
.cl-step-kicker.green { color: var(--green); }
.cl-step-kicker.amber { color: var(--amber); }
.cl-step-meta { font-family: "JetBrains Mono", monospace; font-size: 10px; color: var(--muted); }
.cl-step-icon { height: 80px; display: flex; align-items: center; margin-bottom: 20px; }
.cl-step-icon svg { height: 64px; }
.cl-step-title { font-family: "Instrument Serif", serif; font-size: 24px; margin-bottom: 12px; }
.cl-step-body { font-size: 14px; color: var(--fg-dim); line-height: 1.6; margin-bottom: 16px; }
.cl-step-spec { font-family: "JetBrains Mono", monospace; font-size: 10px; color: var(--muted); line-height: 1.9; padding-top: 16px; border-top: 1px solid var(--border); }

.cl-pipeline-status { margin-top: 24px; padding: 20px; display: flex; flex-wrap: wrap; align-items: center; gap: 24px; font-family: "JetBrains Mono", monospace; font-size: 11px; text-transform: uppercase; letter-spacing: 0.15em; }
.cl-ps-live { display: flex; align-items: center; gap: 8px; color: var(--fg-dim); }
.cl-ps-item { color: var(--muted); }
.cl-ps-item b { color: var(--fg); font-weight: 500; }
.cl-ps-item.amber b { color: var(--amber); }
.cl-ps-item.green b { color: var(--green); }
.cl-ps-item.hide-lg { margin-left: auto; }
.cl-ps-item.amber { color: var(--muted); }
@media (max-width: 900px) { .cl-ps-item.hide-lg { display: none; } }

/* dashboard */
.cl-dash-wrap { margin-bottom: 24px; }
.cl-dashboard { overflow: hidden; }
.cl-dash-top { display: flex; justify-content: space-between; align-items: center; padding: 14px 20px; border-bottom: 1px solid var(--border); font-family: "JetBrains Mono", monospace; font-size: 11px; text-transform: uppercase; letter-spacing: 0.15em; color: var(--muted); flex-wrap: wrap; gap: 8px; }
.cl-dash-top-left, .cl-dash-top-right { display: flex; align-items: center; gap: 20px; }
.cl-dash-field-label { display: flex; align-items: center; gap: 8px; color: var(--green); }
.cl-dash-top-right .cl-bright { color: var(--green-bright); }
@media (max-width: 700px) { .hide-md, .hide-lg { display: none; } }

.cl-dash-grid { display: grid; grid-template-columns: 7fr 5fr; gap: 0; background: var(--border); }
@media (max-width: 900px) { .cl-dash-grid { grid-template-columns: 1fr; } }
.cl-dash-main { background: var(--surface); }
.cl-dash-side { background: var(--surface); }
.cl-dash-main-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
.cl-dash-title { font-family: "Instrument Serif", serif; font-size: 24px; margin-top: 4px; }
.cl-band-row { display: flex; gap: 4px; font-family: "JetBrains Mono", monospace; font-size: 10px; }
.cl-band { padding: 6px 10px; background: transparent; color: var(--muted); border: 1px solid var(--border); border-radius: 3px; cursor: pointer; font-family: inherit; font-size: inherit; transition: all 0.2s; }
.cl-band.on { background: var(--green); color: var(--bg); border-color: transparent; }

.cl-canvas-wrap { position: relative; border: 1px solid var(--border); border-radius: 4px; overflow: hidden; }
.ndvi-canvas { width: 100%; height: auto; display: block; border-radius: 4px; }
.cl-canvas-tl, .cl-canvas-tr { position: absolute; top: 8px; font-family: "JetBrains Mono", monospace; font-size: 9px; text-transform: uppercase; letter-spacing: 0.15em; color: var(--fg); background: rgba(5,8,16,0.8); padding: 3px 8px; border-radius: 3px; }
.cl-canvas-tl { left: 8px; }
.cl-canvas-tr { right: 8px; }
.cl-canvas-br { position: absolute; bottom: 8px; right: 8px; font-family: "JetBrains Mono", monospace; font-size: 9px; background: rgba(5,8,16,0.8); padding: 3px 8px; border-radius: 3px; color: var(--fg); }
.cl-canvas-br span { margin-left: 6px; font-size: 9px; }
.cl-c-red { color: var(--red); }
.cl-c-amber { color: var(--amber); }
.cl-c-green { color: var(--green); }
.cl-c-bright { color: var(--green-bright); }
.cl-crosshair { position: absolute; width: 128px; }
.cl-crosshair-box { position: relative; width: 128px; height: 128px; transform: translate(-50%, -50%); border: 1px solid rgba(235,231,212,0.6); }
.cl-crosshair-tag { position: absolute; top: -14px; left: 50%; transform: translateX(-50%); font-family: "JetBrains Mono", monospace; font-size: 9px; color: var(--fg); white-space: nowrap; }

.cl-timeline-slider { margin-top: 20px; }
.cl-ts-head { display: flex; justify-content: space-between; align-items: center; font-family: "JetBrains Mono", monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 0.15em; color: var(--muted); margin-bottom: 8px; }
.cl-ts-track { position: relative; height: 32px; border-radius: 3px; border: 1px solid var(--border); background: var(--bg); overflow: hidden; }
.cl-ts-progress { position: absolute; inset-y: 0; left: 0; width: 78%; background: rgba(143,186,74,0.1); border-right: 1px solid var(--green); }
.cl-ts-now { position: absolute; inset-y: 0; left: 78%; }
.cl-ts-nowline { width: 1px; height: 100%; background: var(--green); }
.cl-ts-nowtag { position: absolute; top: -26px; left: 50%; transform: translateX(-50%); white-space: nowrap; font-family: "JetBrains Mono", monospace; font-size: 9px; color: var(--green); }
.cl-ts-ticks { position: absolute; inset: 0; display: flex; justify-content: space-between; align-items: flex-end; padding: 0 4px 4px; font-family: "JetBrains Mono", monospace; font-size: 8px; color: var(--muted); }

.cl-dash-health { display: flex; align-items: baseline; gap: 12px; margin-bottom: 4px; }
.cl-health-num { font-family: "Instrument Serif", serif; font-size: 48px; }
.cl-health-num.amber { color: var(--amber); }
.cl-health-desc { font-size: 14px; color: var(--amber); }
.cl-health-sub { font-size: 12px; color: var(--muted); font-family: "JetBrains Mono", monospace; }
.cl-side-block { padding-top: 20px; border-top: 1px solid var(--border); margin-top: 20px; }
.cl-stage-name { display: flex; align-items: center; gap: 12px; font-family: "Instrument Serif", serif; font-size: 22px; margin-bottom: 12px; }
.cl-stage-count { font-family: "JetBrains Mono", monospace; font-size: 12px; color: var(--muted); }
.cl-stage-bar { display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px; }
.cl-stage-bar i { height: 6px; background: var(--border); border-radius: 2px; }
.cl-stage-bar i.on { background: var(--green); }
.cl-stage-bar i.on.bright { background: var(--green-bright); }
.cl-stage-ticks { display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px; margin-top: 4px; font-family: "JetBrains Mono", monospace; font-size: 8px; color: var(--muted); text-align: center; }
.cl-zone { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
.cl-zone-label { width: 64px; font-family: "JetBrains Mono", monospace; font-size: 10px; color: var(--muted); }
.cl-zone-bar { flex: 1; height: 8px; background: var(--bg); border-radius: 3px; overflow: hidden; }
.cl-zone-bar div { height: 100%; }
.cl-zone-bar .red { background: var(--red); }
.cl-zone-bar .amber { background: var(--amber); }
.cl-zone-bar .green { background: var(--green); }
.cl-zone-bar .bright { background: var(--green-bright); }
.cl-zone-val { width: 48px; text-align: right; font-family: "JetBrains Mono", monospace; font-size: 10px; }
.cl-zone-val.red { color: var(--red); }
.cl-zone-val.amber { color: var(--amber); }
.cl-zone-val.green { color: var(--green); }
.cl-zone-val.bright { color: var(--green-bright); }
.cl-side-block-inline { display: flex; gap: 8px; margin-top: 20px; }
.cl-export { flex: 1; padding: 8px; font-size: 12px; font-family: "JetBrains Mono", monospace; text-transform: uppercase; letter-spacing: 0.1em; background: transparent; color: var(--fg-dim); border: 1px solid var(--border-strong); border-radius: 3px; cursor: pointer; transition: all 0.2s; }
.cl-export:hover { border-color: var(--green); color: var(--green); }

.cl-feature-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-top: 20px; }
@media (max-width: 1000px) { .cl-feature-row { grid-template-columns: 1fr; } }
.cl-feature-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.cl-feature-kicker { font-family: "JetBrains Mono", monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 0.15em; }
.cl-feature-kicker.green { color: var(--green); }
.cl-feature-kicker.blue { color: var(--blue); }
.cl-feature-kicker.amber { color: var(--amber); }
.cl-feature-title { font-family: "Instrument Serif", serif; font-size: 24px; margin-bottom: 12px; }
.cl-feature-body { font-size: 14px; color: var(--fg-dim); line-height: 1.6; margin-bottom: 20px; }
.feature-card { position: relative; overflow: hidden; transition: transform 0.4s cubic-bezier(0.2,0.8,0.2,1), border-color 0.3s ease; }
.feature-card:hover { transform: translateY(-3px); }
.feature-card::before { content: ""; position: absolute; inset: 0; background: radial-gradient(circle at var(--mx,50%) var(--my,50%), rgba(143,186,74,0.06), transparent 40%); pointer-events: none; opacity: 0; transition: opacity 0.4s ease; }
.feature-card:hover::before { opacity: 1; }

.cl-chat { background: var(--bg); border: 1px solid var(--border); border-radius: 4px; padding: 12px; display: flex; flex-direction: column; gap: 10px; }
.cl-chat-in, .cl-chat-out { display: flex; gap: 8px; }
.cl-chat-out { justify-content: flex-end; }
.cl-avatar { width: 24px; height: 24px; border-radius: 50%; background: var(--surface-2); display: flex; align-items: center; justify-content: center; font-family: "JetBrains Mono", monospace; font-size: 10px; color: var(--blue); flex-shrink: 0; }
.cl-avatar.ci { background: rgba(143,186,74,0.2); color: var(--green); }
.cl-bubble { font-size: 11px; color: var(--fg-dim); background: var(--surface-2); border-radius: 6px; padding: 6px 10px; line-height: 1.5; }
.cl-bubble.ai { background: rgba(143,186,74,0.15); border: 1px solid rgba(143,186,74,0.3); color: var(--green-bright); max-width: 80%; }

.cl-tg-mock { background: var(--bg); border: 1px solid var(--border); border-radius: 4px; padding: 12px; }
.cl-tg-head { display: flex; align-items: center; gap: 8px; padding-bottom: 8px; margin-bottom: 8px; border-bottom: 1px solid var(--border); }
.cl-tg-avatar { width: 28px; height: 28px; border-radius: 50%; background: rgba(74,214,228,0.2); display: flex; align-items: center; justify-content: center; }
.cl-tg-avatar svg { width: 16px; height: 16px; }
.cl-tg-name { font-size: 11px; font-weight: 600; }
.cl-tg-status { font-size: 9px; color: var(--muted); font-family: "JetBrains Mono", monospace; }
.cl-tg-alert { background: var(--surface-2); border-radius: 6px; padding: 10px; }
.cl-tg-alert-head { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; font-family: "JetBrains Mono", monospace; font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--red); }
.cl-tg-alert-text { font-size: 11px; line-height: 1.6; color: var(--fg); font-family: "Noto Sans Khmer", sans-serif; }
.cl-tg-reply { font-size: 9px; color: var(--muted); font-family: "JetBrains Mono", monospace; margin-top: 6px; }

.cl-coop { background: var(--bg); border: 1px solid var(--border); border-radius: 4px; padding: 12px; }
.cl-coop-head { display: grid; grid-template-columns: 4fr 3fr 2fr 3fr; gap: 8px; font-family: "JetBrains Mono", monospace; font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--muted); padding-bottom: 8px; margin-bottom: 8px; border-bottom: 1px solid var(--border); }
.cl-coop-head .ta-r { text-align: right; }
.cl-coop-row { display: grid; grid-template-columns: 4fr 3fr 2fr 3fr; gap: 8px; align-items: center; font-size: 11px; padding: 4px 0; }
.cl-coop-farmer { color: var(--fg); font-family: "Noto Sans Khmer", sans-serif; }
.cl-coop-field, .cl-coop-stage { font-family: "JetBrains Mono", monospace; color: var(--muted); }
.cl-coop-val { font-family: "JetBrains Mono", monospace; }
.cl-coop-val b { font-weight: 500; }
.cl-coop-val.read { color: var(--red); }
.cl-coop-val.amber { color: var(--amber); }
.cl-coop-val.green { color: var(--green); }
.cl-coop-val.bright { color: var(--green-bright); }
.cl-coop-val span { margin-left: 4px; }
.cl-coop-foot { padding-top: 8px; margin-top: 8px; border-top: 1px solid var(--border); font-family: "JetBrains Mono", monospace; font-size: 10px; color: var(--muted); text-align: right; }
.cl-coop-foot .cl-amber { color: var(--amber); }

/* who it's for */
.cl-tiers { border-top: 1px solid var(--border); }
.cl-tier-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
@media (max-width: 900px) { .cl-tier-grid { grid-template-columns: 1fr; } }
.cl-tier { padding: 32px 40px; position: relative; }
@media (min-width: 900px) { .cl-tier { padding: 40px; } }
.cl-tier.featured {
  background: linear-gradient(180deg, rgba(143,186,74,0.04) 0%, var(--surface) 60%);
  border-color: rgba(143,186,74,0.3);
}
.cl-tier-head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; gap: 12px; }
.cl-tier-eyebrow { font-family: "JetBrains Mono", monospace; font-size: 11px; text-transform: uppercase; letter-spacing: 0.15em; margin-bottom: 8px; }
.cl-tier-eyebrow.green { color: var(--green); }
.cl-tier-eyebrow.amber { color: var(--amber); }
.cl-tier-title { font-family: "Instrument Serif", serif; font-size: clamp(32px, 4vw, 44px); margin-bottom: 4px; }
.cl-tier-sub { font-size: 14px; color: var(--muted); }
.cl-tier-price { font-family: "Instrument Serif", serif; font-size: 36px; }
.cl-tier-price.bright { color: var(--green-bright); }
.cl-tier-price.fg { color: var(--fg); }
.cl-tier-price-sub { font-family: "JetBrains Mono", monospace; font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.15em; }
.cl-tier-desc { font-size: 14px; color: var(--fg-dim); line-height: 1.7; margin-bottom: 26px; }
.cl-tier-list { list-style: none; padding: 0; margin: 0 0 28px; display: flex; flex-direction: column; gap: 12px; }
.cl-tier-list li { display: flex; align-items: flex-start; gap: 10px; font-size: 14px; color: var(--fg-dim); }
.cl-tier-list li i { color: var(--green); margin-top: 1px; }
.cl-tier.featured .cl-tier-list li i { color: var(--amber); }

.cl-real-pricing { margin-top: 80px; }

/* waitlist */
.cl-waitlist { position: relative; padding: 110px 40px 60px; border-top: 1px solid var(--border); overflow: hidden; text-align: center; background: radial-gradient(ellipse 80% 60% at 50% 100%, rgba(143,186,74,0.06), transparent 70%), var(--bg); }
.cl-waitlist-orbit { position: absolute; inset: 0; pointer-events: none; opacity: 0.3; }
.cl-orbit-ring { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); border: 1px solid var(--border); border-radius: 50%; }
.cl-orbit-ring.ring1 { width: 120%; aspect-ratio: 1; }
.cl-orbit-ring.ring2 { width: 90%; aspect-ratio: 1; transform: translate(-50%, -50%) rotate(-15deg) scaleY(0.4); }
.cl-orbit-ring.ring3 { width: 60%; aspect-ratio: 1; transform: translate(-50%, -50%) rotate(20deg) scaleY(0.3); }
.cl-h2.center { text-align: center; margin-left: auto; margin-right: auto; }
.cl-waitlist-sub { max-width: 720px; margin: 0 auto 36px; font-size: 18px; color: var(--fg-dim); line-height: 1.7; }
.cl-waitlist-foot { margin-top: 48px; display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 32px; font-size: 13px; color: var(--muted); }
.cl-wl-item { display: flex; align-items: center; gap: 8px; }

/* footer */
.cl-footer { border-top: 1px solid var(--border); padding: 48px 40px; background: var(--bg); }
.cl-footer-grid { max-width: 1400px; margin: 0 auto; display: grid; grid-template-columns: 4fr 2fr 2fr 2fr 2fr; gap: 40px; padding-bottom: 48px; }
@media (max-width: 900px) { .cl-footer-grid { grid-template-columns: 1fr 1fr; } }
.cl-footer-brand .cl-brand { margin-bottom: 16px; }
.cl-footer-brand-name { font-family: "Instrument Serif", serif; font-size: 24px; }
.cl-footer-desc { font-size: 14px; color: var(--fg-dim); max-width: 280px; line-height: 1.6; margin-bottom: 16px; }
.cl-footer-khmer { font-size: 12px; color: var(--muted); font-family: "Noto Sans Khmer", sans-serif; }
.cl-footer-col { display: flex; flex-direction: column; gap: 10px; }
.cl-footer-col .cl-eyebrow { margin-bottom: 12px; }
.cl-footer-col a { color: var(--fg-dim); text-decoration: none; font-size: 14px; }
.cl-footer-col a:hover { color: var(--fg); }
.cl-footer-col span { color: var(--muted); font-size: 14px; }
.cl-footer-bar { max-width: 1400px; margin: 0 auto; padding-top: 32px; border-top: 1px solid var(--border); display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 16px; font-family: "JetBrains Mono", monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 0.15em; color: var(--muted); }
.cl-footer-bar > div { display: flex; align-items: center; gap: 20px; flex-wrap: wrap; }
.cl-sys { display: flex; align-items: center; gap: 8px; }

/* reveal */
.reveal { opacity: 0; transform: translateY(24px); transition: opacity 0.9s cubic-bezier(0.2,0.8,0.2,1), transform 0.9s cubic-bezier(0.2,0.8,0.2,1); }
.reveal.in { opacity: 1; transform: translateY(0); }
.reveal.delay-1 { transition-delay: 0.08s; }
.reveal.delay-2 { transition-delay: 0.16s; }
.reveal.delay-3 { transition-delay: 0.24s; }
.reveal.delay-4 { transition-delay: 0.32s; }

@media (prefers-reduced-motion: reduce) {
  .ceres-landing *, .ceres-landing *::before, .ceres-landing *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
}
@media (max-width: 760px) {
  .cl-container { padding: 0 24px; }
  .cl-nav-inner { padding: 0 20px 0 24px; }
  .cl-hero-content { padding: 130px 24px 130px; }
  .cl-heading-grid { grid-template-columns: 1fr; gap: 24px; }
  .cl-heading-col { grid-column: 1; }
  .cl-lead-col { grid-column: 1; padding-top: 0; }
  .cl-tier-stats { grid-template-columns: 1fr; }
  .cl-footer-grid { grid-template-columns: 1fr; }
}
</style>
