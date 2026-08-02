<template>
  <div id="auth-overlay" class="auth-overlay" v-show="state.authOverlayVisible">
    <div class="auth-card">
      <h2>NDVI Rice Crop Health Monitor</h2>
      <p class="subtitle">Battambang, Cambodia</p>
      <div class="auth-fields">
        <div v-if="!state.supabaseUser" class="auth-section">
          <label class="auth-label">Sign in to sync your fields</label>
          <button class="sb-sign-in-btn" @click="store.signInWithSupabaseGoogle()">Sign in with Google</button>
        </div>
        <div v-if="!state.eeReady && !state.supabaseUser" class="auth-divider"><span>or</span></div>
        <div v-if="!state.eeReady" class="auth-section">
          <label class="auth-label">Connect satellite data</label>
          <button id="sign-in-btn" @click="store.authenticate()">Sign in with Google</button>
        </div>
      </div>
      <div class="auth-skip">
        <button class="auth-skip-btn" @click="store.hideAuthOverlay()">Explore the map first</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { state } from '../store'
import * as store from '../store'
</script>
