export type Json = null | boolean | number | string | Json[] | { [key: string]: Json }

export type Patch = Record<string, Json | string>

export type Predicate =
  | { all: Predicate[] }
  | { any: Predicate[] }
  | { tag: string }
  | { present: string[] }
  | { eq: [string, Json] }
  | { lt: [string, number] }
  | { lte: [string, number] }
  | { gt: [string, number] }
  | { gte: [string, number] }

export type CheckKind = 'contest' | 'digest' | 'lose_control' | 'generic'

export interface CheckDef {
  id: string
  when?: string
  kind: CheckKind
  condition?: Predicate
  inputs: Record<string, string>
  formula: string
  outcomes: {
    success?: { apply: Patch }
    failure?: { apply: Patch }
  }
}

export interface CharacterCard {
  id: string
  name: string
  keys: string[]
  pathway?: string
  sequence_declared?: number
  body: string
  provisional?: boolean
}

export interface LoreDoc {
  key: string
  title?: string
  body: string
}

export interface PackMeta {
  id: string
  title: string
  locale?: string
  rng?: 'bernoulli' | 'none' | 'd20' | '2d6'
  entry_scene?: string
  loreBudgetChars?: number
}

export interface Canon {
  meta: PackMeta
  index: {
    checks: string[]
    characters: string[]
    lore: string[]
    scenes?: string[]
  }
  checks: Record<string, CheckDef>
  characters: Record<string, CharacterCard>
  lore: Record<string, LoreDoc>
  /** JSON pointers that only check / gm may write. */
  guarded: string[]
}

export interface CharacterState {
  pathway: string
  sequence: number
  digest: number
  lose_control: number
  conditions?: string[]
}

export interface WorldState {
  turn: number
  scene: string
  rng_seed: string
  revealed: string[]
  present: string[]
  characters: Record<string, CharacterState>
  facts: Record<string, Json>
}

export type Intent =
  | { type: 'look'; pointer?: string }
  | { type: 'lore'; key: string }
  | { type: 'check'; checkId: string; actors: Record<string, string> }
  | { type: 'fact'; pointer: string; value: Json }
  | { type: 'gm'; patch: Patch; reason: string }
  | { type: 'correct'; pointer: string; value: Json }

export type KernelErrorCode =
  | 'UNKNOWN_CHECK'
  | 'CHANNEL_VIOLATION'
  | 'BUDGET'
  | 'INVALID_CONDITION'
  | 'MISSING_REASON'
  | 'UNKNOWN_LORE'
  | 'UNKNOWN_ACTOR'

export interface KernelError {
  ok: false
  code: KernelErrorCode
  message: string
}

export interface CheckReceipt {
  kind: 'check'
  check_id: string
  inputs: Record<string, Json>
  p: number
  xi: { kind: string; u: number }
  outcome: 'success' | 'failure'
  patch: Record<string, Json>
}

export interface LoreReceipt {
  kind: 'lore'
  key: string
  body: string
}

export interface LookReceipt {
  kind: 'look'
  value: Json
}

export interface FactReceipt {
  kind: 'fact' | 'correct' | 'gm'
  pointer?: string
  patch: Record<string, Json>
}

export type Receipt = CheckReceipt | LoreReceipt | LookReceipt | FactReceipt | { kind: 'empty' }

export type StoryEvent =
  | {
      type: 'check'
      check_id: string
      inputs: Record<string, Json>
      p: number
      xi: { kind: string; u: number }
      outcome: 'success' | 'failure'
      patch: Record<string, Json>
    }
  | { type: 'apply'; patch: Record<string, Json> }
  | { type: 'fact'; pointer: string; value: Json }
  | { type: 'gm'; patch: Record<string, Json>; reason: string }
  | { type: 'correct'; pointer: string; value: Json }

export interface ForcedCheck {
  checkId: string
  actors: Record<string, string>
}

export interface TurnOk {
  ok: true
  state: WorldState
  receipt: Receipt
  events: StoryEvent[]
}

export type TurnResult = TurnOk | (KernelError & { state: WorldState; receipt: Receipt; events: [] })

export interface TurnOptions {
  /** Inject u for tests. When set, skips seed derivation. */
  u?: number
  /** Override pack rng for this turn. */
  rng?: PackMeta['rng']
}
