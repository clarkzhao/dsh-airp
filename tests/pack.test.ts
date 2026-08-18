import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { loadPack, validatePack } from '../src/pack/pack.ts'
import type { Canon } from '../src/kernel/types.ts'

async function writeMinimal(dir: string, extraCheck = ''): Promise<void> {
  await mkdir(join(dir, 'checks'), { recursive: true })
  await mkdir(join(dir, 'characters'), { recursive: true })
  await mkdir(join(dir, 'lore'), { recursive: true })
  await writeFile(join(dir, 'pack.yaml'), 'id: t\ntitle: T\nrng: bernoulli\nentry_scene: s\n')
  await writeFile(join(dir, 'index.yaml'), 'checks: [contest-sequence]\ncharacters: [klein]\nlore: [axioms]\n')
  await writeFile(join(dir, 'checks', 'contest-sequence.yaml'), `
id: contest-sequence
kind: contest
inputs:
  atk: characters.{attacker}.sequence
formula: |
  p = 0.3
outcomes:
  success:
    apply:
      facts.last_contest: attacker
${extraCheck}`)
  await writeFile(join(dir, 'characters', 'klein.md'), `---
id: klein
name: 克莱恩
keys: [克莱恩]
pathway: fool
sequence_declared: 9
---
口吻。
`)
  await writeFile(join(dir, 'lore', 'axioms.md'), '非凡特性不灭。\n')
}

test('loadPack reads yaml+md into canon', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'airp-pack-'))
  await writeMinimal(dir)
  const result = await loadPack(dir)
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics))
  assert.equal(result.canon?.meta.id, 't')
  assert.ok(result.canon?.checks['contest-sequence'])
  assert.equal(result.canon?.characters.klein?.sequence_declared, 9)
  assert.match(result.canon?.lore.axioms?.body ?? '', /非凡/)
})

test('validatePack reports missing card', () => {
  const canon = {
    meta: { id: 't', title: 't' },
    index: { checks: [], characters: ['ghost'], lore: [] },
    checks: {},
    characters: {},
    lore: {},
    guarded: [],
  } satisfies Canon
  const diags = validatePack(canon)
  assert.ok(diags.some((d) => d.code === 'MISSING_CARD'))
})

test('validatePack reports illegal condition node', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'airp-pack-'))
  await writeMinimal(dir, 'condition:\n  eval: process.exit(1)\n')
  const result = await loadPack(dir)
  assert.equal(result.ok, false)
  assert.ok(result.diagnostics.some((d) => d.code === 'BAD_CONDITION'))
})

test('validatePack warns on progress in a character card and missing commission', () => {
  const canon = {
    meta: { id: 't', title: 't', loreBudgetChars: 4000, opening: { present: ['klein'], revealed: ['axioms'] } },
    index: { checks: [], characters: ['klein'], lore: ['axioms'] },
    checks: {},
    characters: {
      klein: { id: 'klein', name: '克莱恩', keys: [], body: '当前序列 8，消化 0.9。' },
    },
    lore: { axioms: { key: 'axioms', body: '短。' } },
    guarded: [],
  } satisfies Canon
  const diags = validatePack(canon)
  assert.ok(diags.some((d) => d.code === 'PROGRESS_IN_CARD' && d.severity === 'warning'))
  assert.ok(diags.some((d) => d.code === 'MISSING_COMMISSION' && d.severity === 'warning'))
})

test('validatePack rejects lore over budget as a hard error', () => {
  const canon = {
    meta: { id: 't', title: 't', loreBudgetChars: 8 },
    index: { checks: [], characters: [], lore: ['axioms'] },
    checks: {},
    characters: {},
    lore: { axioms: { key: 'axioms', body: '这是一条超预算的设定。' } },
    guarded: [],
  } satisfies Canon
  const diags = validatePack(canon)
  assert.ok(diags.some((d) => d.code === 'LORE_BUDGET' && (d.severity ?? 'error') === 'error'))
})

test('validatePack warns when an index scene has no lore file', () => {
  const canon = {
    meta: { id: 't', title: 't' },
    index: { checks: [], characters: [], lore: [], scenes: ['t.street'] },
    checks: {},
    characters: {},
    lore: {},
    guarded: [],
  } satisfies Canon
  const diags = validatePack(canon)
  assert.ok(diags.some((d) => d.code === 'MISSING_SCENE' && d.severity === 'warning'))
})
