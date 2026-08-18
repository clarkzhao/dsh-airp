import type { Canon, Intent, StoryEvent, TurnOptions, TurnResult, WorldState } from '../kernel/types.ts'
import { WorldKernel } from '../kernel/world-kernel.ts'
import { initialState, isError, validatePack, type PackDiagnostic } from '../pack/pack.ts'
import { intentFromCommand, intentFromTool, receiptText, toolsFor, type PlayRole } from './translate.ts'

export type HostRequest =
  | { kind: 'tool'; name: string; args: Record<string, unknown>; role?: PlayRole; u?: number }
  | { kind: 'command'; name: string; rawInput?: string; role?: PlayRole }
  | { kind: 'ic'; tags: string[]; actors?: Record<string, string>; u?: number }

export interface HostResponse {
  ok: boolean
  text: string
  result: TurnResult
  forced?: boolean
  forkedFrom?: string
  sessionId: string
  diagnostics?: PackDiagnostic[]
}

export interface HostSnapshot {
  sessionId: string
  state: WorldState
  events: StoryEvent[]
}

export class HostRuntime {
  readonly canon: Canon
  private readonly kernel: WorldKernel
  private readonly opening: WorldState
  private state: WorldState
  private log: StoryEvent[]
  private id: string
  private readonly role: PlayRole

  constructor(opts: { canon: Canon; sessionId: string; seed: string; role?: PlayRole }) {
    this.canon = opts.canon
    this.kernel = new WorldKernel(opts.canon)
    this.opening = initialState(opts.canon, opts.seed)
    this.state = structuredClone(this.opening)
    this.log = []
    this.id = opts.sessionId
    this.role = opts.role ?? 'play'
  }

  get sessionId(): string {
    return this.id
  }

  events(): StoryEvent[] {
    return this.log.map((e) => structuredClone(e))
  }

  snapshot(): HostSnapshot {
    return { sessionId: this.id, state: structuredClone(this.state), events: this.events() }
  }

  indexText(): string {
    return [
      `AIRP pack ${this.canon.meta.id} — ${this.canon.meta.title}`,
      `checks: ${this.canon.index.checks.join(', ')}`,
      `characters: ${this.canon.index.characters.join(', ')}`,
      `lore: ${this.canon.index.lore.join(', ')}`,
      'Numeric fields only change via check_propose or /gm. Walking is not a check.',
    ].join('\n')
  }

  bootBrief(): string {
    const key = ['commission', 'jzdh-commission'].find((id) => this.canon.lore[id])
      ?? Object.keys(this.canon.lore).find((id) => id.includes('commission'))
    const commission = key ? this.kernel.turn(this.state, { type: 'lore', key }) : undefined
    const lore = commission?.ok && commission.receipt.kind === 'lore' ? commission.receipt.body : ''
    const extra = lore ? `\n委托：\n${lore}` : ''
    const sceneHint = this.state.scene.includes('tingen') ? '开场直接叙述当前据点。' : '开场直接叙述当前场景。'
    return `${this.indexText()}\nscene: ${this.state.scene}\npresent: ${this.state.present.join(', ')}${extra}\n\n你已经在引擎里。禁止再问引擎在哪、不要扫工作区、不要用 ask_user_question 找路径。\n${sceneHint}用 lore_get / state_read / check_propose / state_propose_fact。`
  }

  dispatch(req: HostRequest): HostResponse {
    if (req.kind === 'ic') return this.forceIc(req.tags, req.actors ?? {}, req.u)
    if (req.kind === 'command') return this.command(req.name, req.rawInput ?? '', req.role ?? this.role)
    return this.tool(req.name, req.args, req.role ?? this.role, req.u)
  }

  private tool(name: string, args: Record<string, unknown>, role: PlayRole, u?: number): HostResponse {
    if (!toolsFor(role).includes(name as typeof PLAY_OK)) {
      return this.fail(`tool ${name} is not visible to ${role}`)
    }
    if (name === 'pack_validate') {
      const diagnostics = validatePack(this.canon)
      const ok = !diagnostics.some(isError)
      return {
        ok,
        text: JSON.stringify({
          ok,
          packId: this.canon.meta.id,
          diagnostics: diagnostics.map((d) => ({ ...d, severity: d.severity ?? 'error' })),
        }),
        result: { ok: true, state: this.state, receipt: { kind: 'empty' }, events: [] },
        sessionId: this.id,
        diagnostics,
      }
    }
    if (name === 'check_match') {
      const tags = Array.isArray(args.tags) ? args.tags.map(String) : []
      const actors = asActors(args.actors)
      const forced = this.kernel.match(this.state, tags, actors)
      return {
        ok: true,
        text: JSON.stringify(forced),
        result: { ok: true, state: this.state, receipt: { kind: 'empty' }, events: [] },
        sessionId: this.id,
        forced: forced.length > 0,
      }
    }
    const intent = intentFromTool(name, args)
    if ('error' in intent) return this.fail(intent.error)
    return this.applyIntent(intent, u !== undefined ? { u } : {})
  }

  private command(name: string, rawInput: string, _role: PlayRole): HostResponse {
    const parsed = intentFromCommand(name, rawInput)
    if ('error' in parsed) return this.fail(parsed.error)
    if ('ooc' in parsed) {
      return {
        ok: true,
        text: parsed.ooc ? `ooc noted: ${parsed.ooc}` : 'ooc',
        result: { ok: true, state: this.state, receipt: { kind: 'empty' }, events: [] },
        sessionId: this.id,
      }
    }
    if ('fork' in parsed) return this.retry(parsed.checkId)
    return this.applyIntent(parsed)
  }

  private forceIc(tags: string[], actors: Record<string, string>, u?: number): HostResponse {
    this.stageActors(Object.values(actors))
    const forced = this.kernel.match(this.state, tags, actors)
    if (forced.length === 0) {
      return {
        ok: true,
        text: 'no transition',
        forced: false,
        result: { ok: true, state: this.state, receipt: { kind: 'empty' }, events: [] },
        sessionId: this.id,
      }
    }
    const first = forced[0]!
    const result = this.applyIntent({ type: 'check', checkId: first.checkId, actors: first.actors }, u !== undefined ? { u } : {})
    return { ...result, forced: true }
  }

  private retry(checkId?: string): HostResponse {
    const parent = this.id
    const cut = lastCheckIndex(this.log, checkId)
    if (cut < 0) return this.fail('nothing to retry')
    this.log = this.log.slice(0, cut)
    this.state = replay(this.kernel, this.opening, this.log)
    this.id = `${parent}~retry`
    return {
      ok: true,
      text: `retried to before check; new line ${this.id}`,
      forkedFrom: parent,
      result: { ok: true, state: this.state, receipt: { kind: 'empty' }, events: [] },
      sessionId: this.id,
    }
  }

  private stageActors(ids: string[]): void {
    const next = [...this.state.present]
    for (const id of ids) {
      if (!id || !this.state.characters[id] || next.includes(id)) continue
      next.push(id)
    }
    if (next.length !== this.state.present.length) this.state.present = next
  }

  private applyIntent(intent: Intent, options: TurnOptions = {}): HostResponse {
    const result = this.kernel.turn(this.state, intent, options)
    if (result.ok) {
      this.state = result.state
      this.log.push(...result.events)
    }
    return {
      ok: result.ok,
      text: receiptText(result),
      result,
      sessionId: this.id,
    }
  }

  private fail(text: string): HostResponse {
    return {
      ok: false,
      text,
      result: { ok: false, code: 'UNKNOWN_CHECK', message: text, state: this.state, receipt: { kind: 'empty' }, events: [] },
      sessionId: this.id,
    }
  }
}

const PLAY_OK = 'lore_get'

function asActors(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') return {}
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, String(v)]))
}

function lastCheckIndex(events: StoryEvent[], checkId?: string): number {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i]!
    if (event.type !== 'check') continue
    if (!checkId || event.check_id === checkId) return i
  }
  return -1
}

function replay(kernel: WorldKernel, opening: WorldState, events: StoryEvent[]): WorldState {
  let state = structuredClone(opening)
  for (const event of events) {
    if (event.type === 'check') {
      const next = kernel.turn(state, {
        type: 'check',
        checkId: event.check_id,
        actors: event.actors,
      }, { u: event.xi.u })
      if (next.ok) state = next.state
      continue
    }
    if (event.type === 'fact' || event.type === 'correct') {
      const next = kernel.turn(state, { type: event.type, pointer: event.pointer, value: event.value })
      if (next.ok) state = next.state
      continue
    }
    if (event.type === 'gm') {
      const next = kernel.turn(state, { type: 'gm', patch: event.patch, reason: event.reason })
      if (next.ok) state = next.state
    }
  }
  return state
}


