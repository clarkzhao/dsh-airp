import assert from 'node:assert/strict'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { BUNDLED_JZDH, BUNDLED_TINGEN, PICK_CUSTOM, PICK_NEW_PACK, bootQuestion, bootQuestionFromRefs, isAskCancelled, looksLikePackPath, openRuntime, pathQuestion, presetFromSession, resolveBootChoice, resolvePathAnswer, sessionIsBlank, shouldBootStory } from '../src/host/boot.ts'

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
  assert.equal(shouldBootStory({ presetId: 'airp-author', source: 'startup' }), true)
  assert.equal(shouldBootStory({ presetId: 'cordis', source: 'startup' }), false)
  assert.equal(shouldBootStory({ presetId: undefined, source: 'startup' }), false)
  assert.equal(shouldBootStory({ presetId: 'airp-play', blank: false }), false)
  assert.equal(shouldBootStory({ presetId: 'airp-play', alreadyBooted: true }), false)
})

test('cancelling the pack picker is not a fatal error', () => {
  assert.equal(isAskCancelled({ code: 'ASK_CANCELLED', message: 'the user cancelled ask_user_question' }), true)
  assert.equal(isAskCancelled({ code: 'ASK_ABORTED', message: 'ask_user_question was aborted before the user answered' }), true)
  assert.equal(isAskCancelled(new Error('unable to load pack')), false)
})

test('switching to airp-play while the session is still blank should boot', () => {
  assert.equal(shouldBootStory({ presetId: 'airp-play', source: 'startup', blank: true }), true)
  assert.equal(sessionIsBlank({ events: [{ type: 'agent-preset/selected' }] }), true)
  assert.equal(sessionIsBlank({ events: [{ type: 'turn/start' }] }), false)
  assert.equal(presetFromSession({
    header: { agentPreset: 'standard' },
    events: [{ type: 'agent-preset/selected', data: { agentPreset: 'airp-play' } }],
  }), 'airp-play')
})

test('selecting bundled tingen opens a runtime with commission brief', async () => {
  const choice = resolveBootChoice({ answers: [{ id: 'boot_pack', selected: [BUNDLED_TINGEN] }] })
  assert.deepEqual(choice, { kind: 'bundled', packId: 'lotm-tingen' })
  const rt = await openRuntime({ packsDir, sessionId: 'boot-1', choice })
  const brief = rt.bootBrief()
  assert.match(brief, /lotm-tingen/)
  assert.match(brief, /commission|委托|黑荆棘/)
  assert.match(brief, /禁止再问引擎在哪/)
  assert.match(brief, /鉴定词/)
})

test('dingjiang boot brief uses temple scene lore and pack tags', async () => {
  const rt = await openRuntime({
    packsDir,
    sessionId: 'boot-jzdh',
    choice: { kind: 'bundled', packId: 'jzdh-dingjiang' },
  })
  const brief = rt.bootBrief()
  assert.match(brief, /jzdh-dingjiang|定江/)
  assert.match(brief, /当康庙|说书/)
  assert.match(brief, /powang|破妄/)
  assert.match(brief, /commission: pending|commission=pending/)
  assert.doesNotMatch(brief, /黑荆棘安保公司/)
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

test('boot card lists dingjiang demo and author can pick new pack', () => {
  const q = bootQuestionFromRefs([
    { id: 'lotm-tingen', title: '廷根切片', dir: 'x', origin: 'bundled' },
    { id: 'jzdh-dingjiang', title: '剑烛大荒·定江切片', dir: 'y', origin: 'bundled' },
    { id: 'my-pack', title: '我的包', dir: 'z', origin: 'user', description: 'community' },
  ])
  const labels = q.questions[0]!.options!.map((o) => o.label)
  assert.ok(labels.includes(BUNDLED_TINGEN))
  assert.ok(labels.includes(BUNDLED_JZDH))
  assert.ok(labels.some((label) => label.includes('my-pack')))
  const mine = q.questions[0]!.options!.find((o) => o.label.includes('my-pack'))
  assert.match(mine?.description ?? '', /community/)
  assert.match(mine?.description ?? '', /~\/.dsh\/airp-packs/)
  assert.deepEqual(resolveBootChoice({ answers: [{ id: 'boot_pack', selected: [BUNDLED_JZDH] }] }), {
    kind: 'bundled',
    packId: 'jzdh-dingjiang',
  })
  assert.deepEqual(resolveBootChoice({ answers: [{ id: 'boot_pack', selected: [PICK_NEW_PACK] }] }), {
    kind: 'new-pack',
  })
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
