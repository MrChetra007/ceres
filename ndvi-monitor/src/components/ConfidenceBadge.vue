<template>
  <span class="conf-badge" :class="'conf-' + tier" :title="showReason ? reason : ''">
    <span class="conf-dot"></span>
    <span class="conf-label">{{ label }}</span>
    <span v-if="showReason && reason" class="conf-reason">{{ reason }}</span>
  </span>
</template>

<script setup>
import { computed } from 'vue'
import { state } from '../store'

const props = defineProps({
  tier: { type: String, default: 'high' },
  reason: { type: String, default: '' },
  showReason: { type: Boolean, default: false },
})

const labels = { high: 'High confidence', medium: 'Medium confidence', low: 'Low confidence' }
const label = computed(() => {
  if (state.preferredLanguage !== 'km') return labels[props.tier] || ''
  return { high: 'ទំនុកចិត្តខ្ពស់', medium: 'ទំនុកចិត្តមធ្យម', low: 'ទំនុកចិត្តទាប' }[props.tier] || ''
})
</script>
