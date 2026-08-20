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
  // opening.present is only the host; the rest are roster (staged on IC mention)
  assert.ok(!state.present.includes('xu-changan'))
  assert.ok(state.characters['xu-changan'])
  assert.ok(!state.present.includes('zheng-zhuxi'))
  assert.ok(state.characters['zheng-zhuxi'])
  assert.equal(state.characters['ding-songyan']?.grade, 0)
  assert.equal(state.characters['ding-songyan']?.insight, 0.4)

  const play = new HostRuntime({ canon: loaded.canon!, sessionId: 'jzdh', seed: 'seed-jzdh' })
  const brief = play.bootBrief()
  assert.match(brief, /失踪|张睿|委托/)
  assert.match(brief, /当康庙/)
  assert.match(brief, /powang|破妄/)

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

  // Lone present must not invent a defender. Contest IC without a named
  // opponent is not a check; roster moths stay off-stage.
  const idleFight = play.dispatch({
    kind: 'ic',
    tags: ['contest'],
    actors: { attacker: 'ding-songyan' },
    u: 0.81,
  })
  assert.equal(idleFight.forced, false)
  assert.ok(!play.snapshot().state.present.includes('er-ren'))

  // ding vs moth: p≈0.004, so u=0.81 lands on failure → the moth stays on stage
  const contest = play.dispatch({
    kind: 'ic',
    tags: ['contest'],
    actors: { attacker: 'ding-songyan', defender: 'er-ren' },
    u: 0.81,
  })
  assert.equal(contest.forced, true)
  assert.equal(contest.result.events[0]?.type, 'check')
  if (contest.result.events[0]?.type === 'check') {
    assert.equal(contest.result.events[0].outcome, 'failure')
  }
  assert.ok(play.snapshot().state.present.includes('er-ren'))
  assert.ok(play.snapshot().state.present.includes('ding-songyan'))

  // u=0 below p → success → the defeated moth is removed from stage
  const win = play.dispatch({
    kind: 'ic',
    tags: ['contest'],
    actors: { attacker: 'ding-songyan', defender: 'er-ren' },
    u: 0,
  })
  assert.equal(win.forced, true)
  assert.equal(win.result.events[0]?.type, 'check')
  if (win.result.events[0]?.type === 'check') {
    assert.equal(win.result.events[0].outcome, 'success')
  }
  assert.ok(!play.snapshot().state.present.includes('er-ren'))
  assert.ok(play.snapshot().state.present.includes('ding-songyan'))

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

test('check_propose cannot smuggle present through the extra patch', async () => {
  const loaded = await loadPack(root)
  const play = new HostRuntime({ canon: loaded.canon!, sessionId: 'jzdh-guard', seed: 'seed-jzdh' })
  play.dispatch({
    kind: 'ic',
    tags: ['contest'],
    actors: { attacker: 'ding-songyan', defender: 'er-ren' },
    u: 0.81,
  })
  const before = play.snapshot().state.present
  assert.ok(before.includes('er-ren'))
  const res = play.dispatch({
    kind: 'tool',
    name: 'check_propose',
    args: {
      checkId: 'contest-wushu',
      actors: { attacker: 'ding-songyan', defender: 'er-ren' },
      patch: { present: '-ding-songyan' },
    },
  })
  assert.equal(res.ok, false)
  assert.match(res.text, /EXTRA_GUARDED/)
  assert.deepEqual(play.snapshot().state.present, before)
  const descendant = play.dispatch({
    kind: 'tool',
    name: 'check_propose',
    args: {
      checkId: 'contest-wushu',
      actors: { attacker: 'ding-songyan', defender: 'er-ren' },
      patch: { 'present.0': '-ding-songyan' },
    },
  })
  assert.equal(descendant.ok, false)
  assert.match(descendant.text, /EXTRA_GUARDED/)
  assert.deepEqual(play.snapshot().state.present, before)
})

test('dingjiang places allow temple to graveyard and block a hop with no edge', async () => {
  const loaded = await loadPack(root)
  const play = new HostRuntime({ canon: loaded.canon!, sessionId: 'jzdh-walk', seed: 'seed-jzdh' })
  const walk = play.dispatch({
    kind: 'tool',
    name: 'check_propose',
    args: { checkId: 'travel-on-foot', actors: { actor: 'ding-songyan' }, patch: { scene: 'jzdh.luanzanggang' } },
  })
  assert.equal(walk.ok, true, walk.text)
  assert.equal(play.snapshot().state.scene, 'jzdh.luanzanggang')
  assert.equal(play.snapshot().state.clock?.beat, 2)
  const fly = play.dispatch({
    kind: 'tool',
    name: 'check_propose',
    args: { checkId: 'travel-on-foot', actors: { actor: 'ding-songyan' }, patch: { scene: 'jzdh.yankjing' } },
  })
  assert.equal(fly.ok, false)
  assert.match(fly.text, /TRAVEL_BLOCKED|no edge/)
  assert.equal(play.snapshot().state.scene, 'jzdh.luanzanggang')
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
