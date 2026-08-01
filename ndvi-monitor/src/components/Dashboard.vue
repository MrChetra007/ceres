<template>
  <div id="dashboard" class="panel dashboard" v-show="open">
    <div class="dashboard-header">
      <h3>My Fields</h3>
      <button class="close-btn" @click="open = false">&times;</button>
    </div>
    <div id="field-list">
      <div
        v-for="f in state.fields"
        :key="f.id"
        class="field-card panel"
        :class="{ active: f.id === state.currentFieldId }"
        :data-id="f.id"
        @click="onCardClick(f)"
      >
        <div class="field-card-header">
          <div>
            <p class="panel-title">{{ f.name }}</p>
            <p class="panel-subtitle" :id="'stage-' + f.id">{{ status(f) ? status(f).stageLabel : 'Loading\u2026' }}</p>
          </div>
          <span class="status-badge" :class="badgeClass(f)">{{ status(f) ? status(f).badgeText : '\u2014' }}</span>
        </div>
        <div class="field-card-stats">
          <span><i class="ti ti-ruler-2"></i> {{ formatHectares(getOrComputeArea(f)) }}</span>
          <span>
            <i class="ti ti-calendar"></i> {{ f.plantingDate || 'No date' }}
            <button class="plant-date-btn" :title="'Set planting date'" @click.stop="setPlantingDate(f)"><i class="ti ti-edit"></i></button>
          </span>
          <span><i class="ti ti-leaf"></i> {{ status(f) && status(f).value != null ? status(f).value.toFixed(2) : '\u2014' }}</span>
        </div>
        <div v-if="areaWarning(f)" class="field-area-warning">{{ areaWarning(f) }}</div>
        <button class="delete-btn" @click.stop="store.deleteField(f.id)">&#10005;</button>
      </div>
      <p v-if="state.fields.length === 0" class="dashboard-hint">Draw a polygon or rectangle on the map, then name it to save.</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { state, fieldStatus } from '../store'
import * as store from '../store'
import { getOrComputeArea, formatHectares, getAreaWarning } from '../store'

const open = ref(false)

function status(f) {
  return fieldStatus[f.id] || null
}

function badgeClass(f) {
  const s = status(f)
  return s && s.badgeClass ? 'status-' + s.badgeClass : ''
}

function areaWarning(f) {
  return getAreaWarning(getOrComputeArea(f))
}

function onCardClick(f) {
  if (f.id === state.currentFieldId) {
    store.clearFieldSelection()
    return
  }
  store.loadFieldById(f.id)
}

function setPlantingDate(f) {
  store.promptDate(f.plantingDate, (newDate) => {
    if (newDate === undefined) return
    store.updateField(f.id, { planting_date: newDate })
  })
}

defineExpose({ open })
</script>
