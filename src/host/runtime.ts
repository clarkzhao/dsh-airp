import type { Canon, Intent, StoryEvent, TurnOptions, TurnResult, WorldState } from '../kernel/types.ts'
import { WorldKernel } from '../kernel/world-kernel.ts'
import { applySeating, initialState, isError, loreKeyCandidates, resolveLoreKey, validatePack, type PackDiagnostic } from '../pack/pack.ts'
import type { OpeningSeat } from '../kernel/types.ts'
import { tagsFromMeta } from '../pack/catalog.ts'
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

  constructor(opts: { canon: Canon; sessionId: string; seed: string; role?: PlayRole; seat?: OpeningSeat }) {
    this.canon = opts.canon
    this.kernel = new WorldKernel(opts.canon)
    this.opening = applySeating(initialState(opts.canon, opts.seed), opts.canon, opts.seat)
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
    const job = this.loreBody(resolveLoreKey(
      Object.keys(this.canon.lore).filter((id) => id.includes('commission')),
      this.canon.lore,
    ))
    const place = this.loreBody(resolveLoreKey(loreKeyCandidates(this.state.scene), this.canon.lore))
    const lexicon = tagsFromMeta(this.canon.meta)
    const tagLine = Object.entries(lexicon).map(([tag, words]) => `${tag}←${words.slice(0, 4).join('/')}`).join('；')
    const facts = Object.entries(this.state.facts)
      .filter(([k]) => !k.startsWith('__'))
      .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
      .join(', ')
    return [
      `AIRP pack ${this.canon.meta.id} — ${this.canon.meta.title}`,
      `checks: ${this.canon.index.checks.join(', ')}`,
      `characters: ${this.canon.index.characters.join(', ')}`,
      `lore: ${this.canon.index.lore.join(', ')}`,
      `pc: ${this.state.present[0] ?? '(none)'}`,
      `scene: ${this.state.scene}`,
      `present: ${this.state.present.join(', ')}`,
      facts ? `facts: ${facts}` : '',
      this.travelLine(),
      tagLine ? `鉴定词：${tagLine}` : '',
      place ? `场景：\n${place}` : '',
      job ? `委托：\n${job}` : '',
      this.arrivalNote(),
      'Numeric fields only change via check_propose or /gm. Walking is not a check.',
    ].filter((line) => line !== undefined && line !== '').join('\n')
  }

  private loreBody(key: string | undefined): string {
    if (!key) return ''
    const result = this.kernel.turn(this.state, { type: 'lore', key })
    return result.ok && result.receipt.kind === 'lore' ? result.receipt.body : ''
  }

  bootBrief(): string {
    return [
      this.indexText(),
      '',
      '你已经在引擎里。禁止再问引擎在哪、不要扫工作区、不要用 ask_user_question 找路径。',
      '开场直接叙述当前场景。用 lore_get / state_read / check_propose / state_propose_fact。',
    ].join('\n')
  }

  private travelLine(): string {
    const places = this.canon.meta.places
    if (!places) return ''
    const beat = typeof this.state.clock?.beat === 'number' ? this.state.clock.beat : 0
    const pc = this.state.present[0]
    const mobility = pc && typeof this.state.characters[pc]?.mobility === 'number' ? this.state.characters[pc]!.mobility : 0
    const here = places[this.state.scene]
    const hops = Object.entries(here?.edges ?? {}).map(([to, edge]) => {
      const need = edge.need ? ` ${edge.need}` : ''
      return `${to}${edge.beats ? `:${edge.beats}拍` : ''}${need}`
    })
    return `clock.beat=${beat} mobility=${mobility}${hops.length ? ` 邻接 ${hops.join('；')}` : ''}`
  }

  private arrivalNote(): string {
    if (this.state.facts.play_mode !== 'custom') return ''
    const bits = [
      this.state.facts.pc_name && `自称 ${this.state.facts.pc_name}`,
      this.state.facts.pc_age && `${this.state.facts.pc_age} 岁`,
      this.state.facts.pc_vocation && `营生：${this.state.facts.pc_vocation}`,
      this.state.facts.pc_origin && `来历：${this.state.facts.pc_origin}`,
      this.state.facts.pc_birthplace && `籍贯：${this.state.facts.pc_birthplace}`,
      this.state.facts.pc_ties && `关系：${this.state.facts.pc_ties}`,
    ].filter(Boolean)
    const sameNight = this.state.facts.arrival === 'same-night-as-ding'
    return [
      bits.length ? `自拟穿越者：${bits.join('；')}` : '自拟穿越者。',
      sameNight
        ? '切入夜与丁松言借尸还魂同一夜。对外可称离魂失忆。丁松言仍在定江府，两条线可能相交，不要抢他的底牌。'
        : '',
    ].filter(Boolean).join('\n')
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


