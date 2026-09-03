<template>
  <div class="collapsible-drawer" :class="[position, { open: isOpen }]">
    <!-- Collapsed tab (edge trigger) -->
    <button
      class="drawer-tab"
      :class="position"
      @click="toggle"
      :aria-label="isOpen ? t('drawer.collapse') : t('drawer.expand')"
      :title="isOpen ? t('drawer.collapse') : t('drawer.expand')"
    >
      <i class="ti" :class="tabIcon"></i>
    </button>

    <!-- Drawer panel -->
    <transition :name="`drawer-slide-${position}`">
      <aside
        class="drawer-panel"
        v-show="isOpen"
        :class="position"
        :style="{ '--drawer-width': typeof width === 'number' ? width + 'px' : width }"
      >
        <div v-if="!noHeader" class="drawer-header">
          <slot name="header">
            <span class="drawer-title"><slot name="title">Panel</slot></span>
          </slot>
          <slot name="close">
            <button class="drawer-close" @click="close" :aria-label="t('common.close')">&times;</button>
          </slot>
        </div>
        <div class="drawer-body" :style="{ maxHeight: bodyMaxHeight }">
          <slot></slot>
        </div>
        <slot name="footer"></slot>
      </aside>
    </transition>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from '../i18n'

const { t } = useI18n()

const props = defineProps({
  position: { type: String, required: true, validator: v => ['left', 'right'].includes(v) },
  width: { type: [Number, String], default: 300 },
  modelValue: { type: Boolean, default: false },
  noHeader: { type: Boolean, default: false }
})

const emit = defineEmits(['update:modelValue'])

const isOpen = ref(props.modelValue)

const tabIcon = computed(() => {
  if (props.position === 'left') return isOpen.value ? 'ti-chevron-left' : 'ti-chevron-right'
  return isOpen.value ? 'ti-chevron-right' : 'ti-chevron-left'
})

const bodyMaxHeight = computed(() => `calc(100vh - var(--topbar-height, 56px) - 32px)`)

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

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
})

defineExpose({ open: isOpen, close, toggle })
</script>

<style scoped>
.collapsible-drawer {
  position: fixed;
  /* Sit just above the topbar (z 1001) so the drawer's own close/toggle X can
     never be hidden behind the header, even when the header wraps taller on
     narrower screens and overlaps the drawer top. */
  top: var(--topbar-height, 56px);
  bottom: 0;
  z-index: 1002;
  display: flex;
  align-items: stretch;
}

.collapsible-drawer.left {
  left: 0;
}
.collapsible-drawer.right {
  right: 0;
}

/* Collapsed tab on the edge */
.drawer-tab {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 36px;
  height: 36px;
  border-radius: var(--radius-md);
  background: var(--panel);
  border: 0.5px solid var(--panel-border);
  box-shadow: var(--shadow);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text);
  cursor: pointer;
  font-size: 16px;
  transition: background 0.15s, border-color 0.15s, box-shadow 0.15s;
  z-index: 10;
}

.collapsible-drawer.left .drawer-tab {
  left: 8px;
  border-radius: 0 var(--radius-md) var(--radius-md) 0;
}
.collapsible-drawer.right .drawer-tab {
  right: 8px;
  border-radius: var(--radius-md) 0 0 var(--radius-md);
}

.drawer-tab:hover {
  background: var(--panel-2);
  border-color: var(--panel-border-strong);
}

.drawer-tab:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

/* Drawer panel */
.drawer-panel {
  position: relative;
  width: var(--drawer-width, 300px);
  height: 100%;
  background: var(--panel);
  border: 0.5px solid var(--panel-border);
  box-shadow: var(--shadow);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.collapsible-drawer.left .drawer-panel {
  left: 0;
  border-radius: 0 var(--radius-lg) var(--radius-lg) 0;
  border-left: none;
  box-shadow: 4px 0 24px rgba(0, 0, 0, 0.4);
}
.collapsible-drawer.right .drawer-panel {
  right: 0;
  border-radius: var(--radius-lg) 0 0 var(--radius-lg);
  border-right: none;
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.4);
}

.drawer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 0.5px solid var(--panel-border);
  flex-shrink: 0;
}

.drawer-title {
  font-size: 15px;
  font-weight: 650;
  color: var(--text);
  display: flex;
  align-items: center;
  gap: 8px;
}

.drawer-close {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: transparent;
  border: none;
  color: var(--text-faint);
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, color 0.15s;
}

.drawer-close:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text);
}

.drawer-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.drawer-panel :deep(.drawer-body > *:last-child) {
  margin-bottom: 0;
}

/* Slide transitions */
.drawer-slide-left-enter-active,
.drawer-slide-left-leave-active,
.drawer-slide-right-enter-active,
.drawer-slide-right-leave-active {
  transition: transform 0.25s ease;
}

.drawer-slide-left-enter-from,
.drawer-slide-left-leave-to {
  transform: translateX(-100%);
}

.drawer-slide-right-enter-from,
.drawer-slide-right-leave-to {
  transform: translateX(100%);
}

/* Mobile adjustments */
@media (max-width: 640px) {
  .collapsible-drawer {
    top: var(--topbar-height, 56px);
  }
  .drawer-tab {
    width: 44px;
    height: 44px;
  }
  .collapsible-drawer.left .drawer-tab { left: 4px; }
  .collapsible-drawer.right .drawer-tab { right: 4px; }
}
</style>