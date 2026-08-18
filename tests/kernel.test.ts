import assert from 'node:assert/strict'
import { test } from 'node:test'
import { WorldKernel } from '../src/kernel/world-kernel.ts'
import type { Canon, CheckDef, WorldState } from '../src/kernel/types.ts'

function contestCheck(): CheckDef {
  return {
    id: 'contest-sequence',
    when: '两名非凡者直接对抗',
    kind: 'contest',
    condition: {
      all: [{ tag: 'contest' }, { present: ['$attacker', '$defender'] }],
    },
    inputs: {
      atk: 'characters.{attacker}.sequence',
      def: 'characters.{defender}.sequence',
      same_pathway: 'eq(characters.{attacker}.pathway, characters.{defender}.pathway)',
    },
    formula: `
      strength = atk - def
      p = sigmoid(-strength / 1.5)
      if same_pathway: p = clamp(p + 0.05)
    `,
    outcomes: {
      success: { apply: { 'facts.last_contest': 'attacker' } },
      failure: {
        apply: {
          'facts.last_contest': 'defender',
          'characters.{attacker}.lose_control': '+0.05',
        },
      },
    },
  }
}

function canon(over: Partial<Canon> = {}): Canon {
  return {
    meta: { id: 'lotm-tingen', title: '廷根切片', rng: 'bernoulli', entry_scene: 'tingen.blackthorn' },
    index: { checks: ['contest-sequence'], characters: ['klein', 'dunn', 'opponent'], lore: ['axioms'] },
    checks: { 'contest-sequence': contestCheck() },
    characters: {
      klein: { id: 'klein', name: '克莱恩·莫雷蒂', keys: ['克莱恩'], pathway: 'fool', sequence_declared: 9, body: '口吻。' },
      dunn: { id: 'dunn', name: '邓恩·史密斯', keys: ['邓恩'], pathway: 'sleepless', sequence_declared: 7, body: '值夜者。' },
      opponent: { id: 'opponent', name: '对手', keys: ['对手'], pathway: 'sleepless', sequence_declared: 8, body: '对手。' },
    },
    lore: { axioms: { key: 'axioms', body: '非凡特性不灭。聚合定律。非凡者隐秘。' } },
    guarded: [
      'characters.*.sequence',
      'characters.*.digest',
      'characters.*.lose_control',
      'facts.last_contest',
    ],
    ...over,
  }
}

function state(over: Partial<WorldState> = {}): WorldState {
  return {
    turn: 0,
    scene: 'tingen.blackthorn',
    rng_seed: 'seed-tingen',
    revealed: ['axioms', 'tingen'],
    present: ['klein', 'dunn', 'opponent'],
    characters: {
      klein: { pathway: 'fool', sequence: 9, digest: 0.2, lose_control: 0.1 },
      dunn: { pathway: 'sleepless', sequence: 7, digest: 1.0, lose_control: 0.0 },
      opponent: { pathway: 'sleepless', sequence: 8, digest: 0.4, lose_control: 0.0 },
    },
    facts: { weather: '雾', alarm: false },
    ...over,
  }
}

function kernel() {
  return new WorldKernel(canon())
}

test('S9 vs S8 with u=0.81 is failure, p<0.5, lose_control +0.05', () => {
  const k = kernel()
  const before = state()
  const result = k.turn(before, {
    type: 'check',
    checkId: 'contest-sequence',
    actors: { attacker: 'klein', defender: 'opponent' },
  }, { u: 0.81 })

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.events.length, 1)
  assert.equal(result.events[0]!.type, 'check')
  assert.equal(result.receipt.kind, 'check')
  if (result.receipt.kind !== 'check') return
  assert.ok(result.receipt.p < 0.5, `p should be <0.5, got ${result.receipt.p}`)
  assert.equal(result.receipt.outcome, 'failure')
  assert.equal(result.state.characters.klein!.lose_control, 0.15)
  assert.equal(result.state.facts.last_contest, 'defender')
  assert.equal(before.characters.klein!.lose_control, 0.1)
})

test('idle look produces no events and leaves state equal', () => {
  const k = kernel()
  const before = state()
  const result = k.turn(before, { type: 'look' })
  assert.equal(result.ok, true)
  assert.deepEqual(result.events, [])
  assert.deepEqual(result.state, before)
})

function travelCheck(): CheckDef {
  return {
    id: 'travel',
    kind: 'generic',
    inputs: {},
    formula: 'p = 1',
    outcomes: { success: { apply: { scene: 'pack.b' } } },
  }
}

test('pack without places still allows gm to rewrite scene', () => {
  const k = kernel()
  const result = k.turn(state(), { type: 'gm', patch: { scene: 'elsewhere' }, reason: 'test' })
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.state.scene, 'elsewhere')
})

test('places graph blocks a hop that needs mobility', () => {
  const k = new WorldKernel(canon({
    meta: {
      id: 'graph-pack',
      title: '图',
      rng: 'none',
      entry_scene: 'pack.a',
      places: {
        'pack.a': { edges: { 'pack.b': { beats: 4, need: 'mobility>=1' } } },
        'pack.b': { edges: {} },
      },
    },
    checks: { travel: travelCheck() },
    index: { checks: ['travel'], characters: ['klein'], lore: ['axioms'] },
  }))
  const start = state({ scene: 'pack.a', present: ['klein'], characters: { klein: { mobility: 0 } } })
  const blocked = k.turn(start, { type: 'check', checkId: 'travel', actors: { actor: 'klein' } })
  assert.equal(blocked.ok, false)
  if (blocked.ok) return
  assert.equal(blocked.code, 'TRAVEL_BLOCKED')
  assert.equal(blocked.state.scene, 'pack.a')
  const ready = state({ scene: 'pack.a', present: ['klein'], characters: { klein: { mobility: 1 } }, clock: { beat: 0 } })
  const ok = k.turn(ready, { type: 'check', checkId: 'travel', actors: { actor: 'klein' } })
  assert.equal(ok.ok, true)
  if (!ok.ok) return
  assert.equal(ok.state.scene, 'pack.b')
  assert.equal(ok.state.clock?.beat, 4)
})

test('fact targeting scene is CHANNEL_VIOLATION so oral teleport does not move you', () => {
  const k = kernel()
  const before = state()
  const result = k.turn(before, { type: 'fact', pointer: 'scene', value: 'elsewhere' })
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.code, 'CHANNEL_VIOLATION')
  assert.equal(result.state.scene, before.scene)
})

test('fact targeting lose_control is CHANNEL_VIOLATION and state unchanged', () => {
  const k = kernel()
  const before = state()
  const result = k.turn(before, { type: 'fact', pointer: 'characters.klein.lose_control', value: 0 })
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.code, 'CHANNEL_VIOLATION')
  assert.deepEqual(result.events, [])
  assert.equal(result.state.characters.klein!.lose_control, 0.1)
  assert.deepEqual(result.state, before)
})

test('match hits contest tags and turn(check) writes a check event without a model', () => {
  const k = kernel()
  const s = state()
  const forced = k.match(s, ['contest'], { attacker: 'klein', defender: 'opponent' })
  assert.equal(forced.length, 1)
  assert.equal(forced[0]!.checkId, 'contest-sequence')
  const result = k.turn(s, { type: 'check', checkId: forced[0]!.checkId, actors: forced[0]!.actors }, { u: 0.81 })
  assert.equal(result.ok, true)
  assert.equal(result.events[0]?.type, 'check')
})

test('gm without reason is MISSING_REASON', () => {
  const k = kernel()
  const result = k.turn(state(), { type: 'gm', patch: { 'facts.alarm': true }, reason: '' })
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.code, 'MISSING_REASON')
  assert.deepEqual(result.events, [])
})

test('same seed replays the same u and outcome', () => {
  const k = kernel()
  const intent = {
    type: 'check' as const,
    checkId: 'contest-sequence',
    actors: { attacker: 'klein', defender: 'opponent' },
  }
  const a = k.turn(state(), intent)
  const b = k.turn(state(), intent)
  assert.equal(a.ok, true)
  assert.equal(b.ok, true)
  if (!a.ok || !b.ok) return
  assert.equal(a.receipt.kind, 'check')
  assert.equal(b.receipt.kind, 'check')
  if (a.receipt.kind !== 'check' || b.receipt.kind !== 'check') return
  assert.equal(a.receipt.xi.u, b.receipt.xi.u)
  assert.equal(a.receipt.outcome, b.receipt.outcome)
})

test('weather fact is allowed and writes a fact event', () => {
  const k = kernel()
  const result = k.turn(state(), { type: 'fact', pointer: 'facts.weather', value: '雨' })
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.state.facts.weather, '雨')
  assert.equal(result.events[0]?.type, 'fact')
})

test('unknown check is UNKNOWN_CHECK', () => {
  const k = kernel()
  const result = k.turn(state(), { type: 'check', checkId: 'nope', actors: {} })
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.code, 'UNKNOWN_CHECK')
})

test('lore success does not mutate state or emit events', () => {
  const k = kernel()
  const before = state()
  const result = k.turn(before, { type: 'lore', key: 'axioms' })
  assert.equal(result.ok, true)
  assert.deepEqual(result.events, [])
  assert.deepEqual(result.state, before)
})

test('prior fact does not change next check u', () => {
  const k = kernel()
  const intent = {
    type: 'check' as const,
    checkId: 'contest-sequence',
    actors: { attacker: 'klein', defender: 'opponent' },
  }
  const direct = k.turn(state(), intent)
  const afterFact = k.turn(state(), { type: 'fact', pointer: 'facts.weather', value: '雨' })
  assert.equal(afterFact.ok, true)
  const thenCheck = k.turn(afterFact.state, intent)
  assert.equal(direct.ok && thenCheck.ok, true)
  if (!direct.ok || !thenCheck.ok) return
  if (direct.receipt.kind !== 'check' || thenCheck.receipt.kind !== 'check') return
  assert.equal(direct.receipt.xi.u, thenCheck.receipt.xi.u)
})

test('formula multiplication binds tighter than addition', () => {
  const k = new WorldKernel(canon({
    checks: {
      'contest-sequence': {
        ...contestCheck(),
        inputs: { insight: 'characters.klein.digest', candle: 'characters.klein.lose_control' },
        formula: 'p = 0.35 + insight * 0.25 + candle * 0.3',
      },
    },
  }))
  const result = k.turn(state(), {
    type: 'check',
    checkId: 'contest-sequence',
    actors: { attacker: 'klein', defender: 'opponent' },
  }, { u: 0.1 })
  assert.equal(result.ok, true)
  if (!result.ok || result.receipt.kind !== 'check') return
  assert.ok(Math.abs(result.receipt.p - (0.35 + 0.2 * 0.25 + 0.1 * 0.3)) < 1e-6)
})

test('lore over budget is BUDGET', () => {
  const k = new WorldKernel(canon({
    meta: { id: 'lotm-tingen', title: '廷根切片', loreBudgetChars: 8 },
    lore: { axioms: { key: 'axioms', body: '非凡特性不灭。聚合定律。非凡者隐秘。' } },
  }))
  const result = k.turn(state(), { type: 'lore', key: 'axioms' })
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.code, 'BUDGET')
})
