<template>
  <div class="date-picker-overlay" v-show="datePicker.visible" @click.self="store.cancelDate()">
    <div class="date-picker-modal">
      <label>Planting date:</label>
      <input type="date" ref="inputEl" v-model="val" />
      <div class="date-picker-actions">
        <button class="date-picker-cancel" @click="store.cancelDate()">Cancel</button>
        <button class="date-picker-save" @click="store.submitDate(val)">Save</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'
import { datePicker } from '../store'
import * as store from '../store'

const val = ref('')
const inputEl = ref(null)

watch(() => datePicker.visible, (open) => {
  if (open) {
    val.value = datePicker.currentDate || ''
    nextTick(() => inputEl.value && inputEl.value.focus())
  }
})
</script>
