import assert from 'node:assert/strict'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { loadPack } from '../src/pack/pack.ts'
import { playHandoff } from '../src/pack/handoff.ts'

const packs = join(dirname(fileURLToPath(import.meta.url)), '..', 'packs')

test('playHandoff refuses to switch preset and names the pack path', async () => {
  const loaded = await loadPack(join(packs, 'jzdh-dingjiang'))
  assert.equal(loaded.ok, true)
  const card = playHandoff({
    packId: loaded.canon!.meta.id,
    title: loaded.canon!.meta.title,
    dir: join(packs, 'jzdh-dingjiang'),
    diagnostics: loaded.diagnostics,
  })
  assert.equal(card.ok, true)
  assert.equal(card.preset, 'airp-play')
  assert.ok(card.how.some((line) => /不能热切/.test(line)))
  assert.ok(card.how.some((line) => line.includes('jzdh-dingjiang')))
})

test('playHandoff stays closed when validate still has errors', () => {
  const card = playHandoff({
    packId: 'broken',
    dir: '/tmp/broken',
    diagnostics: [{ code: 'MISSING_FILE', message: 'pack.yaml missing' }],
  })
  assert.equal(card.ok, false)
  assert.ok(card.how.some((line) => /error/.test(line)))
})
