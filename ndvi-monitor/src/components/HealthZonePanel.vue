<template>
  <div v-if="state.eeReady" class="hz-root">
    <!-- Toggle (floating pill) — opens the floating card on desktop/tablet and
         the bottom-sheet drawer on mobile. Always visible so the panel can be
         reopened after its X is clicked (default state is closed). -->
    <button
      class="hz-toggle"
      :class="{ active: state.healthZone.visible, shift: detailOpen && !isMobile }"
      :title="t('hz.title')"
      @click="toggle"
    >
      <i class="ti ti-chart-pie"></i>
      <span class="hz-toggle-label">{{ t('hz.open') }}</span>
    </button>

    <!-- Desktop / tablet (>=768px): floating card over the map. -->
    <transition name="hz-pop">
      <section
        v-if="!isMobile && state.healthZone.visible"
        class="hz-panel panel"
        :class="{ shift: detailOpen }"
      >
        <header class="hz-head">
          <span class="hz-title"><i class="ti ti-chart-pie"></i> {{ t('hz.title') }}</span>
          <button class="close-btn" :title="t('common.close')" @click="close">&times;</button>
        </header>
        <div class="hz-body">
          <template v-if="view === 'other'">
            <p class="hz-note">{{ t('hz.not_available') }}</p>
          </template>
          <template v-else>
            <ScaleBar />
            <ZoneList />
          </template>
        </div>
      </section>
    </transition>

    <!-- Mobile (<768px): single bottom-sheet drawer, Analysis Scale first, zone
         list scrollable beneath. Backdrop click closes it like the field detail
         sheet. -->
    <transition name="hz-sheet">
      <div v-if="isMobile && state.healthZone.visible" class="hz-sheet" @click.self="close">
        <div class="hz-sheet-inner">
          <div class="hz-sheet-handle"></div>
          <header class="hz-head">
            <span class="hz-title"><i class="ti ti-chart-pie"></i> {{ t('hz.title') }}</span>
            <button class="close-btn" :title="t('common.close')" @click="close">&times;</button>
          </header>
          <div class="hz-body">
            <template v-if="view === 'other'">
              <p class="hz-note">{{ t('hz.not_available') }}</p>
            </template>
            <template v-else>
              <ScaleBar />
              <ZoneList />
            </template>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { state, getGrowthStage, formatHectares } from '../store'
import * as store from '../store'
import { MONTHS, ZONE_SCALE, FLAT_THRESHOLDS, STAGE_DEFICIT_BAD } from '../config'
import { useI18n } from '../i18n'
import { toKhmerDigits, stageName } from '../services/format'
import ScaleBar from './HealthZoneScaleBar.vue'
import ZoneList from './HealthZoneZoneList.vue'

const { t } = useI18n()

// Breakpoint split: >=768px floating cards, <768px bottom-sheet drawer.
const mq = window.matchMedia('(max-width: 767px)')
const isMobile = ref(mq.matches)
function onMq(e) { isMobile.value = e.matches }
mq.addEventListener('change', onMq)
onBeforeUnmount(() => mq.removeEventListener('change', onMq))

const view = computed(() => state.healthZone.view)
// When the field-inspector panel is open on desktop it covers the right edge;
// slide the floating UI clear of it (see .shift rules in style.css).
const detailOpen = computed(() => state.infoPanelVisible && !!state.currentFieldId)

function toggle() {
  if (state.healthZone.visible) { state.healthZone.visible = false; return }
  state.healthZone.visible = true
  store.fetchHealthZone(true)
}
function close() { state.healthZone.visible = false }

// Recompute whenever anything the breakdown depends on changes while open.
watch(() => state.healthZone.visible, (v) => { if (v) store.fetchHealthZone(true) })
watch(() => state.mainMonth, () => { if (state.healthZone.visible) store.fetchHealthZone() })
watch(() => state.currentFieldId, () => { if (state.healthZone.visible) store.fetchHealthZone(true) })
watch(() => state.currentIndex, () => { if (state.healthZone.visible) store.fetchHealthZone(true) })
watch(() => state.radarFallback.main, () => { if (state.healthZone.visible) store.fetchHealthZone(true) })
// A month load just finished -> the composite (and its radar/cloud mode) settled.
watch(() => state.loading, (l, prev) => {
  if (prev && !l && state.healthZone.visible) store.fetchHealthZone(true)
})

defineExpose({ isMobile, view })
</script>
