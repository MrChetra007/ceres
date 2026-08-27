<template>
  <div class="collapsible-bottom-sheet" :class="{ open: isOpen }">
    <!-- Collapsed pull-tab at bottom edge -->
    <button
      class="sheet-tab"
      @click="toggle"
      :aria-label="isOpen ? t('sheet.collapse') : t('sheet.expand')"
      :title="isOpen ? t('sheet.collapse') : t('sheet.expand')"
    >
      <i class="ti" :class="tabIcon"></i>
      <span class="tab-label" v-if="!isOpen">{{ t('sheet.pull_up') }}</span>
    </button>

    <!-- Sheet panel (slides up) -->
    <transition name="sheet-slide">
      <div
        class="sheet-panel"
        v-show="isOpen"
        :style="{ maxHeight: maxHeight }"
      >
        <div class="sheet-handle" @click="toggle">
          <div class="handle-bar"></div>
        </div>
        <div class="sheet-content">
          <slot></slot>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from '../i18n'

const { t } = useI18n()

const props = defineProps({
  maxHeight: { type: String, default: '60vh' },
  modelValue: { type: Boolean, default: false }
})

const emit = defineEmits(['update:modelValue'])

const isOpen = ref(props.modelValue)

const tabIcon = computed(() => isOpen.value ? 'ti-chevron-down' : 'ti-chevron-up')

function toggle() {
  isOpen.value = !isOpen.value
  emit('update:modelValue', isOpen.value)
}

function close() {
  isOpen.value = false
  emit('update:modelValue', false)
}

function onKeydown(e) {
  if (e.key === 'Escape') close()
}

watch(() => props.modelValue, (v) => { isOpen.value = v })

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

defineExpose({ open: isOpen, close, toggle })
</script>

<style scoped>
.collapsible-bottom-sheet {
  position: fixed;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: min(100vw, 100%);
  max-width: 100%;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* Collapsed pull-tab */
.sheet-tab {
  position: relative;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 16px 12px;
  background: var(--panel);
  border: 0.5px solid var(--panel-border);
  border-bottom: none;
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  box-shadow: var(--shadow);
  color: var(--text);
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  transition: background 0.15s, border-color 0.15s;
}

.sheet-tab:hover {
  background: var(--panel-2);
  border-color: var(--panel-border-strong);
}

.sheet-tab:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.sheet-tab .ti {
  font-size: 20px;
  transition: transform 0.2s ease;
}

.tab-label {
  font-size: 11px;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

/* Sheet panel */
.sheet-panel {
  width: 100%;
  max-width: 100%;
  background: var(--panel);
  border: 0.5px solid var(--panel-border);
  border-bottom: none;
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  box-shadow: var(--shadow);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sheet-handle {
  display: flex;
  justify-content: center;
  padding: 10px 0 6px;
  cursor: pointer;
}

.handle-bar {
  width: 40px;
  height: 4px;
  background: var(--panel-border-strong);
  border-radius: 2px;
  opacity: 0.5;
}

.sheet-content {
  flex: 1;
  overflow-y: auto;
  padding: 0 16px 16px;
  min-height: 0;
}

/* Slide transition */
.sheet-slide-enter-active,
.sheet-slide-leave-active {
  transition: transform 0.3s ease, opacity 0.2s ease;
}

.sheet-slide-enter-from,
.sheet-slide-leave-to {
  transform: translateY(100%);
  opacity: 0;
}

/* When open, the tab stays visible as a handle */
.collapsible-bottom-sheet.open .sheet-tab {
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
}

.collapsible-bottom-sheet.open .tab-label {
  display: none;
}

/* Mobile adjustments */
@media (max-width: 640px) {
  .collapsible-bottom-sheet {
    width: 100%;
    left: 0;
    transform: none;
  }
  .sheet-tab {
    padding: 10px 16px 14px;
  }
}
</style>