import { loadPack } from '../pack/pack.ts'
import { expandUserPath, type PackRef } from '../pack/catalog.ts'
import { HostRuntime } from './runtime.ts'

export const PLAY_PRESET_ID = 'airp-play'
export const AUTHOR_PRESET_ID = 'airp-author'
export const BUNDLED_TINGEN = '廷根切片 lotm-tingen（推荐）'
export const BUNDLED_JZDH = '定江切片 jzdh-dingjiang'
export const PICK_CUSTOM = '选择我的世界包目录…'
export const PICK_NEW_PACK = '从零写一个新世界包…'

export interface BootAsk {
  questions: Array<{
    id: string
    header?: string
    question: string
    options?: Array<{ label: string; description?: string }>
  }>
}

export interface BootAnswer {
  answers: Array<{ id: string; selected?: string[]; custom?: string }>
}

export function isPlayPreset(presetId?: string): boolean {
  return presetId === PLAY_PRESET_ID
}

export function isAuthorPreset(presetId?: string): boolean {
  return presetId === AUTHOR_PRESET_ID
}

export function sessionIsBlank(session?: { events?: ReadonlyArray<{ type?: string }> }): boolean {
  return !session?.events?.some((event) => event.type === 'turn/start')
}

export function presetFromSession(session?: {
  header?: { agentPreset?: string }
  events?: ReadonlyArray<{ type?: string; data?: { agentPreset?: string } }>
}): string | undefined {
  const events = session?.events
  if (events) {
    for (let index = events.length - 1; index >= 0; index -= 1) {
      const event = events[index]
      if (event?.type === 'agent-preset/selected' && event.data?.agentPreset) return event.data.agentPreset
    }
  }
  return session?.header?.agentPreset
}

export function shouldBootStory(opts: {
  presetId?: string
  source?: string
  blank?: boolean
  alreadyBooted?: boolean
}): boolean {
  if (opts.alreadyBooted || opts.blank === false) return false
  if (opts.source === 'resume' || opts.source === 'compact') return false
  return isPlayPreset(opts.presetId) || isAuthorPreset(opts.presetId)
}

export function isAskCancelled(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const code = 'code' in error ? String((error as { code?: unknown }).code ?? '') : ''
  const message = error instanceof Error ? error.message : String(error)
  return code === 'ASK_CANCELLED' || code === 'ASK_ABORTED' || /cancelled ask_user_question|aborted before the user answered/i.test(message)
}

export function looksLikePackPath(value: string): boolean {
  const text = value.trim()
  if (!text || text === PICK_CUSTOM || text === BUNDLED_TINGEN || text === BUNDLED_JZDH || text === PICK_NEW_PACK) return false
  return text.startsWith('/') || text.startsWith('~') || text.includes('pack.yaml') || text.includes('\\') || /^[A-Za-z]:[\\/]/.test(text)
}

function typedPath(item: BootAnswer['answers'][number] | undefined): string {
  const custom = item?.custom?.trim()
  if (custom) return custom
  const selected = item?.selected?.[0]?.trim()
  return selected && looksLikePackPath(selected) ? selected : ''
}

export function bootQuestion(packIds: string[]): BootAsk {
  return bootQuestionFromRefs(packIds.map((id) => ({ id, title: id, dir: id, origin: 'bundled' as const })))
}

export function bootQuestionFromRefs(packs: PackRef[]): BootAsk {
  const seen = new Set<string>()
  const options: Array<{ label: string; description?: string }> = [
    { label: BUNDLED_TINGEN, description: '立刻进入黑荆棘安保公司，读委托开玩。官方 demo。' },
  ]
  seen.add('lotm-tingen')
  if (packs.some((pack) => pack.id === 'jzdh-dingjiang')) {
    options.push({ label: BUNDLED_JZDH, description: '大荒定江府，当康庙接「失踪的老贼」。官方 demo。' })
    seen.add('jzdh-dingjiang')
  }
  for (const pack of packs) {
    if (seen.has(pack.id)) continue
    seen.add(pack.id)
    const where = pack.origin === 'user' ? '~/.dsh/airp-packs' : pack.origin === 'custom' ? pack.dir : 'packs/'
    options.push({
      label: `${pack.title} (${pack.id})`,
      description: `${where} · ${pack.description ?? pack.id}`,
    })
  }
  options.push({ label: PICK_CUSTOM, description: '下一屏粘贴含 pack.yaml 的目录。卡片底部也可直接输入路径。' })
  return {
    questions: [{
      id: 'boot_pack',
      header: '加载世界',
      question: '先选要进的世界包。官方 demo 在仓内 packs/；你自己的包放 ~/.dsh/airp-packs/<id>/ 或任意含 pack.yaml 的目录。',
      options,
    }],
  }
}

export function pathQuestion(error?: string): BootAsk {
  return {
    questions: [{
      id: 'boot_path',
      header: '世界包路径',
      question: error
        ? `没能加载该目录：${error}\n请再贴一次含 pack.yaml 的目录路径。`
        : '请输入或粘贴含 pack.yaml 的目录路径。不要选廷根，除非你改主意了。',
    }],
  }
}

export function resolveBootChoice(answer: BootAnswer, packs: PackRef[] = []): { kind: 'bundled'; packId: string } | { kind: 'custom'; path: string } | { kind: 'need-path' } | { kind: 'new-pack' } {
  const hit = answer.answers.find((a) => a.id === 'boot_pack') ?? answer.answers.find((a) => a.id === 'boot_path')
  const path = typedPath(hit)
  if (path) return { kind: 'custom', path }
  const label = hit?.selected?.[0]
  if (!label || label === PICK_CUSTOM) return { kind: 'need-path' }
  if (label === PICK_NEW_PACK) return { kind: 'new-pack' }
  if (label === BUNDLED_TINGEN) return { kind: 'bundled', packId: 'lotm-tingen' }
  if (label === BUNDLED_JZDH) return { kind: 'bundled', packId: 'jzdh-dingjiang' }
  const byTitle = packs.find((pack) => label === `${pack.title} (${pack.id})` || label === pack.id)
  if (byTitle) return { kind: 'bundled', packId: byTitle.id }
  return { kind: 'bundled', packId: label }
}

export function resolvePathAnswer(answer: BootAnswer): { kind: 'custom'; path: string } | { kind: 'need-path' } {
  const path = typedPath(answer.answers.find((a) => a.id === 'boot_path'))
  return path ? { kind: 'custom', path } : { kind: 'need-path' }
}

export async function listPackIds(packsDir: string): Promise<string[]> {
  const { loadCatalog } = await import('../pack/catalog.ts')
  const catalog = await loadCatalog({ bundledDir: packsDir })
  const ids = catalog.packs.map((pack) => pack.id)
  return ids.length ? ids.sort() : ['lotm-tingen']
}

export async function openRuntime(opts: {
  packsDir: string
  sessionId: string
  choice: { kind: 'bundled'; packId: string } | { kind: 'custom'; path: string }
  seed?: string
  role?: 'play' | 'author'
  userDir?: string
}): Promise<HostRuntime> {
  const { loadCatalog, resolvePackDir } = await import('../pack/catalog.ts')
  const catalog = await loadCatalog({ bundledDir: opts.packsDir, userDir: opts.userDir })
  const dir = opts.choice.kind === 'custom'
    ? expandUserPath(opts.choice.path)
    : await resolvePackDir({ catalog, packId: opts.choice.packId })
  const loaded = await loadPack(dir)
  if (!loaded.ok || !loaded.canon) {
    throw new Error(`无法加载世界包 ${dir}: ${loaded.diagnostics.map((d) => d.message).join('; ')}`)
  }
  const packId = loaded.canon.meta.id
  return new HostRuntime({
    canon: loaded.canon,
    sessionId: opts.sessionId,
    seed: opts.seed ?? `${packId}:${opts.sessionId}`,
    role: opts.role,
  })
}
