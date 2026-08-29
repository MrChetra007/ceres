<template>
  <span
    class="tt-wrap"
    :class="'tt-' + position"
    :aria-describedby="visible ? bubbleId : undefined"
    @mouseenter="onShow"
    @mouseleave="onHide"
    @focusin="onShow"
    @focusout="onHide"
  >
    <slot></slot>
    <span v-if="visible && text" :id="bubbleId" class="tt-bubble" role="tooltip">{{ text }}</span>
  </span>
</template>

<script setup>
import { ref } from 'vue'

const props = defineProps({
  text: { type: String, default: '' },
  position: { type: String, default: 'top', validator: (v) => ['top', 'bottom'].includes(v) },
})

const SHOW_DELAY_MS = 220

const visible = ref(false)
let timer = null

function onShow() {
  clearTimeout(timer)
  timer = setTimeout(() => { visible.value = true }, SHOW_DELAY_MS)
}

function onHide() {
  clearTimeout(timer)
  visible.value = false
}

const bubbleId = 'tt-' + Math.random().toString(36).slice(2, 10)
</script>

<style scoped>
/* Position: absolute relative to the wrapped button, centered above/below it.
   Desktop + keyboard only — hover doesn't exist on touch devices. */
.tt-wrap {
  position: relative;
  display: inline-flex;
}

.tt-bubble {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2001;
  max-width: 220px;
  width: max-content;
  padding: 7px 10px;
  font-size: 11px;
  line-height: 1.45;
  font-weight: 400;
  text-align: center;
  color: var(--text-dim);
  background: var(--panel-2);
  border: 0.5px solid var(--panel-border-strong);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow);
  pointer-events: none;
}

.tt-top .tt-bubble {
  bottom: calc(100% + 8px);
}
.tt-bottom .tt-bubble {
  top: calc(100% + 8px);
}

.tt-top .tt-bubble::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 5px solid transparent;
  border-top-color: var(--panel-2);
}
.tt-bottom .tt-bubble::after {
  content: '';
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 5px solid transparent;
  border-bottom-color: var(--panel-2);
}
</style>