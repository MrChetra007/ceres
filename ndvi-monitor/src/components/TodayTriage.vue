<template>
  <div v-if="state.fields.length > 1" class="triage-card">
    <div class="triage-head">
      <span class="triage-title"><i class="ti ti-list-check"></i>{{ t('triage.title') }}</span>
      <span class="triage-sub">{{ t('triage.sub') }}</span>
    </div>

    <p v-if="!triage.length" class="triage-empty">{{ t('triage.loading') }}</p>
    <p v-else-if="!actionable.length" class="triage-empty">{{ t('triage.calm') }}</p>
    <ul v-else class="triage-list">
      <li
        v-for="item in actionable"
        :key="item.field.id"
        class="triage-item"
        :class="'tier-' + item.decision.tier"
        @click="open(item.field)"
      >
        <span class="triage-dot" :class="'tier-' + item.decision.tier"></span>
        <span class="triage-main">
          <span class="triage-name">{{ item.field.name }}</span>
          <span class="triage-why">{{ t(item.decision.headline.key, item.decision.headline.params) }}</span>
        </span>
        <span class="triage-tier">{{ t('decision.tier_' + item.decision.tier) }}</span>
      </li>
    </ul>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { state, fieldStatus, fieldTrends, fieldConfidence, getGrowthStage, getOrComputeArea } from '../store'
import * as store from '../store'
import { buildDecision } from '../services/decision'
import { useI18n } from '../i18n'

const { t } = useI18n()

function statusKeyOf(s) {
  if (!s) return 'unknown'
  if (s.badgeClass === 'stressed') return 'stressed'
  if (s.badgeClass === 'moderate') return 'below_expected'
  if (s.badgeClass === 'healthy') return 'healthy'
  return 'unknown'
}

// Same 14-day comparison as the field panel / worker, computed from whatever
// trend series is already loaded (no extra Earth Engine calls).
function trendPctOf(f) {
  const data = fieldTrends[f.id]
  if (!Array.isArray(data) || data.length < 2) return null
  const pts = data
    .filter((d) => d && d.date && typeof d.value === 'number' && isFinite(d.value))
    .slice()
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
  if (pts.length < 2) return null
  const recent = pts[pts.length - 1]
  let earlier = null
  for (let i = pts.length - 2; i >= 0; i--) {
    const days = (new Date(recent.date) - new Date(pts[i].date)) / 86400000
    if (days >= 14) { earlier = pts[i]; break }
  }
  if (!earlier || !earlier.value) return null
  return ((recent.value - earlier.value) / earlier.value) * 100
}

function dayCountOf(f) {
  if (!f.plantingDate) return null
  return Math.floor((Date.now() - new Date(f.plantingDate).getTime()) / 86400000)
}

const triage = computed(() => {
  return state.fields
    .map((f) => {
      const s = fieldStatus[f.id] || null
      if (!s) return null
      const dayCount = dayCountOf(f)
      const conf = fieldConfidence(f)
      const decision = buildDecision({
        index: 'ndvi',
        status: statusKeyOf(s),
        stage: dayCount != null && dayCount >= 0 ? getGrowthStage(dayCount, f).stage : null,
        dayCount,
        prePlanting: dayCount != null && dayCount < 0,
        ndvi: s.value != null ? s.value : null,
        rainfallMm: null,
        forecastDays: null,
        confidenceTier: conf && conf.tier ? conf.tier : null,
        mode: s.cloudBlocked ? 'no_data' : 'optical',
        trendPct: trendPctOf(f),
        cropEnglish: f.cropEnglish || null,
      })
      const areaHa = getOrComputeArea(f) || 0
      const tierRank = decision.tier === 'act' ? 3 : decision.tier === 'scout' ? 2 : 1
      // Action tier dominates; then signal strength; then hectares at risk.
      const rank = tierRank * 1000 + decision.score * 100 + Math.min(areaHa, 50)
      return { field: f, status: s, decision, areaHa, rank }
    })
    .filter(Boolean)
    .sort((a, b) => b.rank - a.rank)
})

const actionable = computed(() =>
  triage.value.filter((x) => x.decision.tier !== 'monitor').slice(0, 3),
)

function open(f) {
  if (f.id === state.currentFieldId) return
  store.loadFieldById(f.id)
}
</script>
