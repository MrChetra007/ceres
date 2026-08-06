<template>
  <span class="conf-badge" :class="'conf-' + tier" :title="showReason ? reason : ''">
    <span class="conf-dot"></span>
    <span class="conf-label">{{ label }}</span>
    <span v-if="showReason && reason" class="conf-reason">{{ reason }}</span>
  </span>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  tier: { type: String, default: 'high' },
  reason: { type: String, default: '' },
  showReason: { type: Boolean, default: false },
})

const labels = { high: 'High confidence', medium: 'Medium confidence', low: 'Low confidence' }
const label = computed(() => labels[props.tier] || '')
</script>
