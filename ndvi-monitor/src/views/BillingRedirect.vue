<template>
  <div class="billing-redirect" aria-busy="true"></div>
</template>

<script setup>
import { onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { state } from '../store'
import * as store from '../store'
import { useI18n } from '../i18n'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()

onMounted(async () => {
  const status = String(route.query.status || '')
  await store.loadSubscription()

  const tierName = state.subscription?.tier || ''

  if (status === 'success') {
    store.showToast(t('subs.checkout_success', { plan: t('subs.' + (tierName || 'individual')) }))
    store.openPlanBillingModal()
  } else if (status === 'cancelled') {
    store.showToast(t('common.cancel'))
  }

  // If not signed in, the router guard on the map handles auth; otherwise just
  // land back on the map app.
  router.replace(state.supabaseUser ? { name: 'map' } : { name: 'pricing' })
})
</script>

<style scoped>
.billing-redirect {
  position: fixed;
  inset: 0;
  background: var(--bg, #0b0f14);
}
</style>
