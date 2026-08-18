import type { Intent, Json, Patch, TurnResult } from '../kernel/types.ts'

export type PlayRole = 'play' | 'author'

// OpenAI-compatible APIs reject dotted function names (`^[a-zA-Z0-9_-]+$`).
export const PLAY_TOOLS = ['lore_get', 'state_read', 'check_match', 'check_propose', 'state_propose_fact'] as const
export const AUTHOR_EXTRA_TOOLS = ['pack_validate', 'pack_scaffold'] as const

export function toolsFor(role: PlayRole): readonly string[] {
  return role === 'author' ? [...PLAY_TOOLS, ...AUTHOR_EXTRA_TOOLS] : PLAY_TOOLS
}

export function intentFromTool(name: string, args: Record<string, unknown>): Intent | { error: string } {
  switch (name) {
    case 'lore_get':
      if (typeof args.key !== 'string' || !args.key) return { error: 'key required' }
      return { type: 'lore', key: args.key }
    case 'state_read':
      return { type: 'look', pointer: typeof args.pointer === 'string' ? args.pointer : undefined }
    case 'check_propose': {
      if (typeof args.checkId !== 'string' || !args.checkId) return { error: 'checkId required' }
      const actors = isStringRecord(args.actors) ? args.actors : {}
      return { type: 'check', checkId: args.checkId, actors }
    }
    case 'state_propose_fact':
      if (typeof args.pointer !== 'string' || !args.pointer) return { error: 'pointer required' }
      return { type: 'fact', pointer: args.pointer, value: (args.value ?? null) as Json }
    default:
      return { error: `unknown tool ${name}` }
  }
}

export function intentFromCommand(name: string, rawInput: string): Intent | { fork: true; checkId?: string } | { ooc: string } | { error: string } {
  const input = rawInput.trim()
  switch (name) {
    case 'look':
    case 'state':
      return { type: 'look', pointer: input || undefined }
    case 'retry':
      return { fork: true, checkId: input || undefined }
    case 'gm': {
      const split = splitReason(input)
      if (!split) return { error: 'usage: /gm <pointer>=<json> :: <reason>' }
      return { type: 'gm', patch: { [split.pointer]: split.value } satisfies Patch, reason: split.reason }
    }
    case 'correct': {
      const split = splitReason(input)
      if (!split) return { error: 'usage: /correct <pointer>=<json> :: <reason>' }
      return { type: 'correct', pointer: split.pointer, value: split.value }
    }
    case 'ooc':
      return { ooc: input }
    default:
      return { error: `unknown command ${name}` }
  }
}

export function receiptText(result: TurnResult): string {
  if (!result.ok) return `${result.code}: ${result.message}`
  const r = result.receipt
  if (r.kind === 'check') {
    return `CHECK ${r.check_id} p=${r.p.toFixed(3)} u=${r.xi.u.toFixed(3)} → ${r.outcome}`
  }
  if (r.kind === 'lore') return r.body
  if (r.kind === 'look') return JSON.stringify(r.value, null, 2)
  if (r.kind === 'empty') return 'no transition'
  return JSON.stringify(r.patch)
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== 'object') return false
  return Object.values(value).every((v) => typeof v === 'string')
}

function splitReason(input: string): { pointer: string; value: Json; reason: string } | undefined {
  const parts = input.split('::')
  if (parts.length < 2) return undefined
  const left = parts[0]!.trim()
  const reason = parts.slice(1).join('::').trim()
  const eq = left.indexOf('=')
  if (eq < 0) return undefined
  const pointer = left.slice(0, eq).trim()
  const raw = left.slice(eq + 1).trim()
  let value: Json
  try {
    value = JSON.parse(raw) as Json
  } catch {
    value = raw
  }
  if (!pointer || !reason) return undefined
  return { pointer, value, reason }
}
