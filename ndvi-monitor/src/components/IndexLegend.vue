<template>
  <div v-if="cfg" class="aim-legend" :class="{ 'aim-legend--compact': compact }">
    <div class="aim-legend-head">
      <span class="aim-legend-title">{{ cfg.name }}</span>
      <span class="aim-legend-sub">{{ cfg.label }}</span>
    </div>

    <div v-if="!compact" class="aim-legend-bands">
      <div
        v-for="band in bands"
        :key="band.label"
        class="aim-band-row"
        :class="'aim-band-row--' + band.label"
      >
        <span
          v-if="!compact"
          class="aim-legend-sprout"
          :class="'sprout-' + band.label"
          aria-hidden="true"
        >
          <svg viewBox="0 0 24 24" class="aim-sprout-img">
            <path v-if="band.label !== 'dead'" d="M12 20v-8" class="aim-sp-stem" stroke-linecap="round" />
            <ellipse v-for="(lf, i) in leaves(band.label)" :key="i" v-bind="lf" class="aim-sp-leaf" />
            <ellipse cx="12" cy="21" rx="7.5" ry="2.4" class="aim-sp-soil" />
          </svg>
        </span>
        <div class="aim-band-info">
          <b class="aim-band-name">{{ bandLabel(band.label) }}</b>
          <span class="aim-band-range mono">{{ fmt(band.lo) }} – {{ fmt(band.hi) }}</span>
        </div>
        <span class="aim-band-phrase">{{ bandPhrase(band.label) }}</span>
      </div>
    </div>

    <div class="aim-fill">
      <div class="aim-fill-track">
        <span v-for="seg in segs" :key="seg.label" class="aim-fill-seg" :class="seg.cls"></span>
        <span
          v-if="value != null"
          class="aim-fill-marker"
          :style="{ left: markerPct + '%' }"
          :title="t('aim.current_value') + ': ' + fmt(value)"
        ></span>
      </div>
      <div class="aim-fill-labels mono">
        <span>{{ fmt(min) }}</span>
        <span v-for="(b, i) in bands.slice(0, -1)" :key="i">{{ fmt(b.hi) }}</span>
        <span>{{ fmt(max) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { INDICES } from '../config'
import { useI18n } from '../i18n'

// One of INDICES keys ('ndvi', 'ndwi', ...). 'truecolor' renders nothing.
// Optional `value` = current raw reading (draws the marker on the domain bar).
// `compact` = hides the plant art + phrases; just the band bar + ranges (used
// under the band tabs where switching the tab drives the legend).
const props = defineProps({
  index: { type: String, required: true },
  value: { type: Number, default: null },
  compact: { type: Boolean, default: false },
})

const { t } = useI18n()

const cfg = computed(() => INDICES[props.index] || null)
const min = computed(() => (cfg.value && cfg.value.vis ? cfg.value.vis.min : 0))
const max = computed(() => (cfg.value && cfg.value.vis ? cfg.value.vis.max : 1))

function q(f) {
  return min.value + (max.value - min.value) * f
}

// Same 4-band quartile structure as the server's _shared/indexTranslations.ts,
// so the legend colors and the plain-language phrases can never disagree.
const LABELS = ['dead', 'unhealthy', 'moderate', 'healthy']
const bands = computed(() =>
  LABELS.map((label, i) => ({
    label,
    lo: i === 0 ? min.value : q(i * 0.25),
    hi: i === LABELS.length - 1 ? max.value : q((i + 1) * 0.25),
  })),
)

const segs = computed(() =>
  bands.value.map((b) => ({ label: b.label, cls: 'aim-fill-' + b.label })),
)

const markerPct = computed(() => {
  if (props.value == null) return null
  const span = max.value - min.value || 1
  return Math.max(0, Math.min(100, ((props.value - min.value) / span) * 100))
})

function fmt(v) {
  const n = Math.abs(v) < 1e-9 ? 0 : v
  return n.toFixed(2)
}

// Band names/phrases reuse the SAME i18n keys the server returns for plain
// phrases (aim.p_<index>_<band>) — the color grammar and the wording always
// agree.
function bandLabel(label) {
  return t('aim.band_' + label)
}
function bandPhrase(label) {
  if (props.compact) return ''
  return t('aim.p_' + props.index + '_' + label)
}

// Stylized plant illustration — leaf count + color encode the band state:
// dead = bare soil only; unhealthy = one pale leaf; moderate = two; healthy =
// a full three-leaf sprout. Stylized deliberately and swappable for real
// AI-generated illustrations later (AIM Feature 5).
const LEAF_PARTS = {
  leafLeftSmall: { cx: 11.5, cy: 10, rx: 3, ry: 1.5, transform: 'rotate(-30 11.5 10)' },
  leafLeft: { cx: 10, cy: 11, rx: 4, ry: 1.7, transform: 'rotate(-25 10 11)' },
  leafRight: { cx: 14, cy: 10, rx: 4, ry: 1.7, transform: 'rotate(25 14 10)' },
  leafTop: { cx: 12, cy: 6.5, rx: 3, ry: 1.8, transform: 'rotate(0 12 6.5)' },
}

function leaves(label) {
  switch (label) {
    case 'dead':
      return []
    case 'unhealthy':
      return [LEAF_PARTS.leafLeftSmall]
    case 'moderate':
      return [LEAF_PARTS.leafLeft, LEAF_PARTS.leafRight]
    default:
      return [LEAF_PARTS.leafLeft, LEAF_PARTS.leafRight, LEAF_PARTS.leafTop]
  }
}
</script>