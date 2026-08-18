import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

test('web profile lists dsh-airp bundle and presets exist', async () => {
  const profile = JSON.parse(await readFile(join(homedir(), '.dsh/profiles/web/package.json'), 'utf8')) as {
    dsh: { profile: { bundles: string[] } }
    dependencies: Record<string, string>
  }
  assert.ok(profile.dsh.profile.bundles.includes('dsh-airp'))
  assert.match(profile.dependencies['dsh-airp'] ?? '', /dsh-airp/)

  const play = await readFile(join(homedir(), '.dsh/.agent-presets/airp-play/preset.yml'), 'utf8')
  const author = await readFile(join(homedir(), '.dsh/.agent-presets/airp-author/preset.yml'), 'utf8')
  const authorComp = await readFile(join(homedir(), '.dsh/.agent-presets/airp-author/agent.cordis.yml'), 'utf8')
  const skill = await readFile(join(homedir(), '.dsh/.agent-presets/airp-author/skills/worldbook-authoring/SKILL.md'), 'utf8')
  assert.match(play, /AIRP 消费者/)
  assert.match(author, /AIRP 创造者/)
  assert.match(authorComp, /tool-skill/)
  assert.match(skill, /pack_interview/)

  const dump = await readFile(join(homedir(), '.dsh/profiles/web/package.json'), 'utf8')
  assert.match(dump, /dsh-airp/)
})
