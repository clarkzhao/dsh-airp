import assert from 'node:assert/strict'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { HostRuntime } from '../src/host/runtime.ts'
import { WorldKernel } from '../src/kernel/world-kernel.ts'
import { initialState, loadPack } from '../src/pack/pack.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'packs', 'jzdh-dingjiang')

test('jzdh-dingjiang commission spine: fact, contest, cost, retry', async () => {
  const loaded = await loadPack(root)
  assert.equal(loaded.ok, true, JSON.stringify(loaded.diagnostics))
  const state = initialState(loaded.canon!, 'seed-jzdh')
  assert.equal(state.scene, 'jzdh.dangkang')
  assert.ok(state.present.includes('ding-songyan'))
  assert.ok(!state.present.includes('er-ren'))
  assert.ok(state.characters['er-ren'])
  assert.equal(state.characters['ding-songyan']?.grade, 0)
  assert.equal(state.characters['ding-songyan']?.insight, 0.4)

  const play = new HostRuntime({ canon: loaded.canon!, sessionId: 'jzdh', seed: 'seed-jzdh' })
  assert.match(play.bootBrief(), /失踪|张睿|委托/)

  const accept = play.dispatch({
    kind: 'tool',
    name: 'state_propose_fact',
    args: { pointer: 'facts.commission', value: 'accepted' },
  })
  assert.equal(accept.ok, true)

  const blocked = play.dispatch({
    kind: 'tool',
    name: 'state_propose_fact',
    args: { pointer: 'characters.ding-songyan.moth', value: 0 },
  })
  assert.equal(blocked.ok, false)

  const idleFight = play.dispatch({
    kind: 'ic',
    tags: ['contest'],
    actors: { attacker: 'ding-songyan' },
    u: 0.81,
  })
  assert.equal(idleFight.forced, false)
  assert.ok(!play.snapshot().state.present.includes('er-ren'))

  const contest = play.dispatch({
    kind: 'ic',
    tags: ['contest'],
    actors: { attacker: 'ding-songyan', defender: 'er-ren' },
    u: 0.81,
  })
  assert.equal(contest.forced, true)
  assert.equal(contest.result.events[0]?.type, 'check')
  assert.ok(play.snapshot().state.present.includes('er-ren'))

  const cost = play.dispatch({
    kind: 'tool',
    name: 'check_propose',
    args: { checkId: 'ruju-cost', actors: { actor: 'ding-songyan' } },
    u: 0.9,
  })
  assert.equal(cost.ok, true)

  const beforeRetry = play.snapshot()
  play.dispatch({ kind: 'command', name: 'retry', rawInput: 'contest-wushu' })
  assert.equal(play.snapshot().state.facts.commission, 'accepted')
  assert.ok((beforeRetry.state.characters['ding-songyan']?.cost ?? 0) >= 0)
})

test('powang check uses insight and candle, not sequence', async () => {
  const loaded = await loadPack(root)
  const kernel = new WorldKernel(loaded.canon!)
  const state = initialState(loaded.canon!, 'seed-jzdh')
  const result = kernel.turn(state, {
    type: 'check',
    checkId: 'powang-zhuozhao',
    actors: { actor: 'ding-songyan' },
  }, { u: 0.1 })
  assert.equal(result.ok, true)
  if (!result.ok || result.receipt.kind !== 'check') return
  assert.ok(result.receipt.p > 0.3)
  assert.equal(result.receipt.outcome, 'success')
  assert.equal(result.state.facts.revealed_truth, true)
})
