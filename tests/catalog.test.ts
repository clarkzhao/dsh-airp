import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { loadCatalog, matchTags, resolveIcActors, tagsFromMeta } from '../src/pack/catalog.ts'
import { loadPack } from '../src/pack/pack.ts'
import { scaffoldPack } from '../src/pack/scaffold.ts'

const bundled = join(dirname(fileURLToPath(import.meta.url)), '..', 'packs')

test('catalog lists official demos from the bundled directory', async () => {
  const catalog = await loadCatalog({ bundledDir: bundled, userDir: await mkdtemp(join(tmpdir(), 'airp-empty-')) })
  const ids = catalog.packs.map((pack) => pack.id)
  assert.ok(ids.includes('lotm-tingen'))
  assert.ok(ids.includes('jzdh-dingjiang'))
})

test('user packs overlay bundled demos without replacing them', async () => {
  const userDir = await mkdtemp(join(tmpdir(), 'airp-user-'))
  const made = await scaffoldPack({
    id: 'rain-alley',
    title: '雨巷',
    destDir: join(userDir, 'rain-alley'),
    protagonistName: '阿青',
    commission: '找回失踪的纸伞。',
    axioms: ['雨夜不鉴定闲聊。'],
  })
  assert.equal(made.ok, true, JSON.stringify(made.diagnostics))
  const catalog = await loadCatalog({ bundledDir: bundled, userDir })
  assert.ok(catalog.packs.some((pack) => pack.id === 'rain-alley' && pack.origin === 'user'))
  assert.ok(catalog.packs.some((pack) => pack.id === 'lotm-tingen' && pack.origin === 'bundled'))
  await rm(userDir, { recursive: true, force: true })
})

test('jzdh-dingjiang loads with pack-declared stats and moth/candle fields', async () => {
  const loaded = await loadPack(join(bundled, 'jzdh-dingjiang'))
  assert.equal(loaded.ok, true, JSON.stringify(loaded.diagnostics))
  const ding = loaded.canon!.characters['ding-songyan']
  assert.ok(ding)
  assert.equal(ding.stats?.insight, 0.4)
  assert.ok(loaded.canon!.checks['contest-wushu'])
  assert.ok(loaded.canon!.lore['jzdh-commission'])
  assert.ok(loaded.canon!.lore['jzdh-dangkang'])
  assert.ok(loaded.canon!.lore['jzdh-luanzanggang'])
  assert.ok(!loaded.canon!.lore['_extract'])
  assert.ok(!loaded.diagnostics.some((d) => d.code === 'MISSING_SCENE'))
})

test('matchTags uses pack lexicon instead of hardcoded LOTM words', () => {
  const lotm = matchTags('巷口对抗开始', tagsFromMeta())
  assert.ok(lotm.includes('contest'))
  const jzdh = matchTags('我要破妄看这株阴尸草', tagsFromMeta({
    tags: { powang: ['破妄', '烛照'], contest: ['对抗'] },
  }))
  assert.deepEqual(jzdh, ['powang'])
})

test('resolveIcActors prefers a named opponent over the second present ally', () => {
  const actors = resolveIcActors('乱葬岗的蛾人扑过来，我要对抗', ['ding-songyan', 'xu-changan'], {
    'ding-songyan': { id: 'ding-songyan', name: '丁松言', keys: ['丁二郎'] },
    'xu-changan': { id: 'xu-changan', name: '许长安', keys: ['许大郎'] },
    'er-ren': { id: 'er-ren', name: '乱葬岗的蛾人', keys: ['蛾人'] },
  })
  assert.equal(actors.attacker, 'ding-songyan')
  assert.equal(actors.defender, 'er-ren')
  const idle = resolveIcActors('我和许长安闲聊', ['ding-songyan', 'xu-changan'], {
    'ding-songyan': { id: 'ding-songyan', name: '丁松言', keys: ['丁二郎'] },
    'xu-changan': { id: 'xu-changan', name: '许长安', keys: ['许大郎'] },
  })
  assert.equal(idle.attacker, 'ding-songyan')
  assert.equal(idle.defender, 'xu-changan')
})
