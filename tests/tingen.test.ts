import assert from 'node:assert/strict'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { WorldKernel } from '../src/kernel/world-kernel.ts'
import { initialState, loadPack } from '../src/pack/pack.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'packs', 'lotm-tingen')

test('lotm-tingen pack loads and S9 vs S8 fails at u=0.81', async () => {
  const loaded = await loadPack(root)
  assert.equal(loaded.ok, true, JSON.stringify(loaded.diagnostics))
  const kernel = new WorldKernel(loaded.canon!)
  const state = initialState(loaded.canon!, 'seed-tingen')
  assert.deepEqual(state.revealed.slice(0, 2), ['axioms', 'tingen'])
  assert.ok(state.present.includes('klein'))
  const result = kernel.turn(state, {
    type: 'check',
    checkId: 'contest-sequence',
    actors: { attacker: 'klein', defender: 'opponent' },
  }, { u: 0.81 })
  assert.equal(result.ok, true)
  if (!result.ok || result.receipt.kind !== 'check') return
  assert.ok(result.receipt.p < 0.5)
  assert.equal(result.receipt.outcome, 'failure')
  assert.ok((result.state.characters.klein?.lose_control ?? 0) > 0)
})
