<template>
  <div v-if="active" class="tut-root">
    <!-- Dim backdrop -->
    <div class="tut-dim" @click="skip"></div>

    <!-- Spotlight highlight (only when a target element exists) -->
    <div
      v-if="targetRect && current.highlightTarget"
      class="tut-spotlight"
      :style="spotStyle"
    ></div>

    <!-- Tooltip card -->
    <div
      class="tut-card"
      :style="cardStyle"
      role="dialog"
      aria-modal="false"
    >
      <div class="tut-progress">
        <div class="tut-dots">
          <span
            v-for="(s, i) in steps"
            :key="i"
            class="tut-dot"
            :class="{ on: i <= stepIndex }"
          ></span>
        </div>
        <button class="tut-skip" @click="skip">{{ t('tut.skip') }}</button>
      </div>

      <div class="tut-title">
        <span class="tut-step">STEP {{ stepIndex + 1 }}/{{ steps.length }}</span>
        <h3>{{ t(current.titleKey) }}</h3>
      </div>
      <p class="tut-body">{{ t(current.bodyKey) }}</p>

      <div class="tut-actions">
        <button class="tut-btn" :disabled="stepIndex === 0" @click="prev">
          {{ t('tut.back') }}
        </button>
        <button
          v-if="stepIndex < steps.length - 1"
          class="tut-btn primary"
          @click="next"
        >
          {{ t('tut.next') }}
        </button>
        <button v-else class="tut-btn primary" @click="finish">
          {{ t('tut.done') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { state } from '../store'
import { useI18n } from '../i18n'

const { t } = useI18n()

const STORAGE_KEY = 'istutorial'

// Each step points at a UI element by CSS selector. If the element isn't found
// (e.g. a drawer that hasn't been opened, or a panel gated on data), the card
// falls back to being centered over the map. `open` lets a step open a drawer
// so its target becomes visible at the right moment.
const steps = [
  { titleKey: 'tut.st1_title', bodyKey: 'tut.st1_body', highlightTarget: false },
  {
    titleKey: 'tut.st2_title',
    bodyKey: 'tut.st2_body',
    selector: '.topbar .drawer-toggle, .topbar-desktop-controls .icon',
    open: 'left',
  },
  {
    titleKey: 'tut.st3_title',
    bodyKey: 'tut.st3_body',
    selector: '.aoi-btn',
  },
  {
    titleKey: 'tut.st4_title',
    bodyKey: 'tut.st4_body',
    selector: '.sidebar-footer .draw-btn',
    open: 'left',
  },
  {
    titleKey: 'tut.st5_title',
    bodyKey: 'tut.st5_body',
    selector: '#month-slider',
  },
  {
    titleKey: 'tut.st6_title',
    bodyKey: 'tut.st6_body',
    selector: '.band-panel .segmented',
  },
  {
    titleKey: 'tut.st7_title',
    bodyKey: 'tut.st7_body',
    highlightTarget: false,
  },
]

const props = defineProps({
  onOpenLeft: { type: Function, default: () => {} },
  onOpenRight: { type: Function, default: () => {} },
})

const active = ref(false)
const stepIndex = ref(0)
const targetRect = ref(null)
const winW = ref(0)
const winH = ref(0)

const current = computed(() => steps[stepIndex.value] || steps[0])
const hasStep = (idx) => !!steps[idx]

function shouldShow() {
  try {
    return !localStorage.getItem(STORAGE_KEY)
  } catch {
    return false
  }
}

function markDone() {
  try {
    localStorage.setItem(STORAGE_KEY, '1')
  } catch {}
}

function locate(target) {
  if (!target || !target.selector) return null
  const el = document.querySelector(target.selector)
  if (!el) return null
  const r = el.getBoundingClientRect()
  if (r.width === 0 && r.height === 0) return null
  return {
    top: r.top,
    left: r.left,
    width: r.width,
    height: r.height,
    right: r.right,
    bottom: r.bottom,
  }
}

function refresh() {
  winW.value = window.innerWidth
  winH.value = window.innerHeight
  targetRect.value = locate(current.value)
}

async function go(idx) {
  if (!hasStep(idx)) return
  stepIndex.value = idx
  const s = steps[idx]
  await nextTick()
  if (s && s.open === 'left') props.onOpenLeft()
  else if (s && s.open === 'right') props.onOpenRight()
  await nextTick()
  refresh()
}

function next() { if (hasStep(stepIndex.value + 1)) go(stepIndex.value + 1) }
function prev() { if (hasStep(stepIndex.value - 1)) go(stepIndex.value - 1) }
function finish() {
  markDone()
  active.value = false
}
function skip() {
  markDone()
  active.value = false
}

function onResize() { refresh() }
function onScroll() { refresh() }

let startTimer = null
let started = false

function begin() {
  if (started) return
  started = true
  active.value = true
  window.addEventListener('resize', onResize)
  window.addEventListener('scroll', onScroll, true)
  nextTick().then(refresh)
}

onMounted(() => {
  if (!shouldShow()) return
  // Wait briefly for the satellite dashboard (band panel / slider / AOI) to be
  // ready so spotlight targets actually exist; fall back to starting anyway so
  // the walkthrough is never blocked.
  if (state.eeReady) {
    begin()
  } else {
    const stop = watch(() => state.eeReady, (ready) => {
      if (ready) { stop(); begin() }
    })
    startTimer = setTimeout(() => { stop(); begin() }, 4000)
  }
})

onBeforeUnmount(() => {
  if (startTimer) clearTimeout(startTimer)
  window.removeEventListener('resize', onResize)
  window.removeEventListener('scroll', onScroll, true)
})

// Spotlight uses an inset box-shadow "hole" trick on a full-screen element so
// the highlighted target stays interactive-looking while everything else dims.
const spotStyle = computed(() => {
  if (!targetRect.value) return { display: 'none' }
  const r = targetRect.value
  const pad = 6
  const top = Math.max(0, r.top - pad)
  const left = Math.max(0, r.left - pad)
  const width = r.width + pad * 2
  const height = r.height + pad * 2
  return {
    top: top + 'px',
    left: left + 'px',
    width: width + 'px',
    height: height + 'px',
    boxShadow: `0 0 0 ${9999}px rgba(6,9,14,0.72)`,
  }
})

// Place the tooltip card to the side/below the target, clamped to the viewport.
const cardStyle = computed(() => {
  if (!targetRect.value) return {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
  }
  const r = targetRect.value
  const cardW = 300
  const margin = 16
  let left = r.left - 80
  left = Math.max(margin, Math.min(left, winW.value - cardW - margin))
  let top = r.bottom + margin
  if (top + 240 > winH.value) top = Math.max(margin, r.top - 240 - margin)
  return { position: 'fixed', left: left + 'px', top: top + 'px', width: cardW + 'px' }
})
</script>

<style scoped>
.tut-root {
  position: fixed;
  inset: 0;
  z-index: 3000;
}
.tut-dim {
  position: absolute;
  inset: 0;
  background: transparent;
  cursor: pointer;
}
.tut-spotlight {
  position: absolute;
  border-radius: var(--radius-md, 10px);
  border: 2px solid var(--accent, #2dd4a7);
  background: transparent;
  pointer-events: none;
  transition: top 0.25s var(--ease, ease), left 0.25s var(--ease, ease),
    width 0.25s var(--ease, ease), height 0.25s var(--ease, ease);
}
.tut-card {
  position: fixed;
  z-index: 3001;
  background: var(--panel-2, #141a22);
  border: 0.5px solid var(--panel-border-strong, #2a3340);
  border-radius: var(--radius-lg, 12px);
  color: var(--text, #e8edf4);
  padding: 14px 16px 12px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
}
.tut-progress {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.tut-dots {
  display: flex;
  gap: 5px;
}
.tut-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--panel-border-strong, #2a3340);
  transition: background 0.2s;
}
.tut-dot.on {
  background: var(--accent, #2dd4a7);
}
.tut-skip {
  background: none;
  border: none;
  color: var(--text-faint, #8b97a8);
  font-size: 0.78rem;
  cursor: pointer;
  padding: 2px 4px;
}
.tut-skip:hover {
  color: var(--text, #e8edf4);
}
.tut-step {
  display: inline-block;
  font-size: 0.68rem;
  letter-spacing: 0.12em;
  color: var(--accent, #2dd4a7);
  font-weight: 700;
  margin-bottom: 4px;
}
.tut-title h3 {
  margin: 0;
  font-size: 1.05rem;
  color: var(--text, #e8edf4);
}
.tut-body {
  font-size: 0.85rem;
  line-height: 1.5;
  color: var(--text-dim, #aab4c2);
  margin: 8px 0 14px;
}
.tut-actions {
  display: flex;
  gap: 8px;
}
.tut-btn {
  flex: 1;
  padding: 8px 10px;
  border-radius: var(--radius-md, 8px);
  border: 0.5px solid var(--panel-border-strong, #2a3340);
  background: rgba(255, 255, 255, 0.06);
  color: var(--text, #e8edf4);
  font-weight: 600;
  font-size: 0.82rem;
  cursor: pointer;
}
.tut-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
.tut-btn.primary {
  background: var(--accent, #2dd4a7);
  color: #0b0f14;
  border-color: transparent;
}
</style>
