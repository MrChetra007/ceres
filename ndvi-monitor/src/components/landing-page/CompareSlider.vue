<template>
  <div
    ref="rootEl"
    class="cmp-slider"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
  >
    <div class="cmp-layer cmp-before">
      <img :src="beforeSrc" :alt="beforeLabel" draggable="false" />
    </div>
    <div
      class="cmp-layer cmp-after"
      :style="{ clipPath: 'inset(0 0 0 ' + split + '%)' }"
    >
      <img :src="afterSrc" :alt="afterLabel" draggable="false" />
    </div>
    <div class="cmp-handle" :style="{ left: split + '%' }">
      <div class="cmp-grip"></div>
    </div>
    <span class="cmp-label cmp-label-left">{{ beforeLabel }}</span>
    <span class="cmp-label cmp-label-right">{{ afterLabel }}</span>
  </div>
</template>

<script setup>
import { ref } from "vue";

const props = defineProps({
  beforeSrc: { type: String, required: true },
  afterSrc: { type: String, required: true },
  beforeLabel: { type: String, default: "Field photo" },
  afterLabel: { type: String, default: "Index view" },
});

const rootEl = ref(null);
const split = ref(50);
let dragging = false;

function setSplitFromEvent(e) {
  const r = rootEl.value.getBoundingClientRect();
  const pct = ((e.clientX - r.left) / r.width) * 100;
  split.value = Math.min(95, Math.max(5, pct));
}

function onPointerDown(e) {
  dragging = true;
  rootEl.value.setPointerCapture(e.pointerId);
  setSplitFromEvent(e);
}

function onPointerMove(e) {
  if (dragging) setSplitFromEvent(e);
}

function onPointerUp(e) {
  if (!dragging) return;
  dragging = false;
  try {
    rootEl.value.releasePointerCapture(e.pointerId);
  } catch (err) {
    /* capture already released by the browser */
  }
}
</script>

<style scoped>
.cmp-slider {
  --cmp-canopy: var(--canopy, #1b3a28);
  --cmp-gold: var(--ripening-gold, #e3a72e);
  --cmp-line: var(--line-on-dark, rgba(243, 238, 220, 0.14));

  position: relative;
  aspect-ratio: 4 / 3;
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid var(--cmp-line);
  box-shadow: 0 18px 40px -20px rgba(0, 0, 0, 0.45);
  background: var(--cmp-canopy);
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}

.cmp-layer {
  position: absolute;
  inset: 0;
}
.cmp-layer img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  pointer-events: none;
}
.cmp-after {
  will-change: clip-path;
}

.cmp-handle {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  margin-left: -1px;
  background: var(--cmp-gold);
  z-index: 3;
  cursor: ew-resize;
  box-shadow: 0 0 14px 2px rgba(227, 167, 46, 0.5);
}
.cmp-grip {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 42px;
  height: 42px;
  margin: -21px 0 0 -21px;
  border-radius: 50%;
  background: var(--cmp-gold);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
}
.cmp-grip::before,
.cmp-grip::after {
  content: "";
  width: 2px;
  height: 12px;
  background: var(--paddy-night, #0f1f16);
  border-radius: 1px;
}
.cmp-grip::before {
  margin-right: 5px;
}
.cmp-grip::after {
  margin-left: 5px;
}

.cmp-label {
  position: absolute;
  bottom: 12px;
  z-index: 3;
  font-family: var(--font-mono, "IBM Plex Mono", monospace);
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--husk-paper, #f3eedc);
  background: rgba(15, 31, 22, 0.6);
  padding: 5px 9px;
  border: 1px solid var(--cmp-line);
  border-radius: 4px;
  pointer-events: none;
  white-space: nowrap;
}
.cmp-label-left {
  left: 12px;
}
.cmp-label-right {
  right: 12px;
}
</style>