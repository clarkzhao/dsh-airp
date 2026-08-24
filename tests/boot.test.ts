import assert from 'node:assert/strict'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { BUNDLED_JZDH, BUNDLED_TINGEN, PICK_CUSTOM, PICK_CUSTOM_TRAVELER, PICK_EASY_DING, PICK_NEW_PACK, bootQuestion, bootQuestionFromRefs, isAskCancelled, looksLikePackPath, openRuntime, pathQuestion, presetFromSession, resolveBootChoice, resolvePathAnswer, resolveSeating, seatingQuestion, sessionIsBlank, shouldBootStory, travelerQuestion } from '../src/host/boot.ts'
import { loadPack } from '../src/pack/pack.ts'

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
  assert.match(brief, /出图：image_gen 后把 https 图嵌进叙述/)
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
  assert.match(brief, /lore_get jzdh-map/)
  assert.match(brief, /!\[说明\]\(https:\/\/…\)/)
  assert.doesNotMatch(brief, /黑荆棘安保公司/)
})

test('live indexText follows scene after a travel check', async () => {
  const rt = await openRuntime({
    packsDir,
    sessionId: 'live-brief',
    choice: { kind: 'bundled', packId: 'jzdh-dingjiang' },
  })
  assert.match(rt.indexText(), /scene: jzdh.dangkang/)
  assert.match(rt.indexText(), /当康庙/)
  const walk = rt.dispatch({
    kind: 'tool',
    name: 'check_propose',
    args: { checkId: 'travel-on-foot', actors: { actor: 'ding-songyan' }, patch: { scene: 'jzdh.luanzanggang' } },
  })
  assert.equal(walk.ok, true, walk.text)
  const live = rt.indexText()
  assert.match(live, /scene: jzdh.luanzanggang/)
  assert.match(live, /乱葬岗/)
  assert.match(live, /commission=pending/)
})

test('live brief picks the commission lore for the seating mode', async () => {
  const easy = await openRuntime({
    packsDir,
    sessionId: 'comm-easy',
    choice: { kind: 'bundled', packId: 'jzdh-dingjiang' },
    seat: { mode: 'easy' },
  })
  const easyBrief = easy.bootBrief()
  assert.match(easyBrief, /轻松丁松言|张睿|许长安/)
  const custom = await openRuntime({
    packsDir,
    sessionId: 'comm-custom',
    choice: { kind: 'bundled', packId: 'jzdh-dingjiang' },
    seat: { mode: 'custom', customName: '过路刀客' },
  })
  const customBrief = custom.bootBrief()
  assert.match(customBrief, /自拟/)
  assert.doesNotMatch(customBrief, /张睿/)
  const missingMode = await openRuntime({
    packsDir,
    sessionId: 'comm-missing-mode',
    choice: { kind: 'bundled', packId: 'jzdh-dingjiang' },
  })
  assert.match(missingMode.bootBrief(), /轻松丁松言|张睿|许长安/)
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
    answers: [{ id: 'boot_pack', selected: ['/tmp/worlds/mine'] }],
  })
  assert.deepEqual(choice, { kind: 'custom', path: '/tmp/worlds/mine' })
  assert.equal(looksLikePackPath('/tmp/worlds/mine'), true)
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
  assert.ok(labels.includes('我的包'))
  assert.ok(!labels.some((label) => /lotm-tingen|jzdh-dingjiang|my-pack/.test(label)))
  const mine = q.questions[0]!.options!.find((o) => o.label === '我的包')
  assert.match(mine?.description ?? '', /community/)
  assert.match(mine?.description ?? '', /你的世界包目录/)
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

test('scene picker shows lore titles not dotted ids', () => {
  const canon = {
    meta: { id: 'atlas', title: '图册', rng: 'none' as const, entry_scene: 'yanjing.wujinsi' },
    index: { checks: [], characters: [], lore: ['yanjing-wujinsi'], scenes: ['yanjing.wujinsi', 'gan.tiannv'] },
    checks: {},
    characters: {},
    lore: {
      'yanjing-wujinsi': { key: 'yanjing-wujinsi', body: '# 炎京·武禁司\n\n广场。' },
      'gan-tiannv': { key: 'gan-tiannv', body: '# 甘·天女派山门\n\n山门。' },
    },
    guarded: [],
  }
  const labels = seatingQuestion(canon).questions[1]!.options!.map((o) => o.label)
  assert.deepEqual(labels, ['炎京·武禁司', '甘·天女派山门'])
  assert.ok(!labels.some((label) => label.includes('.')))
  const seat = resolveSeating({
    answers: [
      { id: 'boot_mode', selected: [PICK_CUSTOM_TRAVELER] },
      { id: 'boot_scene', selected: ['甘·天女派山门'] },
    ],
  }, canon)
  assert.equal(seat.scene, 'gan.tiannv')
})

test('easy dingjiang seating stays Ding at the temple', async () => {
  const loaded = await loadPack(join(packsDir, 'jzdh-dingjiang'))
  assert.equal(loaded.ok, true)
  const q = seatingQuestion(loaded.canon!)
  const modes = q.questions[0]!.options!.map((o) => o.label)
  assert.ok(modes.includes(PICK_EASY_DING))
  assert.ok(modes.includes(PICK_CUSTOM_TRAVELER))
  const scenes = q.questions[1]!.options!.map((o) => o.label)
  assert.ok(scenes.includes('当康庙'))
  assert.ok(scenes.includes('宵明宗驻地'))
  assert.ok(!scenes.some((label) => label.includes('.')))
  const seat = resolveSeating({
    answers: [{ id: 'boot_mode', selected: [PICK_EASY_DING] }],
  }, loaded.canon!)
  const rt = await openRuntime({
    packsDir,
    sessionId: 'seat-easy',
    choice: { kind: 'bundled', packId: 'jzdh-dingjiang' },
    seat,
  })
  assert.equal(rt.snapshot().state.present[0], 'ding-songyan')
  assert.equal(rt.snapshot().state.scene, 'jzdh.dangkang')
  assert.equal(rt.snapshot().state.facts.play_mode, 'easy')
})

test('custom traveler shares Ding arrival night and does not steal his card', async () => {
  const loaded = await loadPack(join(packsDir, 'jzdh-dingjiang'))
  assert.equal(travelerQuestion(1).questions.length, 3)
  assert.equal(travelerQuestion(2).questions.length, 3)
  const seat = resolveSeating({
    answers: [
      { id: 'boot_mode', selected: [PICK_CUSTOM_TRAVELER] },
      { id: 'boot_scene', selected: ['宵明宗驻地'] },
    ],
  }, loaded.canon!, {
    answers: [
      { id: 'boot_name', custom: '过路刀客' },
      { id: 'boot_age', custom: '22' },
      { id: 'boot_vocation', custom: '镖师' },
      { id: 'boot_origin', custom: '离魂失忆' },
      { id: 'boot_birthplace', custom: '岳江府' },
      { id: 'boot_ties', custom: '认得许长安' },
    ],
  })
  const rt = await openRuntime({
    packsDir,
    sessionId: 'seat-traveler',
    choice: { kind: 'bundled', packId: 'jzdh-dingjiang' },
    seat,
  })
  const state = rt.snapshot().state
  assert.equal(state.present[0], 'wanderer')
  assert.equal(state.present.length, 1)
  assert.ok(!state.present.includes('xu-changan'))
  assert.ok(state.characters['xu-changan'])
  assert.equal(state.scene, 'jzdh.zongmen')
  assert.equal(state.facts.pc_name, '过路刀客')
  assert.equal(state.facts.pc_age, '22')
  assert.equal(state.facts.pc_vocation, '镖师')
  assert.equal(state.facts.arrival, 'same-night-as-ding')
  assert.ok(state.characters['ding-songyan'])
  assert.ok(!state.present.includes('ding-songyan'))
  assert.match(rt.bootBrief(), /同一夜|借尸还魂/)
  assert.match(rt.bootBrief(), /籍贯 岳江府 ≠ 当前场景/)
  assert.match(rt.bootBrief(), /你现在站在|当康庙|宵明/)
  const moth = rt.dispatch({
    kind: 'ic',
    tags: ['contest'],
    actors: { attacker: 'wanderer', defender: 'er-ren' },
    u: 0.81,
  })
  assert.equal(moth.forced, true)
  assert.equal(moth.result.ok, true)
  if (moth.result.ok && moth.result.events[0]?.type === 'check') {
    assert.equal(moth.result.events[0].actors.attacker, 'wanderer')
  }
  // u=0.81 > p → failure keeps the moth on stage (contest-wushu only removes the defender on success)
  assert.ok(rt.snapshot().state.present.includes('er-ren'))
  assert.ok(!rt.snapshot().state.present.includes('ding-songyan'))
})
