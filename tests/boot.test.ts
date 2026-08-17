import assert from 'node:assert/strict'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { BUNDLED_TINGEN, PICK_CUSTOM, bootQuestion, looksLikePackPath, openRuntime, pathQuestion, resolveBootChoice, resolvePathAnswer, shouldBootStory } from '../src/host/boot.ts'

const packsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'packs')

test('boot card offers bundled tingen and a custom path slot', () => {
  const q = bootQuestion(['lotm-tingen'])
  const labels = q.questions[0]!.options!.map((o) => o.label)
  assert.ok(labels.includes(BUNDLED_TINGEN))
  assert.ok(labels.includes(PICK_CUSTOM))
})

test('only a fresh airp-play session boots the story', () => {
  assert.equal(shouldBootStory({ presetId: 'airp-play', source: 'startup' }), true)
  assert.equal(shouldBootStory({ presetId: 'airp-play', source: 'resume' }), false)
  assert.equal(shouldBootStory({ presetId: 'airp-author', source: 'startup' }), false)
  assert.equal(shouldBootStory({ presetId: 'cordis', source: 'startup' }), false)
  assert.equal(shouldBootStory({ presetId: undefined, source: 'startup' }), false)
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

test('typed path on the first card wins even if a bundled option is also listed', () => {
  const choice = resolveBootChoice({
    answers: [{ id: 'boot_pack', selected: [BUNDLED_TINGEN], custom: '/tmp/my-pack' }],
  })
  assert.deepEqual(choice, { kind: 'custom', path: '/tmp/my-pack' })
})

test('selected absolute path without custom field still counts as custom', () => {
  const choice = resolveBootChoice({
    answers: [{ id: 'boot_pack', selected: ['/Users/clark/Worlds/mine'] }],
  })
  assert.deepEqual(choice, { kind: 'custom', path: '/Users/clark/Worlds/mine' })
  assert.equal(looksLikePackPath('/Users/clark/Worlds/mine'), true)
})

test('pick-custom without a path asks again and does not fall back to tingen', () => {
  const choice = resolveBootChoice({ answers: [{ id: 'boot_pack', selected: [PICK_CUSTOM] }] })
  assert.equal(choice.kind, 'need-path')
  const pathCard = pathQuestion('没有读到路径')
  assert.equal(pathCard.questions[0]!.options, undefined)
  assert.equal(resolvePathAnswer({ answers: [{ id: 'boot_path', selected: [] }] }).kind, 'need-path')
  assert.deepEqual(
    resolvePathAnswer({ answers: [{ id: 'boot_path', custom: '/tmp/other-pack' }] }),
    { kind: 'custom', path: '/tmp/other-pack' },
  )
})
