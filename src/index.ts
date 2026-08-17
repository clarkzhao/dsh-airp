import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Json } from './kernel/types.ts'
import { loadPack } from './pack/pack.ts'
import { receiptText } from './host/translate.ts'
import { HostRuntime } from './host/runtime.ts'

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
  const bundledPacks = resolve(dirname(fileURLToPath(import.meta.url)), '../packs')
  const packsDir = resolve(config.packsDir && config.packsDir !== 'packs' ? config.packsDir : bundledPacks)
  const runtimes = new Map<string, HostRuntime>()

  const loadRuntime = async (key: string) => {
    const hit = runtimes.get(key)
    if (hit) return hit
    const packId = config.defaultPack ?? 'lotm-tingen'
    const loaded = await loadPack(resolve(packsDir, packId))
    if (!loaded.ok || !loaded.canon) {
      throw new Error(`airp: failed to load pack ${packId}: ${loaded.diagnostics.map((d) => d.message).join('; ')}`)
    }
    if (config.loreBudgetChars) loaded.canon.meta.loreBudgetChars = config.loreBudgetChars
    const created = new HostRuntime({ canon: loaded.canon, sessionId: key, seed: `${packId}:${key}` })
    runtimes.set(key, created)
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

    const runTool = async (name: string, args: Record<string, unknown>, exec: { agent?: { session?: { id?: string }; id?: string } }) => {
      const rt = await loadRuntime(sessionKey(exec))
      const out = rt.dispatch({ kind: 'tool', name, args })
      if (!out.ok && name !== 'pack.validate') throw new Error(out.text)
      return name === 'pack.validate' || name === 'check.match' ? JSON.parse(out.text) as Json : out.text
    }

    tools.register(defineTool({
      name: 'lore.get',
      description: 'Fetch a Canon lore document by key. Does not change numeric state.',
      parameters: { key: { type: 'string', required: true, description: 'lore key from the thin index' } },
      output: jsonOut,
      execute: (args, exec) => runTool('lore.get', args, exec),
    }))

    tools.register(defineTool({
      name: 'state.read',
      description: 'Read the current world state projection, optionally at a pointer.',
      parameters: { pointer: { type: 'string', description: 'optional JSON pointer like facts.weather' } },
      output: jsonOut,
      execute: (args, exec) => runTool('state.read', args, exec),
    }))

    tools.register(defineTool({
      name: 'check.propose',
      description: 'Propose an adjudication. Numeric fields only change if the engine accepts.',
      parameters: {
        checkId: { type: 'string', required: true, description: 'Canon check id' },
        actors: { type: 'object', additionalProperties: true, description: 'slot -> character id' },
      },
      output: jsonOut,
      execute: (args, exec) => runTool('check.propose', args, exec),
    }))

    tools.register(defineTool({
      name: 'state.propose_fact',
      description: 'Propose a narrative fact. Guarded numeric pointers are rejected.',
      parameters: {
        pointer: { type: 'string', required: true },
        value: { type: 'json', required: true },
      },
      output: jsonOut,
      execute: (args, exec) => runTool('state.propose_fact', args, exec),
    }))

    tools.register(defineTool({
      name: 'check.match',
      description: 'Evaluate author conditions against tags. If a check is forced, call check.propose with the returned actors.',
      parameters: {
        tags: { type: 'array', items: { type: 'string' }, required: true },
        actors: { type: 'object', additionalProperties: true },
      },
      output: jsonOut,
      execute: (args, exec) => runTool('check.match', args, exec),
    }))

    tools.register(defineTool({
      name: 'pack.validate',
      description: 'Validate the current world pack. Author preset only.',
      parameters: { packId: { type: 'string', description: 'pack directory name' } },
      output: jsonOut,
      execute: (args, exec) => runTool('pack.validate', args, exec),
    }))
  }

  const commands = ctx.get('commands')
  if (commands) {
    for (const name of ['look', 'state', 'retry', 'gm', 'correct', 'ooc']) {
      commands.register({
        name,
        description: `AIRP director command /${name}`,
        handler: async (inv: { rawInput: string; agent?: { session?: { id?: string }; id?: string } }) => {
          const rt = await loadRuntime(sessionKey(inv))
          const out = rt.dispatch({ kind: 'command', name, rawInput: inv.rawInput })
          if (out.forkedFrom) {
            runtimes.set(rt.sessionId, rt)
            const sessions = ctx.get('sessions') as { fork?: (id: string) => unknown } | undefined
            const sourceId = inv.agent?.session?.id
            if (sessions?.fork && sourceId) {
              try { sessions.fork(sourceId) } catch { /* world state already forked */ }
            }
          }
          return { kind: out.ok ? 'success' as const : 'error' as const, text: out.text }
        },
      })
    }
  }

  const systemPrompt = ctx.get('systemPrompt')
  if (systemPrompt) {
    void loadRuntime('default').catch(() => undefined)
    systemPrompt.context({
      name: 'airp:index',
      order: 40,
      text: () => {
        const cached = [...runtimes.values()][0]
        return cached?.indexText() ?? `AIRP pack ${config.defaultPack ?? 'lotm-tingen'}. Use lore.get / state.read / check.propose.`
      },
    })
  }

  ctx.on('agent/pre-step', async (payload, next) => {
    const text = JSON.stringify(payload.messages ?? [])
    const tags: string[] = []
    if (/对抗|交手|动手|战斗|偷袭|拦住/.test(text)) tags.push('contest')
    if (/扮演|消化|魔药/.test(text)) tags.push('digest')
    if (/失控|污染|低语/.test(text)) tags.push('lose_control')
    if (tags.length === 0) return next()
    try {
      const rt = await loadRuntime(String(payload.agent.id))
      const present = rt.snapshot().state.present
      const actors: Record<string, string> = present.length >= 2 ? { attacker: present[0]!, defender: present[1]! } : {}
      const out = rt.dispatch({ kind: 'ic', tags, actors })
      if (out.forced && out.result.ok) {
        payload.agent.inject({
          content: [{ type: 'text', text: `Forced AIRP check already resolved:\n${receiptText(out.result)}\nNarrate only this receipt. Do not re-adjudicate.` }],
          source: { kind: 'user' },
        } as never)
      }
    } catch { /* do not block the turn */ }
    return next()
  })
}

export { WorldKernel } from './kernel/world-kernel.ts'
export { loadPack, validatePack, initialState } from './pack/pack.ts'
export { intentFromTool, intentFromCommand, toolsFor } from './host/translate.ts'
export { HostRuntime } from './host/runtime.ts'
