import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import yaml from 'js-yaml'

const repo = join(dirname(fileURLToPath(import.meta.url)), '..')

interface PresetRow {
  id: string
  name: string
  config: {
    id: string
    name?: string
    description?: string
    order?: number
    plugins: { id: string; name: string }[]
  }
}

/** Read one bundle patch file and return the single preset declaration it inserts. */
async function presetRow(file: string): Promise<PresetRow> {
  const doc = yaml.load(await readFile(join(repo, file), 'utf8')) as { insert: PresetRow[] }[]
  assert.equal(doc.length, 1, `${file}: expected exactly one patch`)
  assert.equal(doc[0].insert.length, 1, `${file}: expected exactly one inserted row`)
  return doc[0].insert[0]
}

test('web profile lists the dsh-airp bundle', async () => {
  const profile = JSON.parse(await readFile(join(homedir(), '.dsh/profiles/web/package.json'), 'utf8')) as {
    dsh: { profile: { bundles: string[] } }
    dependencies: Record<string, string>
  }
  assert.ok(profile.dsh.profile.bundles.includes('dsh-airp'))
  assert.match(profile.dependencies['dsh-airp'] ?? '', /dsh-airp/)
})

test('the bundle declares both AIRP presets as agent-preset rows', async () => {
  const manifest = JSON.parse(await readFile(join(repo, 'package.json'), 'utf8')) as {
    dsh: { bundle: { patch: string[] } }
  }
  // DSH 0.2.0 dropped the legacy `$DSH_HOME/.agent-presets/` directory, so the
  // presets ship as bundle patch rows and installing the plugin is enough.
  assert.deepEqual(manifest.dsh.bundle.patch, [
    './cordis.patch.yml',
    './presets/airp-play.patch.yml',
    './presets/airp-author.patch.yml',
  ])

  const play = await presetRow('presets/airp-play.patch.yml')
  const author = await presetRow('presets/airp-author.patch.yml')

  for (const row of [play, author]) {
    assert.equal(row.name, '@deepseek-ai/dsh-agent-preset')
    assert.equal(row.id, `preset-${row.config.id}`, 'Loader row id is preset-<id> by convention')
    assert.match(row.config.id, /^[a-z0-9-]+$/, 'declaration ids are lowercase')
  }

  assert.equal(play.config.id, 'airp-play')
  assert.equal(play.config.name, 'AIRP 消费者')
  assert.equal(author.config.id, 'airp-author')
  assert.equal(author.config.name, 'AIRP 创造者')
  assert.match(author.config.description ?? '', /两屏|scaffold|交接/)
  assert.ok((play.config.order ?? 0) < (author.config.order ?? 0), '消费者 sorts before 创造者')

  assert.deepEqual(play.config.plugins.map(plugin => plugin.name), [
    '@deepseek-ai/dsh-persona',
    '@deepseek-ai/dsh-tool-ask-user',
  ])
  assert.deepEqual(author.config.plugins.map(plugin => plugin.name), [
    '@deepseek-ai/dsh-persona',
    '@deepseek-ai/dsh-tool-ask-user',
    '@deepseek-ai/dsh-tool-fs',
    '@deepseek-ai/dsh-tool-fs-search',
    '@deepseek-ai/dsh-skill-filesystem',
    '@deepseek-ai/dsh-tool-skill',
  ])
})

test('the author skill ships outside the removed legacy preset directory', async () => {
  const skill = await readFile(join(repo, 'skills/worldbook-authoring/SKILL.md'), 'utf8')
  assert.match(skill, /pack_interview/)
  assert.match(skill, /^---\nname: worldbook-authoring$/m)
})
