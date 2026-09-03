<template>
  <div class="help-overlay" v-show="state.settingsVisible" @click.self="store.closePlanBillingModal()">
    <div class="bb-modal bb-settings">
      <div class="bb-header">
        <h3>{{ t('subs.plan_and_billing') }}</h3>
        <button class="bb-close" @click="store.closePlanBillingModal()"><i class="ti ti-x"></i></button>
      </div>

      <div class="bb-body">
        <div class="bb-plan-row">
          <div>
            <div class="bb-label">{{ t('subs.plan') }}</div>
            <div class="bb-plan-name">{{ t(tierKey) }}</div>
            <div class="bb-plan-price">{{ t(priceKey) }}</div>
          </div>
          <div class="bb-status-pill" :class="'status-' + state.subscription.status">
            {{ t(statusKey) }}
          </div>
        </div>

        <div class="bb-row bb-renew">
          <i class="ti ti-calendar"></i>
          <span v-if="state.subscription.renewsAt">
            {{ t('subs.renews_on', { date: store.formatDateLong(state.subscription.renewsAt, lang) }) }}
          </span>
          <span v-else>{{ t('subs.renews_not_available') }}</span>
        </div>

        <div class="bb-source-note" v-if="state.subscription.source === 'manual_grant'">
          {{ t('subs.granted_manually') }}
        </div>
        <div class="bb-source-note" v-else-if="state.subscription.source === 'aba_payway'">
          {{ t('subs.paid_aba') }}
        </div>

        <div class="bb-label">{{ t('subs.usage') }}</div>
        <div class="bb-usage">
          <div class="bb-usage-line">
            <span>{{ t('subs.limit_areas', { used: state.aois.length, max: state.subscription.maxAois }) }}</span>
            <span class="bb-usage-pct">{{ aoiPct }}%</span>
          </div>
          <div class="bb-bar"><div class="bb-bar-fill" :style="{ width: aoiPct + '%' }"></div></div>

          <div class="bb-usage-line">
            <span>{{ t('subs.limit_hectares', { used: store.formatHectares(totalHectares, lang), max: store.formatHectares(state.subscription.maxHectares, lang) }) }}</span>
            <span class="bb-usage-pct">{{ hectarePct }}%</span>
          </div>
          <div class="bb-bar"><div class="bb-bar-fill" :style="{ width: hectarePct + '%' }"></div></div>
        </div>

        <div class="bb-section-label">{{ t('subs.payment_history') }}</div>
        <div class="bb-history">
          <p v-if="!loadingHistory && events.length === 0" class="bb-empty">{{ t('subs.no_history') }}</p>
          <p v-else-if="loadingHistory" class="bb-empty">…</p>
          <div v-for="(e, i) in events" :key="i" class="bb-event">
            <span class="bb-event-date">{{ eventDate(e.created_at) }}</span>
            <span class="bb-event-type">{{ t(eventKey(e.event_type)) }}</span>
            <span class="bb-event-tier">{{ t(tierKeyFor(e.tier)) }}</span>
            <span class="bb-event-source">{{ t(sourceKey(e.source)) }}</span>
          </div>
        </div>

        <div class="bb-actions">
          <button class="bb-btn primary" @click="goPricing">
            <i class="ti ti-crown"></i>{{ t('subs.upgrade') }}
          </button>
          <template v-if="canCancel">
            <div class="bb-cancel" v-if="!cancelOpen">
              <button class="bb-btn danger" @click="cancelOpen = true">
                <i class="ti ti-circle-x"></i>{{ t('subs.cancel_subscription') }}
              </button>
            </div>
            <div class="bb-cancel-confirm" v-else>
              <p>{{ t('subs.cancel_confirm', { plan: t(tierKey), date: renewDate }) }}</p>
              <div class="bb-cancel-confirm-actions">
                <button class="bb-btn" @click="cancelOpen = false">{{ t('common.cancel') }}</button>
                <button class="bb-btn danger" :disabled="canceling" @click="doCancel">
                  <i class="ti ti-check"></i>{{ t('subs.cancel_ok') }}
                </button>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { state } from '../store'
import * as store from '../store'
import { useI18n } from '../i18n'
import { loadBillingEvents } from '../services/supabase'

const { t, lang } = useI18n()

const events = ref([])
const loadingHistory = ref(false)
const cancelOpen = ref(false)
const canceling = ref(false)

const TIER_KEYS = { free: 'subs.free', individual: 'subs.individual', coop: 'subs.coop' }
const PRICE_KEYS = { free: 'subs.free_price', individual: 'subs.individual_price', coop: 'subs.coop_price' }
const STATUS_KEYS = {
  active: 'subs.status_active',
  trialing: 'subs.status_trialing',
  past_due: 'subs.status_past_due',
  canceled: 'subs.status_canceled',
}
const EVENT_KEYS = {
  grant: 'subs.event_grant',
  renewal: 'subs.event_renewal',
  downgrade: 'subs.event_downgrade',
  cancel: 'subs.event_cancel',
  payment_received: 'subs.event_payment_received',
  payment_failed: 'subs.event_payment_failed',
}

const tierKey = computed(() => TIER_KEYS[state.subscription.tier] || 'subs.free')
const priceKey = computed(() => PRICE_KEYS[state.subscription.tier] || 'subs.free_price')
const statusKey = computed(() => STATUS_KEYS[state.subscription.status] || 'subs.status_active')
const totalHectares = computed(() => store.getTotalFieldHectares())
const aoiPct = computed(() => pct(state.aois.length, state.subscription.maxAois))
const hectarePct = computed(() => pct(totalHectares.value, state.subscription.maxHectares))
const canCancel = computed(() =>
  !!state.supabaseUser && state.subscription.tier !== 'free' && state.subscription.status !== 'canceled'
)
const renewDate = computed(() =>
  state.subscription.renewsAt ? store.formatDateLong(state.subscription.renewsAt, lang.value) : '—'
)

function pct(used, max) {
  if (!max) return 0
  return Math.max(0, Math.min(100, Math.round((used / max) * 100)))
}

function tierKeyFor(tier) {
  return TIER_KEYS[tier] || 'subs.free'
}
function eventKey(type) {
  return EVENT_KEYS[type] || type
}
function sourceKey(source) {
  return source === 'aba_payway' ? 'subs.paid_aba' : 'subs.granted_manually'
}
function eventDate(iso) {
  return store.formatDateLong(iso, lang.value) || '—'
}

function goPricing() {
  store.closePlanBillingModal()
  store.goToPricing()
}

async function loadHistory() {
  if (!state.supabaseUser) return
  loadingHistory.value = true
  try {
    events.value = await loadBillingEvents()
  } catch (e) {
    events.value = []
  } finally {
    loadingHistory.value = false
  }
}

async function doCancel() {
  canceling.value = true
  try {
    await store.cancelMySubscription()
    cancelOpen.value = false
    store.showToast(t('subs.cancel_done', { plan: t(tierKey.value), date: renewDate.value }))
  } catch (e) {
    store.showToast(t('subs.cancel_failed') + (e.message ? ': ' + e.message : ''))
  } finally {
    canceling.value = false
  }
}

watch(() => state.settingsVisible, (open) => {
  if (open) {
    cancelOpen.value = false
    store.refreshPlanState()
    loadHistory()
  }
})
</script>

<style scoped>
.bb-modal {
  background: var(--panel-2);
  border: 0.5px solid var(--panel-border-strong);
  color: var(--text);
}
.bb-settings {
  width: 92%;
  max-width: 560px;
  max-height: 86vh;
  overflow-y: auto;
}
.bb-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem 0.6rem;
  border-bottom: 0.5px solid var(--panel-border);
}
.bb-header h3 {
  margin: 0;
  font-size: 1.05rem;
  color: var(--text);
}
.bb-close {
  background: transparent;
  border: none;
  color: var(--text-dim);
  font-size: 1.15rem;
  cursor: pointer;
  padding: 4px;
}
.bb-close:hover {
  color: var(--text);
}
.bb-body {
  padding: 1rem 1.25rem 1.25rem;
}
.bb-label {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-faint);
  margin-bottom: 6px;
}
.bb-plan-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.bb-plan-name {
  font-size: 1.25rem;
  font-weight: 700;
}
.bb-plan-price {
  color: var(--accent);
  font-weight: 700;
  font-size: 0.9rem;
  margin-top: 2px;
}
.bb-status-pill {
  font-size: 0.75rem;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--accent-dim);
  color: var(--accent);
}
.bb-status-pill.status-canceled {
  background: var(--red-dim);
  color: var(--red);
}
.bb-status-pill.status-past_due {
  background: var(--amber-dim);
  color: var(--amber);
}
.bb-row.bb-renew {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  font-size: 0.85rem;
  color: var(--text-dim);
}
.bb-source-note {
  margin-top: 10px;
  font-size: 0.78rem;
  color: var(--amber);
  background: var(--amber-dim);
  border-radius: var(--radius-sm);
  padding: 6px 10px;
}
.bb-usage {
  margin: 8px 0 16px;
}
.bb-usage-line {
  display: flex;
  justify-content: space-between;
  font-size: 0.82rem;
  color: var(--text-dim);
  margin: 8px 0 4px;
}
.bb-usage-pct {
  color: var(--text-faint);
  font-family: ui-monospace, monospace;
}
.bb-bar {
  height: 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}
.bb-bar-fill {
  height: 100%;
  background: var(--accent);
  border-radius: 999px;
  transition: width 0.3s ease;
}
.bb-section-label {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-faint);
  margin-bottom: 6px;
}
.bb-history {
  border: 0.5px solid var(--panel-border);
  border-radius: var(--radius-md);
  padding: 6px 12px;
  max-height: 180px;
  overflow-y: auto;
}
.bb-empty {
  color: var(--text-faint);
  font-size: 0.82rem;
  margin: 8px 0;
}
.bb-event {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 6px 0;
  border-bottom: 0.5px solid var(--panel-border);
  font-size: 0.8rem;
}
.bb-event:last-child {
  border-bottom: none;
}
.bb-event-date {
  color: var(--text-dim);
  white-space: nowrap;
}
.bb-event-type {
  color: var(--text);
  font-weight: 600;
}
.bb-event-tier {
  color: var(--accent);
  background: var(--accent-dim);
  border-radius: 999px;
  padding: 1px 8px;
  font-size: 0.72rem;
}
.bb-event-source {
  color: var(--text-faint);
  margin-left: auto;
  text-align: right;
}
.bb-actions {
  margin-top: 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.bb-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 14px;
  border-radius: var(--radius-md);
  border: 0.5px solid var(--panel-border-strong);
  background: rgba(255, 255, 255, 0.06);
  color: var(--text);
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
  transition: background 0.15s;
}
.bb-btn:hover:not([disabled]) {
  background: rgba(255, 255, 255, 0.12);
}
.bb-btn.primary {
  background: var(--accent);
  color: #0b0f14;
  border-color: transparent;
}
.bb-btn.primary:hover:not([disabled]) {
  background: #1bb37d;
}
.bb-btn.danger {
  background: var(--red-dim);
  color: var(--red);
  border-color: rgba(239, 91, 91, 0.35);
}
.bb-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.bb-cancel-confirm {
  background: var(--red-dim);
  border: 0.5px solid rgba(239, 91, 91, 0.35);
  border-radius: var(--radius-md);
  padding: 12px;
}
.bb-cancel-confirm p {
  margin: 0 0 10px;
  font-size: 0.85rem;
  color: var(--text);
}
.bb-cancel-confirm-actions {
  display: flex;
  gap: 8px;
}
</style>