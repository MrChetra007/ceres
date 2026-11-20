import { createRouter, createWebHistory } from 'vue-router'
import { state, loadSubscription } from '../store'
import LandingPage from '../views/LandingPage.vue'
import MapView from '../views/MapView.vue'
import PricingPage from '../views/PricingPage.vue'
import BillingRedirect from '../views/BillingRedirect.vue'

const routes = [
  { path: '/', name: 'landing', component: LandingPage },
  { path: '/map', name: 'map', component: MapView },
  {
    path: '/government',
    name: 'government',
    component: () => import('../views/GovernmentDashboard.vue'),
  },
  { path: '/pricing', name: 'pricing', component: PricingPage },
  { path: '/billing', name: 'billing', component: BillingRedirect },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach(async (to) => {
  // /government is an extension-viewer surface. The database function is the
  // real security boundary; this guard is UX only.
  if (to.name === 'government') {
    if (!state.supabaseUser) return { name: 'map' }
    if (!state.roleLoaded) {
      try {
        await loadSubscription()
      } catch (e) {}
    }
    if (state.role !== 'extension_viewer') return { name: 'map' }
  }

  if (to.name === 'landing' && state.supabaseUser) {
    return { name: 'map' }
  }
  // unauthenticated visitor on the public landing must always see the
  // landing page, even if a past onboarding run persisted `ndvi_landing_done`
  // (which would otherwise leave `landingVisible === false` -> blank page)
  if (to.name === 'landing' && !state.supabaseUser) {
    state.landingVisible = true
  }
  // unauthenticated visitor landing on the map must get the sign-in popup
  if (to.name === 'map' && !state.supabaseUser) {
    state.authOverlayVisible = true
  }
})

export default router
