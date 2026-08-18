import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { interviewCard, interviewFacts, interviewRevealed, interviewRng, interviewScreens, mergeInterviewAnswers, parseInterview } from '../src/pack/interview.ts'
import { scaffoldPack } from '../src/pack/scaffold.ts'

test('interview card is exactly eight questions that map to state', () => {
  const card = interviewCard()
  assert.equal(card.questions.length, 8)
  assert.deepEqual(card.questions.map((q) => q.id), ['who', 'identity', 'scene', 'commission', 'teach', 'tier', 'tone', 'banned'])
  const [one, two] = interviewScreens()
  assert.equal(one.questions.length, 4)
  assert.equal(two.questions.length, 4)
  assert.deepEqual(interviewCard(1).questions.map((q) => q.id), ['who', 'identity', 'scene', 'commission'])
  assert.deepEqual(interviewCard(2).questions.map((q) => q.id), ['teach', 'tier', 'tone', 'banned'])
})

test('mergeInterviewAnswers concatenates two ask-user screens', () => {
  const merged = mergeInterviewAnswers(
    { answers: [{ id: 'who', custom: '阿青' }, { id: 'commission', custom: '找伞' }] },
    { answers: [{ id: 'tier', selected: ['纯叙事（几乎不鉴定）'] }, { id: 'tone', selected: ['轻松'] }] },
  )
  assert.equal(merged.who, '阿青')
  assert.equal(merged.tier, 'narrative')
  assert.equal(interviewRng(merged), 'none')
})

test('parseInterview maps ask-user answers onto opening facts', () => {
  const answers = parseInterview({
    answers: [
      { id: 'who', custom: '丁松言' },
      { id: 'identity', custom: '说书人' },
      { id: 'scene', custom: 'jzdh.dangkang' },
      { id: 'commission', custom: '找失踪的老贼' },
      { id: 'teach', selected: ['直接开玩'] },
      { id: 'tier', selected: ['硬核（对抗 + 代价都鉴定）'] },
      { id: 'tone', selected: ['严肃'] },
      { id: 'banned', custom: '无' },
    ],
  })
  assert.equal(answers.who, '丁松言')
  assert.equal(answers.teach, 'play')
  assert.equal(answers.tier, 'hard')
  assert.equal(answers.banned, undefined)
  assert.deepEqual(interviewRevealed(answers), ['commission'])
  assert.equal(interviewRng(answers), 'bernoulli')
  assert.deepEqual(interviewFacts(answers), {
    commission: 'pending',
    identity: '说书人',
    tone: '严肃',
  })
})

test('scaffoldPack writes interview facts and hard cost', async () => {
  const dest = await mkdtemp(join(tmpdir(), 'airp-iv-'))
  const made = await scaffoldPack({
    id: 'rain-night',
    title: '雨夜',
    destDir: dest,
    interview: parseInterview({
      answers: [
        { id: 'who', custom: '阿青' },
        { id: 'identity', custom: '撑伞人' },
        { id: 'commission', custom: '找回失踪的纸伞' },
        { id: 'teach', selected: ['直接开玩'] },
        { id: 'tier', selected: ['硬核（对抗 + 代价都鉴定）'] },
        { id: 'tone', selected: ['快节奏'] },
        { id: 'banned', custom: '无儿童伤害' },
      ],
    }),
  })
  assert.equal(made.ok, true, JSON.stringify(made.diagnostics))
  const yaml = await readFile(join(dest, 'pack.yaml'), 'utf8')
  assert.match(yaml, /identity: 撑伞人/)
  assert.match(yaml, /tone: 快节奏/)
  assert.match(yaml, /banned: 无儿童伤害/)
  assert.match(yaml, /revealed: \[commission\]/)
  const check = await readFile(join(dest, 'checks', 'contest-generic.yaml'), 'utf8')
  assert.match(check, /\+0\.2/)
  await rm(dest, { recursive: true, force: true })
})
