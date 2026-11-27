import test from 'node:test'
import assert from 'node:assert/strict'
import {
  RICE_GROWTH_STAGES as CLIENT_RICE,
  GENERIC_GROWTH_STAGES as CLIENT_GENERIC,
} from '../src/data/stages.js'
import {
  RICE_GROWTH_STAGES as SERVER_RICE,
  GENERIC_GROWTH_STAGES as SERVER_GENERIC,
  stageForDay,
} from '../supabase/functions/_shared/growthStage.ts'
import { seasonPhase, seasonNudge } from '../src/services/season.js'
import { seasonPhase as serverSeasonPhase } from '../supabase/functions/_shared/season.ts'

const normalize = (table) =>
  table.map((s) => ({
    name: s.stage || s.name,
    maxDay: s.maxDay,
    min: s.min,
    max: s.max,
  }))

const clientStageForDay = (day, useGeneric = false) => {
  const table = useGeneric ? CLIENT_GENERIC : CLIENT_RICE
  return table.find((s) => day <= s.maxDay) || table[table.length - 1]
}

test('client and server rice tables are identical', () => {
  assert.deepEqual(normalize(CLIENT_RICE), SERVER_RICE)
})

test('client and server generic tables are identical', () => {
  assert.deepEqual(normalize(CLIENT_GENERIC), SERVER_GENERIC)
})

test('stageForDay matches the client table for days 0–200 (rice)', () => {
  for (let day = 0; day <= 200; day++) {
    const client = clientStageForDay(day)
    const server = stageForDay(day)
    assert.equal(server.name, client.stage, `day ${day}`)
    assert.equal(server.min, client.min, `day ${day} min`)
    assert.equal(server.max, client.max, `day ${day} max`)
  }
})

test('stageForDay matches the client table for days 0–200 (generic)', () => {
  for (let day = 0; day <= 200; day++) {
    const client = clientStageForDay(day, true)
    const server = stageForDay(day, true)
    assert.equal(server.name, client.stage, `day ${day}`)
    assert.equal(server.min, client.min, `day ${day} min`)
    assert.equal(server.max, client.max, `day ${day} max`)
  }
})

test('season mapping covers every rice and generic stage, client and server', () => {
  const expected = {
    Transplanting: 'establishment',
    Tillering: 'vegetative',
    'Stem Elongation / Booting': 'reproductive',
    'Flowering / Heading': 'reproductive',
    'Grain Filling / Maturity': 'grainfill',
    'Harvest / Senescence': 'maturity',
    Vegetative: 'vegetative',
    'Flowering / Fruiting': 'reproductive',
    Mature: 'maturity',
  }
  for (const [stage, phase] of Object.entries(expected)) {
    assert.equal(seasonPhase(stage), phase, `client ${stage}`)
    assert.equal(serverSeasonPhase(stage), phase, `server ${stage}`)
  }
})

test('season nudge selects rice vs generic wording for the new stage names', () => {
  assert.equal(
    seasonNudge({ stage: 'Tillering', cropEnglish: 'rice' }).tipKey,
    'season.tip_vegetative_rice',
  )
  assert.equal(
    seasonNudge({ stage: 'Tillering', cropEnglish: 'maize' }).tipKey,
    'season.tip_vegetative_generic',
  )
  assert.equal(
    seasonNudge({ stage: 'Harvest / Senescence', cropEnglish: 'rice' }).tipKey,
    'season.tip_maturity_rice',
  )
})
