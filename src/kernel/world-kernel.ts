import {
  DEFAULT_GUARDED,
  type Canon,
  type CheckDef,
  type CheckReceipt,
  type ForcedCheck,
  type Intent,
  type Json,
  type KernelErrorCode,
  type Patch,
  type Predicate,
  type Receipt,
  type StoryEvent,
  type TurnOptions,
  type TurnResult,
  type WorldState,
} from './types.ts'
export class WorldKernel {
  private readonly canon: Canon

  constructor(canon: Canon) {
    this.canon = canon
  }

  match(state: WorldState, tags: string[], actors: Record<string, string> = {}): ForcedCheck[] {
    const forced: ForcedCheck[] = []
    for (const check of Object.values(this.canon.checks)) {
      if (!check.condition) continue
      const resolved = resolveActors(check.condition, state, actors)
      if (evalPredicate(check.condition, state, tags, resolved)) {
        forced.push({ checkId: check.id, actors: resolved })
      }
    }
    return forced
  }

  turn(state: WorldState, intent: Intent, options: TurnOptions = {}): TurnResult {
    const snapshot = clone(state)
    switch (intent.type) {
      case 'look':
        return ok(snapshot, { kind: 'look', value: (readPointer(snapshot, intent.pointer ?? '') ?? (snapshot as unknown as Json)) }, [])
      case 'lore':
        return this.lore(snapshot, intent.key)
      case 'check':
        return this.runCheck(snapshot, intent.checkId, intent.actors, options)
      case 'fact':
        return this.writeFact(snapshot, 'fact', intent.pointer, intent.value)
      case 'correct':
        return this.writeFact(snapshot, 'correct', intent.pointer, intent.value)
      case 'gm':
        return this.gm(snapshot, intent.patch, intent.reason)
    }
  }

  private lore(state: WorldState, key: string): TurnResult {
    const doc = this.canon.lore[key]
    if (!doc) return fail(state, 'UNKNOWN_LORE', `unknown lore key ${key}`)
    const budget = this.canon.meta.loreBudgetChars ?? Infinity
    if (doc.body.length > budget) return fail(state, 'BUDGET', `lore ${key} exceeds ${budget} chars`)
    return ok(state, { kind: 'lore', key, body: doc.body }, [])
  }

  private runCheck(state: WorldState, checkId: string, actors: Record<string, string>, options: TurnOptions): TurnResult {
    const def = this.canon.checks[checkId]
    if (!def) return fail(state, 'UNKNOWN_CHECK', `unknown check ${checkId}`)
    for (const [slot, id] of Object.entries(actors)) {
      if (!state.characters[id]) return fail(state, 'UNKNOWN_ACTOR', `unknown actor ${slot}=${id}`)
    }
    const inputs = resolveInputs(def, state, actors)
    if (inputs === undefined) return fail(state, 'INVALID_CONDITION', 'could not resolve check inputs')
    const p = evalFormula(def.formula, inputs)
    const rng = options.rng ?? this.canon.meta.rng ?? 'bernoulli'
    const u = options.u ?? (rng === 'none' ? 0 : deriveU(state.rng_seed, checkId, checkOrdinal(state)))
    const outcome: 'success' | 'failure' = rng === 'none' ? (p >= 0.5 ? 'success' : 'failure') : (u < p ? 'success' : 'failure')
    const patch = instantiatePatch(def.outcomes[outcome]?.apply ?? {}, actors)
    applyPatch(state, patch)
    writePointer(state, 'facts.__check_ordinal', checkOrdinal(state) + 1)
    state.turn += 1
    const receipt: CheckReceipt = {
      kind: 'check',
      check_id: checkId,
      inputs: { ...inputs, p },
      p,
      xi: { kind: rng, u },
      outcome,
      patch,
    }
    const event: StoryEvent = {
      type: 'check',
      check_id: checkId,
      actors,
      inputs: receipt.inputs,
      p,
      xi: receipt.xi,
      outcome,
      patch,
    }
    return ok(state, receipt, [event])
  }

  private writeFact(state: WorldState, kind: 'fact' | 'correct', pointer: string, value: Json): TurnResult {
    const guarded = this.canon.guarded.length ? this.canon.guarded : DEFAULT_GUARDED
    if (isGuarded(pointer, guarded)) {
      return fail(state, 'CHANNEL_VIOLATION', `${pointer} is a guarded numeric field`)
    }
    writePointer(state, pointer, value)
    state.turn += 1
    const event: StoryEvent = kind === 'fact'
      ? { type: 'fact', pointer, value }
      : { type: 'correct', pointer, value }
    return ok(state, { kind, pointer, patch: { [pointer]: value } }, [event])
  }

  private gm(state: WorldState, patch: Patch, reason: string): TurnResult {
    if (!reason.trim()) return fail(state, 'MISSING_REASON', 'gm requires a reason')
    const applied = instantiatePatch(patch, {})
    applyPatch(state, applied)
    state.turn += 1
    return ok(state, { kind: 'gm', patch: applied }, [{ type: 'gm', patch: applied, reason: reason.trim() }])
  }
}

function ok(state: WorldState, receipt: Receipt, events: StoryEvent[]): TurnResult {
  return { ok: true, state, receipt, events }
}

function fail(state: WorldState, code: KernelErrorCode, message: string): TurnResult {
  return { ok: false, code, message, state, receipt: { kind: 'empty' }, events: [] }
}
function resolveActors(pred: Predicate, state: WorldState, given: Record<string, string>): Record<string, string> {
  const actors = { ...given }
  for (const slot of collectActorSlots(pred)) {
    if (actors[slot]) continue
    if (state.present.length === 1) actors[slot] = state.present[0]!
  }
  return actors
}

function collectActorSlots(pred: Predicate, into: Set<string> = new Set()): string[] {
  if ('all' in pred) pred.all.forEach((p) => collectActorSlots(p, into))
  else if ('any' in pred) pred.any.forEach((p) => collectActorSlots(p, into))
  else if ('present' in pred) {
    for (const item of pred.present) {
      if (item.startsWith('$')) into.add(item.slice(1))
    }
  }
  return [...into]
}

function evalPredicate(pred: Predicate, state: WorldState, tags: string[], actors: Record<string, string>): boolean {
  if ('all' in pred) return pred.all.every((p) => evalPredicate(p, state, tags, actors))
  if ('any' in pred) return pred.any.some((p) => evalPredicate(p, state, tags, actors))
  if ('tag' in pred) return tags.includes(pred.tag)
  if ('present' in pred) {
    return pred.present.every((item) => {
      const id = item.startsWith('$') ? actors[item.slice(1)] : item
      return Boolean(id && state.present.includes(id))
    })
  }
  if ('eq' in pred) return readPointer(state, bindPath(pred.eq[0], actors)) === pred.eq[1]
  const pair = 'lt' in pred ? pred.lt : 'lte' in pred ? pred.lte : 'gt' in pred ? pred.gt : pred.gte
  const raw = readPointer(state, bindPath(pair[0], actors))
  if (typeof raw !== 'number') return false
  if ('lt' in pred) return raw < pred.lt[1]
  if ('lte' in pred) return raw <= pred.lte[1]
  if ('gt' in pred) return raw > pred.gt[1]
  return raw >= pred.gte[1]
}

function resolveInputs(def: CheckDef, state: WorldState, actors: Record<string, string>): Record<string, Json> | undefined {
  const out: Record<string, Json> = {}
  for (const [name, expr] of Object.entries(def.inputs)) {
    const bound = bindPath(expr, actors)
    if (bound.startsWith('eq(') && bound.endsWith(')')) {
      const [a, b] = splitArgs(bound.slice(3, -1))
      out[name] = readPointer(state, a.trim()) === readPointer(state, b.trim())
      continue
    }
    const value = readPointer(state, bound)
    if (value === undefined) return undefined
    out[name] = value
  }
  return out
}

function evalFormula(src: string, inputs: Record<string, Json>): number {
  const env: Record<string, number | boolean> = {}
  for (const [k, v] of Object.entries(inputs)) {
    if (typeof v === 'number' || typeof v === 'boolean') env[k] = v
  }
  const sigmoid = (x: number) => 1 / (1 + Math.exp(-x))
  const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x))
  const lines = src.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
  for (const line of lines) {
    const ifMatch = line.match(/^if\s+(\w+)\s*:\s*(.+)$/)
    if (ifMatch) {
      if (!env[ifMatch[1]!]) continue
      assign(ifMatch[2]!, env, { sigmoid, clamp })
      continue
    }
    assign(line, env, { sigmoid, clamp })
  }
  const raw = env.p
  return typeof raw === 'number' ? clamp(raw) : 0.5
}

function assign(
  line: string,
  env: Record<string, number | boolean>,
  fns: { sigmoid: (x: number) => number; clamp: (x: number, lo?: number, hi?: number) => number },
): void {
  const eq = line.indexOf('=')
  if (eq < 0) return
  const name = line.slice(0, eq).trim()
  env[name] = evalExpr(line.slice(eq + 1).trim(), env, fns)
}

function evalExpr(
  expr: string,
  env: Record<string, number | boolean>,
  fns: { sigmoid: (x: number) => number; clamp: (x: number, lo?: number, hi?: number) => number },
): number {
  const call = expr.match(/^(\w+)\((.+)\)$/)
  if (call) {
    const args = splitArgs(call[2]!).map((a) => evalExpr(a.trim(), env, fns))
    if (call[1] === 'sigmoid') return fns.sigmoid(args[0] ?? 0)
    if (call[1] === 'clamp') return fns.clamp(args[0] ?? 0, args[1], args[2])
  }
  const tokens = expr
    .replaceAll('-', ' - ')
    .replaceAll('+', ' + ')
    .replaceAll('/', ' / ')
    .replaceAll('*', ' * ')
    .split(/\s+/)
    .filter(Boolean)
  let acc = 0
  let op: '+' | '-' | '*' | '/' = '+'
  const apply = (n: number) => {
    if (op === '+') acc += n
    else if (op === '-') acc -= n
    else if (op === '*') acc *= n
    else acc = n === 0 ? acc : acc / n
  }
  for (const tok of tokens) {
    if (tok === '+' || tok === '-' || tok === '*' || tok === '/') {
      op = tok
      continue
    }
    if (tok in env) {
      const v = env[tok]
      apply(typeof v === 'number' ? v : v ? 1 : 0)
      continue
    }
    const n = Number(tok)
    if (!Number.isNaN(n)) apply(n)
  }
  return acc
}

function instantiatePatch(patch: Patch, actors: Record<string, string>): Record<string, Json> {
  const out: Record<string, Json> = {}
  for (const [path, value] of Object.entries(patch)) {
    out[bindPath(path, actors)] = value as Json
  }
  return out
}

function applyPatch(state: WorldState, patch: Record<string, Json>): void {
  for (const [path, value] of Object.entries(patch)) {
    if (typeof value === 'string' && /^[+-]\d+(\.\d+)?$/.test(value)) {
      const cur = readPointer(state, path)
      const base = typeof cur === 'number' ? cur : 0
      writePointer(state, path, round4(base + Number(value)))
      continue
    }
    writePointer(state, path, value)
  }
}

function isGuarded(pointer: string, patterns: readonly string[]): boolean {
  const parts = pointer.split('.')
  return patterns.some((pat) => {
    const want = pat.split('.')
    if (want.length !== parts.length) return false
    return want.every((w, i) => w === '*' || w === parts[i])
  })
}

function bindPath(expr: string, actors: Record<string, string>): string {
  return expr.replace(/\{(\w+)\}/g, (_, slot: string) => actors[slot] ?? `{${slot}}`)
}

function splitArgs(inner: string): string[] {
  const args: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of inner) {
    if (ch === '(') depth += 1
    if (ch === ')') depth -= 1
    if (ch === ',' && depth === 0) {
      args.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  if (cur) args.push(cur)
  return args
}

export function readPointer(state: WorldState, pointer: string): Json | undefined {
  if (!pointer) return state as unknown as Json
  const parts = pointer.split('.').filter(Boolean)
  let cur: unknown = state
  for (const part of parts) {
    if (cur === null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[part]
  }
  return cur as Json | undefined
}

function writePointer(state: WorldState, pointer: string, value: Json): void {
  const parts = pointer.split('.').filter(Boolean)
  if (parts.length === 0) return
  let cur: Record<string, unknown> = state as unknown as Record<string, unknown>
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i]!
    const next = cur[key]
    if (next === null || typeof next !== 'object') {
      const created: Record<string, unknown> = {}
      cur[key] = created
      cur = created
    } else {
      cur = next as Record<string, unknown>
    }
  }
  cur[parts[parts.length - 1]!] = value
}

function checkOrdinal(state: WorldState): number {
  const n = state.facts.__check_ordinal
  return typeof n === 'number' ? n : 0
}

function deriveU(seed: string, checkId: string, index: number): number {
  const input = `${seed}:${checkId}:${index}`
  let h = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 1_000_000) / 1_000_000
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}
