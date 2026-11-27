import test from 'node:test'
import assert from 'node:assert/strict'
import {
  harvestDateOf,
  isHarvestedOn,
  isHarvestedNow,
  isHarvestedForMonth,
} from '../src/services/harvest.js'

test('harvestDateOf normalizes/null', () => {
  assert.equal(harvestDateOf({ harvestDate: '2026-11-27' }), '2026-11-27')
  assert.equal(harvestDateOf({ harvestDate: null }), null)
  assert.equal(harvestDateOf(null), null)
})

test('isHarvestedOn is true on or after the harvest date only', () => {
  const field = { harvestDate: '2026-11-27' }
  assert.equal(isHarvestedOn(field, '2026-11-26'), false)
  assert.equal(isHarvestedOn(field, '2026-11-27'), true)
  assert.equal(isHarvestedOn(field, '2026-11-28'), true)
  assert.equal(isHarvestedOn({}, '2026-11-28'), false)
  assert.equal(isHarvestedOn(field, null), false)
})

test('isHarvestedNow uses today (past = true, future = false)', () => {
  assert.equal(isHarvestedNow({ harvestDate: '2000-01-01' }), true)
  assert.equal(isHarvestedNow({ harvestDate: '2999-01-01' }), false)
  assert.equal(isHarvestedNow({}), false)
})

test('isHarvestedForMonth keeps earlier months visible', () => {
  const field = { harvestDate: '2000-11-27' } // safely in the past
  assert.equal(isHarvestedForMonth(field, { year: 2000, month: 10 }), false)
  assert.equal(isHarvestedForMonth(field, { year: 2000, month: 11 }), true)
  assert.equal(isHarvestedForMonth(field, { year: 2000, month: 12 }), true)
  assert.equal(isHarvestedForMonth(field, { year: 2001, month: 1 }), true)
})

test('a future planned harvest does not mark the field harvested yet', () => {
  const field = { harvestDate: '2999-11-27' }
  assert.equal(isHarvestedNow(field), false)
  assert.equal(isHarvestedForMonth(field, { year: 2999, month: 11 }), false)
})

test('missing month falls back to "harvested now" once the date passed', () => {
  assert.equal(isHarvestedForMonth({ harvestDate: '2000-11-27' }, null), true)
  assert.equal(isHarvestedForMonth({}, null), false)
})
