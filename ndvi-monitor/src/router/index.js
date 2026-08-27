import { createRouter, createWebHistory } from 'vue-router'
import { state } from '../store'
import LandingPage from '../components/LandingPage.vue'
import MapView from '../views/MapView.vue'

const routes = [
  { path: '/', name: 'landing', component: LandingPage },
  { path: '/map', name: 'map', component: MapView },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to) => {
  if (to.name === 'landing' && state.supabaseUser) {
    return { name: 'map' }
  }
})

export default router
