import test from 'node:test'
import assert from 'node:assert/strict'
import { calcTrendChange } from '../src/services/trend.js'

const p = (date, value, cloudPct = 0) => ({ date, value, cloudPct })

test('gap of 3 days is rejected', () => {
  assert.equal(calcTrendChange([p('2026-11-15', 0.7), p('2026-11-18', 0.71)]), null)
})

test('gap of 85 days is rejected', () => {
  assert.equal(calcTrendChange([p('2026-08-25', 0.444), p('2026-11-18', 0.711)]), null)
})

test('exactly 14 days is accepted', () => {
  const r = calcTrendChange([p('2026-11-04', 0.5), p('2026-11-18', 0.6)])
  assert.ok(r)
  assert.equal(r.gapDays, 14)
  assert.equal(r.comparedFrom, '2026-11-04')
  assert.equal(r.comparedTo, '2026-11-18')
  assert.equal(Number(r.pct.toFixed(1)), 20)
})

test('empty/null series returns null', () => {
  assert.equal(calcTrendChange([]), null)
  assert.equal(calcTrendChange(null), null)
  assert.equal(calcTrendChange(undefined), null)
})

test('zero baseline returns null (no divide by zero)', () => {
  assert.equal(calcTrendChange([p('2026-11-04', 0), p('2026-11-18', 0.6)]), null)
})

test('zero latest value is a valid -100% change', () => {
  const r = calcTrendChange([p('2026-11-04', 0.5), p('2026-11-18', 0)])
  assert.ok(r)
  assert.equal(Number(r.pct.toFixed(1)), -100)
})

test('gap bounds are inclusive at 10 and 24 days', () => {
  assert.ok(calcTrendChange([p('2026-11-08', 0.5), p('2026-11-18', 0.6)])) // 10
  assert.ok(calcTrendChange([p('2026-10-25', 0.5), p('2026-11-18', 0.6)])) // 24
  assert.equal(calcTrendChange([p('2026-11-09', 0.5), p('2026-11-18', 0.6)]), null) // 9
  assert.equal(calcTrendChange([p('2026-10-24', 0.5), p('2026-11-18', 0.6)]), null) // 25
})

test('the point closest to 14 days wins', () => {
  // 11-01 is 17 days back (|17-14|=3); 11-08 is 10 days back (|10-14|=4).
  const r = calcTrendChange([
    p('2026-11-01', 0.4),
    p('2026-11-08', 0.5),
    p('2026-11-18', 0.6),
  ])
  assert.ok(r)
  assert.equal(r.comparedFrom, '2026-11-01')
  assert.equal(r.gapDays, 17)
})

test('a cloud-blocked latest row is skipped', () => {
  // The 11-18 row is cloud-blocked, so 11-01 becomes the latest clean point.
  const r = calcTrendChange([
    p('2026-10-20', 0.4),
    p('2026-11-01', 0.5),
    p('2026-11-18', 0.9, 70),
  ])
  assert.ok(r)
  assert.equal(r.comparedTo, '2026-11-01')
  assert.equal(r.comparedFrom, '2026-10-20')
  assert.equal(r.gapDays, 12)
  assert.equal(Number(r.pct.toFixed(1)), 25)
})

test('a cloud-blocked candidate is skipped in favour of the next clean one', () => {
  // 11-04 (14 days) is blocked; 11-08 (10 days) is the closest clean point.
  const r = calcTrendChange([
    p('2026-11-04', 0.9, 80),
    p('2026-11-08', 0.5),
    p('2026-11-18', 0.6),
  ])
  assert.ok(r)
  assert.equal(r.comparedFrom, '2026-11-08')
  assert.equal(r.gapDays, 10)
})
