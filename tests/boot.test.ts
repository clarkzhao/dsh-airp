import assert from 'node:assert/strict'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { BUNDLED_TINGEN, PICK_CUSTOM, bootQuestion, openRuntime, resolveBootChoice } from '../src/host/boot.ts'

const packsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'packs')

test('boot card offers bundled tingen and a custom path slot', () => {
  const q = bootQuestion(['lotm-tingen'])
  const labels = q.questions[0]!.options.map((o) => o.label)
  assert.ok(labels.includes(BUNDLED_TINGEN))
  assert.ok(labels.includes(PICK_CUSTOM))
})

test('selecting bundled tingen opens a runtime with commission brief', async () => {
  const choice = resolveBootChoice({ answers: [{ id: 'boot_pack', selected: [BUNDLED_TINGEN] }] }, packsDir)
  assert.deepEqual(choice, { kind: 'bundled', packId: 'lotm-tingen' })
  const rt = await openRuntime({ packsDir, sessionId: 'boot-1', choice })
  const brief = rt.bootBrief()
  assert.match(brief, /lotm-tingen/)
  assert.match(brief, /commission|委托|黑荆棘/)
  assert.match(brief, /禁止再问引擎在哪/)
})

test('custom path loads that directory', async () => {
  const choice = resolveBootChoice({
    answers: [{ id: 'boot_pack', selected: [PICK_CUSTOM], custom: join(packsDir, 'lotm-tingen') }],
  }, packsDir)
  assert.equal(choice.kind, 'custom')
  if (choice.kind !== 'custom') return
  const rt = await openRuntime({ packsDir, sessionId: 'boot-2', choice })
  assert.equal(rt.canon.meta.id, 'lotm-tingen')
})

test('pick-custom without a path asks again', () => {
  const choice = resolveBootChoice({ answers: [{ id: 'boot_pack', selected: [PICK_CUSTOM] }] }, packsDir)
  assert.equal(choice.kind, 'need-path')
})
