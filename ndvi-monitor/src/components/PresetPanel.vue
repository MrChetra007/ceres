<template>
  <div id="preset-panel" class="preset-panel">
    <span class="preset-label">Jump to:</span>
    <button
      v-for="(p, i) in state.presets"
      :key="i"
      class="preset-btn"
      @click="store.flyToPreset(p)"
    >{{ p.label }}</button>
    <button id="preset-manage-btn" class="preset-manage-btn" title="Manage locations" @click.stop="state.presetEditorVisible = true">
      <i class="ti ti-pencil"></i>
    </button>
  </div>
</template>

<script setup>
import { state } from '../store'
import * as store from '../store'
</script>
