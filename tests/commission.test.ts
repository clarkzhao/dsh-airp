import assert from 'node:assert/strict'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { HostRuntime } from '../src/host/runtime.ts'
import { loadPack } from '../src/pack/pack.ts'

const packDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'packs', 'lotm-tingen')

test('commission spine: fact investigate, contest, digest, retry restores pre-contest', async () => {
  const loaded = await loadPack(packDir)
  assert.equal(loaded.ok, true, JSON.stringify(loaded.diagnostics))
  assert.ok(loaded.canon?.lore.commission)

  const play = new HostRuntime({ canon: loaded.canon!, sessionId: 'play', seed: 'seed-tingen', role: 'play' })

  const walk = play.dispatch({ kind: 'command', name: 'look' })
  assert.equal(walk.result.events.length, 0)

  const accept = play.dispatch({
    kind: 'tool',
    name: 'state_propose_fact',
    args: { pointer: 'facts.commission', value: 'accepted' },
  })
  assert.equal(accept.ok, true)
  assert.equal(play.snapshot().state.facts.commission, 'accepted')
  const seqBefore = play.snapshot().state.characters.klein!.sequence

  const fakePromote = play.dispatch({
    kind: 'tool',
    name: 'state_propose_fact',
    args: { pointer: 'characters.klein.sequence', value: 8 },
  })
  assert.equal(fakePromote.ok, false)
  assert.equal(play.snapshot().state.characters.klein!.sequence, seqBefore)

  const contest = play.dispatch({
    kind: 'ic',
    tags: ['contest'],
    actors: { attacker: 'klein', defender: 'opponent' },
    u: 0.81,
  })
  assert.equal(contest.forced, true)
  assert.equal(contest.result.events[0]?.type, 'check')
  const afterContest = play.snapshot()
  assert.ok((afterContest.state.characters.klein?.lose_control ?? 0) > 0)

  const digest = play.dispatch({
    kind: 'tool',
    name: 'check_propose',
    args: { checkId: 'digest-acting', actors: { actor: 'klein' } },
    u: 0.1,
  })
  assert.equal(digest.ok, true)

  const oldLine = play.snapshot()
  const retried = play.dispatch({ kind: 'command', name: 'retry', rawInput: 'contest-sequence' })
  assert.equal(retried.ok, true)
  assert.equal(retried.forkedFrom, 'play')
  assert.equal(play.snapshot().state.facts.commission, 'accepted')
  assert.equal(play.snapshot().state.characters.klein?.lose_control, 0)
  assert.ok((oldLine.state.characters.klein?.lose_control ?? 0) > 0)

  const authorCanon = structuredClone(loaded.canon!)
  authorCanon.checks['contest-sequence']!.formula = 'p = 0.01'
  const { isError, validatePack } = await import('../src/pack/pack.ts')
  const diags = validatePack(authorCanon)
  assert.equal(diags.filter(isError).length, 0)
  const fresh = new HostRuntime({ canon: authorCanon, sessionId: 'play-2', seed: 'seed-tingen', role: 'play' })
  const again = fresh.dispatch({
    kind: 'tool',
    name: 'check_propose',
    args: { checkId: 'contest-sequence', actors: { attacker: 'klein', defender: 'opponent' } },
    u: 0.5,
  })
  assert.equal(again.ok, true)
  if (again.result.ok && again.result.receipt.kind === 'check') {
    assert.equal(again.result.receipt.p, 0.01)
  }
})
