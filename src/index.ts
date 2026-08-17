import { resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { WorldKernel } from './kernel/world-kernel.js'
import type { Json, WorldState } from './kernel/types.js'
import { initialState, loadPack } from './pack/pack.js'
import { intentFromCommand, intentFromTool, receiptText } from './host/translate.js'

function sessionKey(exec: { agent?: { session?: { id?: string }; id?: string } } | undefined): string {
  return exec?.agent?.session?.id ?? exec?.agent?.id ?? 'default'
}

export const name = 'airp'

export interface Config {
  packsDir?: string
  defaultPack?: string
  loreBudgetChars?: number
}

export const Config: z<Config> = z.object({
  packsDir: z.string().default('packs'),
  defaultPack: z.string().default('lotm-tingen'),
  loreBudgetChars: z.number().default(4000),
})

export function apply(ctx: Context, config: Config): void {
  const packsDir = resolve(process.cwd(), config.packsDir ?? 'packs')
  const sessions = new Map<string, { kernel: WorldKernel; state: WorldState; events: unknown[]; indexText: string }>()

  const loadSession = async (key: string, packId = config.defaultPack ?? 'lotm-tingen') => {
    const hit = sessions.get(key)
    if (hit) return hit
    const loaded = await loadPack(resolve(packsDir, packId))
    if (!loaded.ok || !loaded.canon) {
      throw new Error(`airp: failed to load pack ${packId}: ${loaded.diagnostics.map((d) => d.message).join('; ')}`)
    }
    if (config.loreBudgetChars) loaded.canon.meta.loreBudgetChars = config.loreBudgetChars
    const kernel = new WorldKernel(loaded.canon)
    const indexText = [
      `AIRP pack ${loaded.canon.meta.id} — ${loaded.canon.meta.title}`,
      `checks: ${loaded.canon.index.checks.join(', ')}`,
      `characters: ${loaded.canon.index.characters.join(', ')}`,
      `lore: ${loaded.canon.index.lore.join(', ')}`,
      'Numeric fields only change via check.propose or /gm. Walking is not a check.',
    ].join('\n')
    const created = { kernel, state: initialState(loaded.canon, `${packId}:${key}`), events: [] as unknown[], indexText }
    sessions.set(key, created)
    return created
  }

  const tools = ctx.get('tools')
  if (tools) {
    const jsonOut = {
      schema: { type: 'json' as const },
      render(_args: unknown, value: unknown) {
        return [{ type: 'text' as const, text: typeof value === 'string' ? value : JSON.stringify(value) }]
      },
    }

    tools.register(defineTool({
      name: 'lore.get',
      description: 'Fetch a Canon lore document by key. Does not change numeric state.',
      parameters: { key: { type: 'string', required: true, description: 'lore key from the thin index' } },
      output: jsonOut,
      async execute(args, exec) {
        const session = await loadSession(sessionKey(exec))
        const intent = intentFromTool('lore.get', args)
        if ('error' in intent) throw new Error(intent.error)
        const result = session.kernel.turn(session.state, intent)
        if (result.ok) session.state = result.state
        return receiptText(result)
      },
    }))

    tools.register(defineTool({
      name: 'state.read',
      description: 'Read the current world state projection, optionally at a pointer.',
      parameters: { pointer: { type: 'string', description: 'optional JSON pointer like facts.weather' } },
      output: jsonOut,
      async execute(args, exec) {
        const session = await loadSession(sessionKey(exec))
        const intent = intentFromTool('state.read', args)
        if ('error' in intent) throw new Error(intent.error)
        return receiptText(session.kernel.turn(session.state, intent))
      },
    }))

    tools.register(defineTool({
      name: 'check.propose',
      description: 'Propose an adjudication. Numeric fields only change if the engine accepts.',
      parameters: {
        checkId: { type: 'string', required: true, description: 'Canon check id' },
        actors: { type: 'object', additionalProperties: true, description: 'slot -> character id' },
      },
      output: jsonOut,
      async execute(args, exec) {
        const session = await loadSession(sessionKey(exec))
        const intent = intentFromTool('check.propose', args)
        if ('error' in intent) throw new Error(intent.error)
        const result = session.kernel.turn(session.state, intent)
        if (result.ok) {
          session.state = result.state
          session.events.push(...result.events)
        }
        return receiptText(result)
      },
    }))

    tools.register(defineTool({
      name: 'state.propose_fact',
      description: 'Propose a narrative fact. Guarded numeric pointers are rejected.',
      parameters: {
        pointer: { type: 'string', required: true },
        value: { type: 'json', required: true },
      },
      output: jsonOut,
      async execute(args, exec) {
        const session = await loadSession(sessionKey(exec))
        const intent = intentFromTool('state.propose_fact', args)
        if ('error' in intent) throw new Error(intent.error)
        const result = session.kernel.turn(session.state, intent)
        if (result.ok) {
          session.state = result.state
          session.events.push(...result.events)
        }
        return receiptText(result)
      },
    }))

    tools.register(defineTool({
      name: 'check.match',
      description: 'Evaluate author conditions against tags. If a check is forced, call check.propose with the returned actors.',
      parameters: {
        tags: { type: 'array', items: { type: 'string' }, required: true },
        actors: { type: 'object', additionalProperties: true },
      },
      output: jsonOut,
      async execute(args, exec) {
        const session = await loadSession(sessionKey(exec))
        const tags = Array.isArray(args.tags) ? args.tags.map(String) : []
        const actors = args.actors && typeof args.actors === 'object' ? Object.fromEntries(Object.entries(args.actors).map(([k, v]) => [k, String(v)])) : {}
        return JSON.parse(JSON.stringify(session.kernel.match(session.state, tags, actors))) as Json
      },
    }))

    tools.register(defineTool({
      name: 'pack.validate',
      description: 'Validate the current world pack. Author preset only.',
      parameters: { packId: { type: 'string', description: 'pack directory name' } },
      output: jsonOut,
      async execute(args) {
        const packId = typeof args.packId === 'string' && args.packId ? args.packId : (config.defaultPack ?? 'lotm-tingen')
        const loaded = await loadPack(resolve(packsDir, packId))
        return JSON.parse(JSON.stringify({ ok: loaded.ok, diagnostics: loaded.diagnostics })) as { ok: boolean; diagnostics: { code: string; message: string }[] }
      },
    }))
  }

  const commands = ctx.get('commands')
  if (commands) {
    const handle = async (name: string, rawInput: string, key: string) => {
      const parsed = intentFromCommand(name, rawInput)
      if ('error' in parsed) return { kind: 'error' as const, text: parsed.error }
      if ('fork' in parsed) return { kind: 'success' as const, text: 'retry requires sessions.fork in the host UI; kernel does not time-travel.' }
      if ('ooc' in parsed) return { kind: 'success' as const, text: parsed.ooc ? `ooc noted: ${parsed.ooc}` : 'ooc' }
      const session = await loadSession(key)
      const result = session.kernel.turn(session.state, parsed)
      if (result.ok) {
        session.state = result.state
        session.events.push(...result.events)
      }
      return { kind: result.ok ? 'success' as const : 'error' as const, text: receiptText(result) }
    }
    for (const name of ['look', 'state', 'retry', 'gm', 'correct', 'ooc']) {
      commands.register({
        name,
        description: `AIRP director command /${name}`,
        handler: async (inv: { rawInput: string; agent?: { session?: { id?: string }; id?: string } }) =>
          handle(name, inv.rawInput, sessionKey(inv)),
      })
    }
  }

  const systemPrompt = ctx.get('systemPrompt')
  if (systemPrompt) {
    void loadSession('default').catch(() => undefined)
    systemPrompt.context({
      name: 'airp:index',
      order: 40,
      text: () => {
        const cached = [...sessions.values()][0]
        return cached?.indexText ?? `AIRP pack ${config.defaultPack ?? 'lotm-tingen'}. Use lore.get / state.read / check.propose.`
      },
    })
  }
}

export { WorldKernel } from './kernel/world-kernel.js'
export { loadPack, validatePack, initialState } from './pack/pack.js'
export { intentFromTool, intentFromCommand, toolsFor } from './host/translate.js'
