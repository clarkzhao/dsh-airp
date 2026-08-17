import { readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { loadPack } from '../pack/pack.ts'
import { HostRuntime } from './runtime.ts'

export const BUNDLED_TINGEN = '廷根切片 lotm-tingen（推荐）'
export const PICK_CUSTOM = '选择我的世界包目录…'

export interface BootAsk {
  questions: Array<{
    id: string
    header?: string
    question: string
    options: Array<{ label: string; description?: string }>
  }>
}

export interface BootAnswer {
  answers: Array<{ id: string; selected?: string[]; custom?: string }>
}

export function bootQuestion(packIds: string[]): BootAsk {
  const options = [
    { label: BUNDLED_TINGEN, description: '立刻进入黑荆棘安保公司，读委托开玩。' },
    ...packIds.filter((id) => id !== 'lotm-tingen').map((id) => ({
      label: id,
      description: `加载 packs/${id}`,
    })),
    { label: PICK_CUSTOM, description: '输入或粘贴含 pack.yaml 的目录路径。' },
  ]
  return {
    questions: [{
      id: 'boot_pack',
      header: '加载世界',
      question: '先选要进的世界包。选完引擎会立刻装上，不用再找路径。',
      options,
    }],
  }
}

export function resolveBootChoice(answer: BootAnswer, packsDir: string): { kind: 'bundled'; packId: string } | { kind: 'custom'; path: string } | { kind: 'need-path' } {
  const hit = answer.answers.find((a) => a.id === 'boot_pack')
  const custom = hit?.custom?.trim()
  if (custom) return { kind: 'custom', path: custom }
  const label = hit?.selected?.[0]
  if (!label || label === PICK_CUSTOM) return { kind: 'need-path' }
  if (label === BUNDLED_TINGEN) return { kind: 'bundled', packId: 'lotm-tingen' }
  return { kind: 'bundled', packId: label }
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
    ? opts.choice.path
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
