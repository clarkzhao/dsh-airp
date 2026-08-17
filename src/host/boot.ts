import { readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { loadPack } from '../pack/pack.ts'
import { HostRuntime } from './runtime.ts'

export const PLAY_PRESET_ID = 'airp-play'
export const BUNDLED_TINGEN = '廷根切片 lotm-tingen（推荐）'
export const PICK_CUSTOM = '选择我的世界包目录…'

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
  if (!isPlayPreset(opts.presetId) || opts.alreadyBooted || opts.blank === false) return false
  if (opts.source === 'resume' || opts.source === 'compact') return false
  return true
}

export function isAskCancelled(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const code = 'code' in error ? String((error as { code?: unknown }).code ?? '') : ''
  const message = error instanceof Error ? error.message : String(error)
  return code === 'ASK_CANCELLED' || code === 'ASK_ABORTED' || /cancelled ask_user_question|aborted before the user answered/i.test(message)
}

export function looksLikePackPath(value: string): boolean {
  const text = value.trim()
  if (!text || text === PICK_CUSTOM || text === BUNDLED_TINGEN) return false
  return text.startsWith('/') || text.startsWith('~') || text.includes('pack.yaml') || text.includes('\\') || /^[A-Za-z]:[\\/]/.test(text)
}

function typedPath(item: BootAnswer['answers'][number] | undefined): string {
  const custom = item?.custom?.trim()
  if (custom) return custom
  const selected = item?.selected?.[0]?.trim()
  return selected && looksLikePackPath(selected) ? selected : ''
}

export function bootQuestion(packIds: string[]): BootAsk {
  const options = [
    { label: BUNDLED_TINGEN, description: '立刻进入黑荆棘安保公司，读委托开玩。' },
    ...packIds.filter((id) => id !== 'lotm-tingen').map((id) => ({
      label: id,
      description: `加载 packs/${id}`,
    })),
    { label: PICK_CUSTOM, description: '下一屏粘贴含 pack.yaml 的目录。卡片底部也可直接输入路径。' },
  ]
  return {
    questions: [{
      id: 'boot_pack',
      header: '加载世界',
      question: '先选要进的世界包。只有 AIRP 消费者会话会问这一步。卡片底部可直接粘贴自己的包路径。',
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

export function resolveBootChoice(answer: BootAnswer, _packsDir?: string): { kind: 'bundled'; packId: string } | { kind: 'custom'; path: string } | { kind: 'need-path' } {
  const hit = answer.answers.find((a) => a.id === 'boot_pack') ?? answer.answers.find((a) => a.id === 'boot_path')
  const path = typedPath(hit)
  if (path) return { kind: 'custom', path }
  const label = hit?.selected?.[0]
  if (!label || label === PICK_CUSTOM) return { kind: 'need-path' }
  if (label === BUNDLED_TINGEN) return { kind: 'bundled', packId: 'lotm-tingen' }
  return { kind: 'bundled', packId: label }
}

export function resolvePathAnswer(answer: BootAnswer): { kind: 'custom'; path: string } | { kind: 'need-path' } {
  const path = typedPath(answer.answers.find((a) => a.id === 'boot_path'))
  return path ? { kind: 'custom', path } : { kind: 'need-path' }
}

export async function listPackIds(packsDir: string): Promise<string[]> {
  try {
    const names = await readdir(packsDir, { withFileTypes: true })
    const ids: string[] = []
    for (const ent of names) {
      if (!ent.isDirectory()) continue
      const loaded = await loadPack(resolve(packsDir, ent.name))
      if (loaded.ok) ids.push(ent.name)
    }
    return ids.sort()
  } catch {
    return ['lotm-tingen']
  }
}

export async function openRuntime(opts: {
  packsDir: string
  sessionId: string
  choice: { kind: 'bundled'; packId: string } | { kind: 'custom'; path: string }
  seed?: string
}): Promise<HostRuntime> {
  const dir = opts.choice.kind === 'custom'
    ? resolve(opts.choice.path.replace(/^~(?=\/)/, process.env.HOME ?? ''))
    : resolve(opts.packsDir, opts.choice.packId)
  const loaded = await loadPack(dir)
  if (!loaded.ok || !loaded.canon) {
    throw new Error(`无法加载世界包 ${dir}: ${loaded.diagnostics.map((d) => d.message).join('; ')}`)
  }
  const packId = loaded.canon.meta.id
  return new HostRuntime({
    canon: loaded.canon,
    sessionId: opts.sessionId,
    seed: opts.seed ?? `${packId}:${opts.sessionId}`,
  })
}
