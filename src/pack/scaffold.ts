import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expandUserPath, userPacksDir } from './catalog.ts'
import { loadPack, type PackDiagnostic } from './pack.ts'

export interface ScaffoldSpec {
  id: string
  title: string
  locale?: string
  entry_scene?: string
  protagonistId?: string
  protagonistName?: string
  commission?: string
  axioms?: string[]
  destDir?: string
}

export interface ScaffoldResult {
  ok: boolean
  dir: string
  files: string[]
  diagnostics: PackDiagnostic[]
}

const ID_RE = /^[a-z][a-z0-9-]{1,40}$/

export function slugifyPackId(raw: string): string {
  const slug = raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return slug || 'new-pack'
}

export function scaffoldFiles(spec: ScaffoldSpec): Record<string, string> {
  const id = slugifyPackId(spec.id)
  const title = spec.title.trim() || id
  const locale = spec.locale ?? 'zh-CN'
  const scene = spec.entry_scene?.trim() || `${id}.start`
  const heroId = slugifyPackId(spec.protagonistId || 'hero')
  const heroName = spec.protagonistName?.trim() || heroId
  const axioms = (spec.axioms ?? []).map((line) => line.trim()).filter(Boolean)
  const axiomBody = axioms.length
    ? axioms.map((line) => `- ${line.replace(/^[-*]\s*/, '')}`).join('\n')
    : '- 走路和闲聊不触发鉴定；只有关键冲突才鉴定。\n- 口头宣布胜负或晋升不会改变世界。'
  const commission = spec.commission?.trim() || '写清谁委托、要查什么、哪一步才鉴定。'

  const packYaml = [
    `id: ${id}`,
    `title: ${title}`,
    `locale: ${locale}`,
    'rng: bernoulli',
    `entry_scene: ${scene}`,
    'loreBudgetChars: 4000',
    'description: 由 AIRP 创造者脚手架生成。一条 lore 一个概念。',
    'license: CC-BY-SA-4.0',
    'stats:',
    '  grade: 0',
    '  skill: 0',
    '  cost: 0',
    'tags:',
    '  contest: [对抗, 交手, 动手, 战斗, 偷袭]',
    '  cost: [代价, 反噬, 侵蚀, 入局]',
    'opening:',
    `  present: [${heroId}]`,
    '  revealed: [axioms, commission]',
    '  facts:',
    '    commission: pending',
    '',
  ].join('\n')

  const indexYaml = [
    'checks:',
    '  - contest-generic',
    'characters:',
    `  - ${heroId}`,
    'lore:',
    '  - axioms',
    '  - commission',
    'scenes:',
    `  - ${scene}`,
    '',
  ].join('\n')

  const checkYaml = [
    'id: contest-generic',
    'when: 双方直接对抗',
    'kind: contest',
    'condition:',
    '  tag: contest',
    'inputs:',
    '  atk: characters.{attacker}.grade',
    '  def: characters.{defender}.grade',
    'formula: |',
    '  strength = def - atk',
    '  p = sigmoid(-strength / 1.5)',
    'outcomes:',
    '  success:',
    '    apply:',
    '      facts.last_contest: attacker',
    '  failure:',
    '    apply:',
    '      facts.last_contest: defender',
    '      characters.{attacker}.cost: "+0.1"',
    '',
  ].join('\n')

  const heroMd = [
    '---',
    `id: ${heroId}`,
    `name: ${heroName}`,
    `keys: [${heroName}]`,
    '---',
    '',
    `${heroName}的口吻、外形、对外身份。底牌单独一句，进度数字不要写在这里。`,
    '',
  ].join('\n')

  const axiomsMd = `# 公理\n\n${axiomBody}\n`
  const commissionMd = [
    '# 开局委托',
    '',
    commission,
    '',
    '建议节奏：',
    '1. 接委托（fact：facts.commission = accepted）',
    '2. 调查（走路、闲聊不鉴定）',
    '3. 关键冲突才对抗鉴定（tag: contest）',
    '4. 事后代价再鉴定一次（tag: cost）',
    '5. `/retry` 可回到对抗前',
    '',
  ].join('\n')

  const readme = [
    `# ${title}`,
    '',
    `AIRP 世界包 \`${id}\`。把本目录放到 \`~/.dsh/airp-packs/${id}/\`，或在消费者开局卡粘贴路径。`,
    '',
    '写包规则见仓库 `docs/worldbook-authoring.md`：一条 lore 一个概念，角色卡不写进度。',
    '',
  ].join('\n')

  return {
    'pack.yaml': packYaml,
    'index.yaml': indexYaml,
    'checks/contest-generic.yaml': checkYaml,
    [`characters/${heroId}.md`]: heroMd,
    'lore/axioms.md': axiomsMd,
    'lore/commission.md': commissionMd,
    'README.md': readme,
  }
}

export function resolveScaffoldDir(spec: ScaffoldSpec): string {
  if (spec.destDir) return expandUserPath(spec.destDir)
  return join(userPacksDir(), slugifyPackId(spec.id))
}

export async function scaffoldPack(spec: ScaffoldSpec): Promise<ScaffoldResult> {
  const id = slugifyPackId(spec.id)
  if (!ID_RE.test(id)) {
    return {
      ok: false,
      dir: '',
      files: [],
      diagnostics: [{ code: 'BAD_YAML', message: `pack id must match ${ID_RE}: ${spec.id}` }],
    }
  }
  const dir = resolveScaffoldDir({ ...spec, id })
  const files = scaffoldFiles({ ...spec, id })
  await mkdir(join(dir, 'checks'), { recursive: true })
  await mkdir(join(dir, 'characters'), { recursive: true })
  await mkdir(join(dir, 'lore'), { recursive: true })
  const written: string[] = []
  for (const [rel, body] of Object.entries(files)) {
    const path = join(dir, rel)
    await mkdir(join(path, '..'), { recursive: true })
    await writeFile(path, body, 'utf8')
    written.push(rel)
  }
  const loaded = await loadPack(dir)
  return {
    ok: loaded.ok,
    dir,
    files: written,
    diagnostics: loaded.diagnostics,
  }
}
