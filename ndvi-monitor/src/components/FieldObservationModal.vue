<template>
  <div v-if="visible" class="date-picker-overlay" @click.self="close">
    <div class="date-picker-modal obs-modal" role="dialog" aria-modal="true">
      <div class="dpm-head">
        <div class="dpm-icon"><i class="ti ti-clipboard-check"></i></div>
        <div>
          <h3 class="dpm-title">{{ t('obs.modal_title') }}</h3>
          <p class="dpm-sub">{{ t('obs.modal_sub') }}</p>
        </div>
        <button type="button" class="dpm-close" @click="close" :aria-label="t('common.close')">
          <i class="ti ti-x"></i>
        </button>
      </div>

      <div class="ff-body obs-body">
        <div class="obs-group">
          <p class="obs-label">{{ t('obs.what') }}</p>
          <div class="obs-chips">
            <button
              v-for="tag in TAGS"
              :key="tag"
              type="button"
              class="obs-chip"
              :class="{ on: tags.includes(tag) }"
              @click="toggleTag(tag)"
            >
              {{ t('obs.tag_' + tag) }}
            </button>
          </div>
        </div>

        <div class="obs-group">
          <p class="obs-label">{{ t('obs.outcome_label') }}</p>
          <div class="obs-seg">
            <button
              v-for="o in OUTCOMES"
              :key="o"
              type="button"
              class="obs-seg-btn"
              :class="{ on: outcome === o }"
              @click="outcome = o"
            >
              {{ t('obs.outcome_' + o) }}
            </button>
          </div>
        </div>

        <div class="obs-group">
          <label class="obs-label" for="obs-notes">{{ t('obs.notes') }}</label>
          <textarea
            id="obs-notes"
            v-model="notes"
            class="obs-textarea"
            rows="3"
            :placeholder="t('obs.notes_placeholder')"
          ></textarea>
        </div>

        <div class="obs-group">
          <p class="obs-label">{{ t('obs.photo') }}</p>
          <div class="obs-photo-row">
            <label class="obs-photo-pick">
              <input type="file" accept="image/*" capture="environment" @change="onFile" />
              <template v-if="previewUrl">
                <img :src="previewUrl" alt="" />
              </template>
              <template v-else>
                <i class="ti ti-camera"></i>
                <span>{{ t('obs.photo_add') }}</span>
              </template>
            </label>
            <button v-if="previewUrl" type="button" class="obs-photo-remove" @click="clearPhoto">
              {{ t('obs.photo_remove') }}
            </button>
          </div>
        </div>
      </div>

      <div class="date-picker-actions">
        <button class="date-picker-cancel" @click="close">{{ t('common.cancel') }}</button>
        <button class="date-picker-save" :disabled="saving || !canSave" @click="save">
          {{ saving ? t('common.loading') : t('obs.save') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import * as store from '../store'
import { useI18n } from '../i18n'
import { saveFieldObservation } from '../services/supabase'

const props = defineProps({
  visible: { type: Boolean, default: false },
  field: { type: Object, default: null },
})
const emit = defineEmits(['close', 'saved'])

const { t } = useI18n()
const TAGS = ['water', 'weed', 'pest', 'disease', 'nutrient', 'other', 'none']
const OUTCOMES = ['improved', 'same', 'worse', 'unknown']

const tags = ref([])
const outcome = ref('unknown')
const notes = ref('')
const photoFile = ref(null)
const previewUrl = ref('')
const saving = ref(false)

const canSave = computed(
  () => tags.value.length > 0 || outcome.value !== 'unknown' || notes.value.trim().length > 0 || !!photoFile.value,
)

watch(
  () => props.visible,
  (visible) => {
    if (visible) reset()
  },
)

function reset() {
  tags.value = []
  outcome.value = 'unknown'
  notes.value = ''
  saving.value = false
  clearPhoto()
}

function toggleTag(tag) {
  if (tag === 'none') {
    tags.value = tags.value.includes('none') ? [] : ['none']
    return
  }
  const next = tags.value.filter((x) => x !== 'none')
  const i = next.indexOf(tag)
  if (i >= 0) next.splice(i, 1)
  else next.push(tag)
  tags.value = next
}

function onFile(e) {
  const file = e.target.files && e.target.files[0]
  if (!file) return
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  photoFile.value = file
  previewUrl.value = URL.createObjectURL(file)
}

function clearPhoto() {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = ''
  photoFile.value = null
}

onBeforeUnmount(clearPhoto)

function close() {
  if (saving.value) return
  emit('close')
}

async function save() {
  if (!props.field || saving.value || !canSave.value) return
  saving.value = true
  try {
    await saveFieldObservation({
      fieldId: props.field.id,
      tags: tags.value,
      outcome: outcome.value,
      notes: notes.value,
      photoFile: photoFile.value,
    })
    store.showToast(t('obs.saved'))
    emit('saved')
    emit('close')
  } catch (e) {
    store.showToast(t('obs.failed'))
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.obs-modal {
  max-width: 460px;
}
.obs-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.obs-group {
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.obs-label {
  margin: 0;
  font-size: 10.5px;
  font-weight: 650;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-faint);
}
.obs-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.obs-chip {
  background: rgba(255, 255, 255, 0.05);
  border: 0.5px solid var(--panel-border-strong);
  border-radius: 999px;
  color: var(--text-dim);
  font-size: 11.5px;
  font-weight: 600;
  padding: 5px 11px;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.obs-chip:hover {
  color: var(--text);
  border-color: var(--text-faint);
}
.obs-chip.on {
  background: var(--accent-dim);
  color: var(--accent);
  border-color: rgba(34, 201, 142, 0.45);
}
.obs-seg {
  display: flex;
  border: 0.5px solid var(--panel-border-strong);
  border-radius: var(--radius-md);
  overflow: hidden;
}
.obs-seg-btn {
  flex: 1;
  background: transparent;
  border: none;
  border-right: 0.5px solid var(--panel-border);
  color: var(--text-dim);
  font-size: 11.5px;
  font-weight: 600;
  padding: 8px 4px;
  cursor: pointer;
  font-family: inherit;
}
.obs-seg-btn:last-child {
  border-right: none;
}
.obs-seg-btn.on {
  background: var(--accent-dim);
  color: var(--accent);
}
.obs-textarea {
  width: 100%;
  box-sizing: border-box;
  resize: vertical;
  min-height: 64px;
  background: rgba(255, 255, 255, 0.04);
  border: 0.5px solid var(--panel-border-strong);
  border-radius: var(--radius-md);
  color: var(--text);
  font-family: inherit;
  font-size: 12.5px;
  line-height: 1.45;
  padding: 9px 11px;
}
.obs-textarea:focus {
  outline: none;
  border-color: var(--accent);
}
.obs-photo-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.obs-photo-pick {
  width: 78px;
  height: 78px;
  border-radius: 10px;
  border: 1px dashed var(--panel-border-strong);
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-dim);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  font-size: 9.5px;
  text-align: center;
  cursor: pointer;
  overflow: hidden;
}
.obs-photo-pick input {
  display: none;
}
.obs-photo-pick .ti {
  font-size: 18px;
}
.obs-photo-pick img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.obs-photo-remove {
  background: none;
  border: none;
  color: var(--red);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
}
</style>
