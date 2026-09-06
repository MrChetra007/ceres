<template>
  <RouterView />
  <CheckoutModal />
  <div id="toast-stack" class="toast-stack">
    <transition-group name="toast">
      <div
        v-for="toast in state.toasts"
        :key="toast.id"
        class="toast"
        :class="{ 'toast-action': toast.actions }"
      >
        <span class="toast-msg">{{ toast.msg }}</span>
        <span
          v-for="a in toast.actions"
          :key="a.label"
          class="toast-btn"
          @click="a.onClick(); dismissToast(toast.id)"
        >{{ a.label }}</span>
      </div>
    </transition-group>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import CheckoutModal from './components/CheckoutModal.vue'
import { state, dismissToast } from './store'
import { maybeShowInstallInvite } from './services/pwa'

onMounted(() => {
  // Let beforeinstallprompt (if any) arrive before deciding the invite copy.
  setTimeout(() => maybeShowInstallInvite(), 1600)
})
</script>