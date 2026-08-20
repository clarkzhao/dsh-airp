import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { HostRuntime } from '../src/host/runtime.ts'
import { loadPack } from '../src/pack/pack.ts'

const packDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'packs', 'lotm-tingen')

async function runtime() {
  const loaded = await loadPack(packDir)
  assert.equal(loaded.ok, true, JSON.stringify(loaded.diagnostics))
  return new HostRuntime({ canon: loaded.canon!, sessionId: 's1', seed: 'seed-tingen' })
}

test('retry rolls state back to before last check; old line stays', async () => {
  const rt = await runtime()
  const before = structuredClone(rt.snapshot().state)
  const fought = rt.dispatch({ kind: 'tool', name: 'check_propose', args: {
    checkId: 'contest-sequence',
    actors: { attacker: 'klein', defender: 'opponent' },
  }, u: 0.81 })
  assert.equal(fought.ok, true)
  assert.ok((rt.snapshot().state.characters.klein?.lose_control ?? 0) > (before.characters.klein?.lose_control ?? 0))
  const oldLine = rt.snapshot()

  const retried = rt.dispatch({ kind: 'command', name: 'retry' })
  assert.equal(retried.ok, true)
  assert.equal(retried.forkedFrom, 's1')
  assert.equal(rt.snapshot().state.characters.klein?.lose_control, before.characters.klein?.lose_control)
  assert.ok((oldLine.state.characters.klein?.lose_control ?? 0) > (before.characters.klein?.lose_control ?? 0))
})

test('new session reloads canon so YAML edits apply', async () => {
  const loaded = await loadPack(packDir)
  const aCanon = structuredClone(loaded.canon!)
  const bCanon = structuredClone(loaded.canon!)
  const a = new HostRuntime({ canon: aCanon, sessionId: 'a', seed: 's' })
  bCanon.checks['contest-sequence']!.formula = 'p = 0.99'
  const b = new HostRuntime({ canon: bCanon, sessionId: 'b', seed: 's' })
  const ra = a.dispatch({ kind: 'tool', name: 'check_propose', args: {
    checkId: 'contest-sequence', actors: { attacker: 'klein', defender: 'opponent' },
  }, u: 0.5 })
  const rb = b.dispatch({ kind: 'tool', name: 'check_propose', args: {
    checkId: 'contest-sequence', actors: { attacker: 'klein', defender: 'opponent' },
  }, u: 0.5 })
  assert.equal(ra.ok && rb.ok, true)
  if (!ra.result.ok || !rb.result.ok) return
  if (ra.result.receipt.kind !== 'check' || rb.result.receipt.kind !== 'check') return
  assert.notEqual(ra.result.receipt.p, rb.result.receipt.p)
  assert.ok(rb.result.receipt.p > 0.9)
  assert.ok(ra.result.receipt.p < rb.result.receipt.p)
})

test('ic tags force check before the model proposes', async () => {
  const rt = await runtime()
  const out = rt.dispatch({
    kind: 'ic',
    tags: ['contest'],
    actors: { attacker: 'klein', defender: 'opponent' },
    u: 0.81,
  })
  assert.equal(out.forced, true)
  assert.equal(out.result.ok, true)
  assert.equal(out.result.events[0]?.type, 'check')
})

test('play role cannot pack_validate; author can', async () => {
  const play = await runtime()
  const denied = play.dispatch({ kind: 'tool', name: 'pack_validate', args: {}, role: 'play' })
  assert.equal(denied.ok, false)
  const author = new HostRuntime({ canon: play.canon, sessionId: 'auth', seed: 's', role: 'author' })
  const ok = author.dispatch({ kind: 'tool', name: 'pack_validate', args: {}, role: 'author' })
  assert.equal(ok.ok, true)
})

test('live brief does not grow facts.scene from a rejected clone', async () => {
  const rt = await runtime()
  const blocked = rt.dispatch({
    kind: 'tool',
    name: 'state_propose_fact',
    args: { pointer: 'facts.scene', value: 'elsewhere' },
  })
  assert.equal(blocked.ok, false)
  assert.match(blocked.text, /CHANNEL_VIOLATION/)
  assert.equal(rt.snapshot().state.facts.scene, undefined)
  assert.doesNotMatch(rt.indexText(), /facts\.scene=/)
})

test('events are the source of truth for retry', async () => {
  const rt = await runtime()
  rt.dispatch({ kind: 'tool', name: 'state_propose_fact', args: { pointer: 'facts.weather', value: '雨' } })
  rt.dispatch({ kind: 'tool', name: 'check_propose', args: {
    checkId: 'contest-sequence', actors: { attacker: 'klein', defender: 'opponent' },
  }, u: 0.81 })
  assert.equal(rt.events().filter((e) => e.type === 'check').length, 1)
  rt.dispatch({ kind: 'command', name: 'retry' })
  assert.equal(rt.events().some((e) => e.type === 'check'), false)
  assert.equal(rt.snapshot().state.facts.weather, '雨')
})
