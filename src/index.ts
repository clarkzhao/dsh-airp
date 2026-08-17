import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Json } from './kernel/types.ts'
import { receiptText } from './host/translate.ts'
import { HostRuntime } from './host/runtime.ts'
import { bootQuestion, isPlayPreset, listPackIds, openRuntime, pathQuestion, presetFromSession, resolveBootChoice, resolvePathAnswer, sessionIsBlank, shouldBootStory } from './host/boot.ts'

function sessionKey(exec: { agent?: { session?: { id?: string }; id?: string } } | undefined): string {
  return exec?.agent?.session?.id ?? exec?.agent?.id ?? 'default'
}

export const name = 'airp'
export const inject = ['tools']

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
    const created = await openRuntime({
      packsDir,
      sessionId: key,
      choice: { kind: 'bundled', packId: config.defaultPack ?? 'lotm-tingen' },
    })
    if (config.loreBudgetChars) created.canon.meta.loreBudgetChars = config.loreBudgetChars
    runtimes.set(key, created)
    return created
  }

  const sessionPreset = (agent: {
    session?: { header?: { agentPreset?: string }; events?: ReadonlyArray<{ type?: string; data?: { agentPreset?: string } }> }
    ctx?: unknown
  }) => {
    const fromLog = presetFromSession(agent.session)
    if (fromLog) return fromLog
    const presets = ctx.get('agentPresets')
    if (presets && agent.ctx) return presets.composedPreset(agent.ctx as never)
    return undefined
  }

  const maybeBoot = (agent: { id: string; inject: (msg: never) => void; session?: { events?: ReadonlyArray<{ type?: string }> } }, source?: string) => {
    if (runtimes.has(String(agent.id))) return
    if (!shouldBootStory({
      presetId: sessionPreset(agent),
      source,
      blank: sessionIsBlank(agent.session),
      alreadyBooted: runtimes.has(String(agent.id)),
    })) return
    void bootSession(agent)
  }

  const askChoice = async (agent: unknown, lastError?: string) => {
    const questions = ctx.get('userQuestions')
    if (!questions) return { kind: 'bundled' as const, packId: config.defaultPack ?? 'lotm-tingen' }
    const ids = await listPackIds(packsDir)
    let choice = lastError
      ? resolvePathAnswer(await questions.ask({ questions: pathQuestion(lastError).questions, agent: agent as never }))
      : resolveBootChoice(await questions.ask({ questions: bootQuestion(ids).questions, agent: agent as never }))
    let error = lastError
    while (choice.kind === 'need-path') {
      const again = await questions.ask({ questions: pathQuestion(error).questions, agent: agent as never })
      choice = resolvePathAnswer(again)
      if (choice.kind === 'need-path') error = '没有读到路径。请粘贴含 pack.yaml 的目录。'
    }
    return choice
  }

  const bootSession = async (agent: { id: string; inject: (msg: never) => void }) => {
    const key = String(agent.id)
    let choice = await askChoice(agent)
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const created = await openRuntime({ packsDir, sessionId: key, choice })
        if (config.loreBudgetChars) created.canon.meta.loreBudgetChars = config.loreBudgetChars
        runtimes.set(key, created)
        agent.inject({
          content: [{ type: 'text', text: created.bootBrief() }],
          source: { kind: 'plugin', plugin: 'dsh-airp' },
        } as never)
        return created
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        choice = await askChoice(agent, message)
      }
    }
    throw new Error('无法加载所选世界包')
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
          if (inv.agent && name !== 'ooc') {
              const inject = (inv.agent as { inject?: (msg: never) => void }).inject
              if (typeof inject === 'function') {
                try {
                  inject({
                    content: [{ type: 'text', text: 'AIRP /' + name + ' 引擎结果（内存存档，不是磁盘文件）：\n' + out.text }],
                    source: { kind: 'user' },
                  } as never)
                } catch (e) {}
              }
            }
            return { kind: out.ok ? 'success' as const : 'error' as const, text: out.text }
        },
      })
    }
  }

  const systemPrompt = ctx.get('systemPrompt')
  if (systemPrompt) {
    systemPrompt.context({
      name: 'airp:index',
      order: 40,
      text: (assembly) => {
        const agent = (assembly as { agent?: { id?: string } }).agent
        if (!agent?.id) return ''
        const cached = runtimes.get(String(agent.id))
        return cached ? cached.indexText() : ''
      },
    })
  }

  ctx.on('agent/session-start', (payload) => {
    maybeBoot(payload.agent, payload.source)
  })

  ctx.on('session/event', (session, event) => {
    const typed = event as { type?: string; data?: { agentPreset?: string } }
    if (typed.type !== 'agent-preset/selected') return
    if (!isPlayPreset(typed.data?.agentPreset)) return
    const agents = ctx.get('agents')
    const agent = agents?.get(session.id)
    if (!agent) return
    maybeBoot(agent, 'startup')
  })

  ctx.on('agent/pre-step', async (payload, next) => {
    const agent = payload.agent as { id: string; inject: (msg: never) => void; session?: { header?: { agentPreset?: string } }; ctx?: unknown }
    if (!isPlayPreset(sessionPreset(agent))) return next()
    const texts = (payload.messages ?? []).flatMap((message) => {
      const source = (message as { source?: { kind?: string } }).source?.kind
      if (source !== 'user') return []
      const content = (message as { content?: Array<{ type?: string; text?: string }> }).content
      if (!Array.isArray(content)) return []
      return content.filter((part) => part?.type === 'text' && part.text).map((part) => part.text as string)
    })
    const text = texts.join('\n')
    if (!text) return next()
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
export { shouldBootStory, resolveBootChoice, resolvePathAnswer } from './host/boot.ts'
