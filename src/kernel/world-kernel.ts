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
  type PlaceEdge,
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
        return this.runCheck(snapshot, intent.checkId, intent.actors, options, intent.patch)
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
    const card = !doc ? this.canon.characters[key] : undefined
    const body = doc?.body ?? card?.body
    if (!body) return fail(state, 'UNKNOWN_LORE', `unknown lore key ${key}`)
    const budget = this.canon.meta.loreBudgetChars ?? Infinity
    if (body.length > budget) return fail(state, 'BUDGET', `lore ${key} exceeds ${budget} chars`)
    return ok(state, { kind: 'lore', key, body }, [])
  }

  private runCheck(state: WorldState, checkId: string, actors: Record<string, string>, options: TurnOptions, extra?: Patch): TurnResult {
    const def = this.canon.checks[checkId]
    if (!def) return fail(state, 'UNKNOWN_CHECK', `unknown check ${checkId}`)
    for (const [slot, id] of Object.entries(actors)) {
      if (!state.characters[id]) return fail(state, 'UNKNOWN_ACTOR', `unknown actor ${slot}=${id}`)
    }
    if (def.condition && !evalPredicate(def.condition, state, [], actors, { skipTags: true })) {
      return fail(state, 'INVALID_CONDITION', `condition not met for ${checkId}`)
    }
    const inputs = resolveInputs(def, state, actors)
    if (inputs === undefined) return fail(state, 'INVALID_CONDITION', 'could not resolve check inputs')
    const p = evalFormula(def.formula, inputs)
    const rng = options.rng ?? this.canon.meta.rng ?? 'bernoulli'
    const u = options.u ?? (rng === 'none' ? 0 : deriveU(state.rng_seed, checkId, checkOrdinal(state)))
    const outcome: 'success' | 'failure' = rng === 'none' ? (p >= 0.5 ? 'success' : 'failure') : (u < p ? 'success' : 'failure')
    const extraPatch = sanitizeExtra(extra)
    if (extraPatch === undefined) {
      return fail(state, 'EXTRA_GUARDED', 'extra patch may not write present')
    }
    const patch = instantiatePatch({ ...(def.outcomes[outcome]?.apply ?? {}), ...extraPatch }, actors)
    const travel = this.guardTravel(state, patch)
    if (travel) return travel
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
    const guarded = this.canon.guarded.length
      ? [...new Set([...DEFAULT_GUARDED, ...this.canon.guarded])]
      : DEFAULT_GUARDED
    if (isGuarded(pointer, guarded) || clonesGuardedRoot(pointer, guarded)) {
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
    const travel = this.guardTravel(state, applied)
    if (travel) return travel
    applyPatch(state, applied)
    state.turn += 1
    return ok(state, { kind: 'gm', patch: applied }, [{ type: 'gm', patch: applied, reason: reason.trim() }])
  }

  private guardTravel(state: WorldState, patch: Record<string, Json>): TurnResult | undefined {
    if (!Object.prototype.hasOwnProperty.call(patch, 'scene')) return undefined
    const dest = patch.scene
    if (typeof dest !== 'string') return fail(state, 'TRAVEL_BLOCKED', 'scene must be a string')
    const blocked = travelBlocked(this.canon, state, dest)
    if (!blocked) {
      const edge = edgeOf(this.canon, state.scene, dest)
      if (edge?.beats) {
        const beat = typeof state.clock?.beat === 'number' ? state.clock.beat : 0
        patch['clock.beat'] = beat + edge.beats
      }
      return undefined
    }
    return fail(state, 'TRAVEL_BLOCKED', blocked)
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
  const slots = collectActorSlots(pred)
  // Only fill a lone helper slot such as `$actor` on cost/travel. Contest
  // (`$attacker` + `$defender`) must not collapse both onto present[0].
  if (slots.length !== 1) return actors
  const slot = slots[0]!
  if (actors[slot]) return actors
  if (state.present.length === 1) actors[slot] = state.present[0]!
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

function evalPredicate(
  pred: Predicate,
  state: WorldState,
  tags: string[],
  actors: Record<string, string>,
  options: { skipTags?: boolean } = {},
): boolean {
  if ('all' in pred) return pred.all.every((p) => evalPredicate(p, state, tags, actors, options))
  if ('any' in pred) return pred.any.some((p) => evalPredicate(p, state, tags, actors, options))
  // skipTags: explicit check_propose has no IC lexicon. Treat tag atoms as
  // already satisfied so present/eq still gate the check.
  if ('tag' in pred) {
    if (options.skipTags) return true
    return tags.includes(pred.tag)
  }
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
    .replaceAll('(', ' ( ')
    .replaceAll(')', ' ) ')
    .replaceAll('-', ' - ')
    .replaceAll('+', ' + ')
    .replaceAll('/', ' / ')
    .replaceAll('*', ' * ')
    .split(/\s+/)
    .filter(Boolean)
  return evalTokens(tokens, env)
}

function readAtom(
  tokens: string[],
  i: number,
  env: Record<string, number | boolean>,
): { value: number; next: number } | undefined {
  const tok = tokens[i]
  if (tok === undefined) return undefined
  if (tok === '(') {
    const inner: string[] = []
    let depth = 1
    let j = i + 1
    for (; j < tokens.length; j += 1) {
      if (tokens[j] === '(') depth += 1
      else if (tokens[j] === ')') {
        depth -= 1
        if (depth === 0) break
      }
      inner.push(tokens[j]!)
    }
    return { value: evalTokens(inner, env), next: j + 1 }
  }
  if (tok in env) {
    const v = env[tok]
    return { value: typeof v === 'number' ? v : v ? 1 : 0, next: i + 1 }
  }
  const n = Number(tok)
  if (!Number.isNaN(n)) return { value: n, next: i + 1 }
  return undefined
}

function evalTokens(tokens: string[], env: Record<string, number | boolean>): number {
  const values: number[] = []
  const ops: Array<'+' | '-' | '*' | '/'> = []
  let expectValue = true
  let i = 0
  const applyMul = () => {
    while (ops.length && (ops[ops.length - 1] === '*' || ops[ops.length - 1] === '/')) {
      const op = ops.pop()!
      const b = values.pop() ?? 0
      const a = values.pop() ?? 0
      values.push(op === '*' ? a * b : b === 0 ? a : a / b)
    }
  }
  while (i < tokens.length) {
    const tok = tokens[i]!
    if (expectValue && (tok === '+' || tok === '-')) {
      const atom = readAtom(tokens, i + 1, env)
      if (!atom) break
      values.push(tok === '-' ? -atom.value : atom.value)
      i = atom.next
      expectValue = false
      applyMul()
      continue
    }
    if (tok === '+' || tok === '-' || tok === '*' || tok === '/') {
      ops.push(tok)
      i += 1
      expectValue = true
      continue
    }
    const atom = readAtom(tokens, i, env)
    if (!atom) break
    values.push(atom.value)
    i = atom.next
    expectValue = false
    applyMul()
  }
  let acc = values[0] ?? 0
  for (let k = 0; k < ops.length; k += 1) {
    const b = values[k + 1] ?? 0
    if (ops[k] === '+') acc += b
    else if (ops[k] === '-') acc -= b
  }
  return acc
}

function instantiatePatch(patch: Patch, actors: Record<string, string>): Record<string, Json> {
  const out: Record<string, Json> = {}
  for (const [path, value] of Object.entries(patch)) {
    out[bindPath(path, actors)] = bindValue(value, actors)
  }
  return out
}

function bindValue(value: Json | string, actors: Record<string, string>): Json {
  if (typeof value === 'string') return bindPath(value, actors)
  if (Array.isArray(value)) return value.map((item) => bindValue(item as Json, actors))
  return value as Json
}

function applyPatch(state: WorldState, patch: Record<string, Json>): void {
  for (const [path, value] of Object.entries(patch)) {
    if (path === 'present') {
      writePointer(state, path, applyPresent(state.present, value))
      continue
    }
    if (typeof value === 'string' && /^[+-]\d+(\.\d+)?$/.test(value)) {
      const cur = readPointer(state, path)
      const base = typeof cur === 'number' ? cur : 0
      writePointer(state, path, round4(base + Number(value)))
      continue
    }
    writePointer(state, path, value)
  }
}

function applyPresent(current: string[], value: Json): string[] {
  if (typeof value === 'string') {
    const id = value.trim()
    if (id.startsWith('-')) return current.filter((item) => item !== id.slice(1))
    if (id.startsWith('+')) {
      const add = id.slice(1)
      return current.includes(add) ? current : [...current, add]
    }
    return [id]
  }
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
    return [...value]
  }
  return current
}

function clonesGuardedRoot(pointer: string, patterns: readonly string[]): boolean {
  if (!pointer.startsWith('facts.')) return false
  const rest = pointer.slice('facts.'.length)
  if (!rest || rest.startsWith('__')) return false
  const root = rest.split('.')[0]
  if (!root) return false
  return patterns.some((pat) => pat === root || pat.startsWith(`${root}.`))
}

function isGuarded(pointer: string, patterns: readonly string[]): boolean {
  const parts = pointer.split('.')
  return patterns.some((pat) => {
    const want = pat.split('.')
    if (want.length > parts.length) return false
    const prefixOk = want.every((w, i) => w === '*' || w === parts[i])
    if (!prefixOk) return false
    // Exact segment match, or a deeper write under a guarded terminal node
    // (e.g. `present` must also cover `present.0`). A trailing wildcard
    // (`characters.*`) guards the objects themselves, not their leaves.
    return want.length === parts.length || want[want.length - 1] !== '*'
  })
}

function sanitizeExtra(extra: Patch | undefined): Patch | undefined {
  if (!extra) return {}
  for (const key of Object.keys(extra)) {
    if (key === 'present' || key.startsWith('present.')) return undefined
  }
  return extra
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

function placesOf(canon: Canon): Record<string, { edges?: Record<string, PlaceEdge> }> | undefined {
  const places = canon.meta.places
  if (!places || Object.keys(places).length === 0) return undefined
  return places
}

function edgeOf(canon: Canon, from: string, to: string): PlaceEdge | undefined {
  if (from === to) return {}
  return placesOf(canon)?.[from]?.edges?.[to]
}

function travelBlocked(canon: Canon, state: WorldState, dest: string): string | undefined {
  const places = placesOf(canon)
  if (!places) return undefined
  if (state.scene === dest) return undefined
  const edge = edgeOf(canon, state.scene, dest)
  if (!edge) return `no edge ${state.scene} → ${dest}`
  const need = edge.need?.trim()
  if (!need) return undefined
  const blocked = needUnmet(state, need)
  if (blocked === undefined) return undefined
  return blocked
}

const MOBILITY_NEED = /^(mobility)\s*(>=|>|<=|<|=)\s*(-?\d+(?:\.\d+)?)$/
const FACT_NEED = /^(?:facts\.)?([A-Za-z_][\w]*)\s*(!=|=)\s*(.+)$/

export function parsePlaceNeed(need: string): { ok: true } | { ok: false } {
  const text = need.trim()
  if (MOBILITY_NEED.test(text) || FACT_NEED.test(text)) return { ok: true }
  return { ok: false }
}

function needUnmet(state: WorldState, need: string): string | undefined {
  const text = need.trim()
  const mobility = MOBILITY_NEED.exec(text)
  if (mobility) {
    const pc = state.present[0]
    const raw = pc ? state.characters[pc]?.mobility : undefined
    const have = typeof raw === 'number' ? raw : 0
    const want = Number(mobility[3])
    const op = mobility[2]!
    const ok =
      op === '>=' ? have >= want
        : op === '>' ? have > want
          : op === '<=' ? have <= want
            : op === '<' ? have < want
              : have === want
    if (ok) return undefined
    return `need ${text} (have ${have})`
  }
  const fact = FACT_NEED.exec(text)
  if (!fact) return `bad travel need ${text}`
  const key = fact[1]!
  const op = fact[2]!
  const want = fact[3]!.trim()
  const have = state.facts[key]
  const haveText = have === undefined || have === null ? '' : String(have)
  const ok = op === '!=' ? haveText !== want : haveText === want
  if (ok) return undefined
  return `need ${text} (have ${haveText || '(empty)'})`
}
