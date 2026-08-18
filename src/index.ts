import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Json } from './kernel/types.ts'
import { denyAuthorTool, receiptText, roleFromPreset } from './host/translate.ts'
import { HostRuntime } from './host/runtime.ts'
import { bootQuestionFromRefs, isAskCancelled, isAuthorPreset, isPlayPreset, mergeBootAnswers, openRuntime, pathQuestion, PICK_NEW_PACK, presetFromSession, resolveBootChoice, resolvePathAnswer, resolveSeating, seatingNeedsTraveler, seatingQuestion, sessionIsBlank, shouldBootStory, travelerQuestion } from './host/boot.ts'
import { expandUserPath, loadCatalog, matchTags, resolveIcActors, resolvePackDir, tagsFromMeta, userPacksDir, type PackRef } from './pack/catalog.ts'
import { loadPack, playableCharacters, playableScenes } from './pack/pack.ts'
import { playHandoff } from './pack/handoff.ts'
import { interviewCard, interviewScreens, parseInterview } from './pack/interview.ts'
import { scaffoldPack } from './pack/scaffold.ts'

function sessionKey(exec: { agent?: { session?: { id?: string }; id?: string } } | undefined): string {
  return exec?.agent?.session?.id ?? exec?.agent?.id ?? 'default'
}

export const name = 'airp'
export const inject = ['tools']

export interface Config {
  packsDir?: string
  userPacksDir?: string
  defaultPack?: string
  loreBudgetChars?: number
}

export const Config: z<Config> = z.object({
  packsDir: z.string().default('packs'),
  userPacksDir: z.string().default(''),
  defaultPack: z.string().default('lotm-tingen'),
  loreBudgetChars: z.number().default(4000),
})

export function apply(ctx: Context, config: Config): void {
  const bundledPacks = resolve(dirname(fileURLToPath(import.meta.url)), '../packs')
  const packsDir = resolve(config.packsDir && config.packsDir !== 'packs' ? config.packsDir : bundledPacks)
  const extraUserDir = config.userPacksDir ? config.userPacksDir : undefined
  const runtimes = new Map<string, HostRuntime>()
  const lastScaffold = new Map<string, string>()
  const blocked = new Set<string>()

  const catalogOf = () => loadCatalog({ bundledDir: packsDir, userDir: extraUserDir })

  const loadRuntime = async (key: string) => {
    const hit = runtimes.get(key)
    if (hit) return hit
    if (blocked.has(key)) throw new Error('AIRP boot was cancelled. Pick a pack again in a new session; do not fall back to tingen.')
    throw new Error('AIRP world is not loaded. Finish the opening card first.')
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
    void bootSession(agent).catch((error) => {
      if (isAskCancelled(error)) {
        blocked.add(String(agent.id))
        return
      }
    })
  }

  const authorQuestion = (packs: PackRef[]) => {
    const q = bootQuestionFromRefs(packs)
    q.questions[0]!.header = '编辑世界'
    q.questions[0]!.question = '创造者会话：选一个已有包改，或从零写。官方 demo 只读参考；你的包写到 ~/.dsh/airp-packs/<id>/。'
    q.questions[0]!.options = [
      ...(q.questions[0]!.options ?? []),
      { label: PICK_NEW_PACK, description: '用 ask-user 八问生成一个空包骨架，再校验。' },
    ]
    return q
  }

  const askChoice = async (agent: unknown, lastError?: string, author = false) => {
    const questions = ctx.get('userQuestions')
    if (!questions) return { kind: 'bundled' as const, packId: config.defaultPack ?? 'lotm-tingen' }
    const catalog = await catalogOf()
    let choice = lastError
      ? resolvePathAnswer(await questions.ask({ questions: pathQuestion(lastError).questions, agent: agent as never }))
      : resolveBootChoice(await questions.ask({
        questions: (author ? authorQuestion(catalog.packs) : bootQuestionFromRefs(catalog.packs)).questions,
        agent: agent as never,
      }), catalog.packs)
    let error = lastError
    while (choice.kind === 'need-path') {
      const again = await questions.ask({ questions: pathQuestion(error).questions, agent: agent as never })
      choice = resolvePathAnswer(again)
      if (choice.kind === 'need-path') error = '没有读到路径。请粘贴含 pack.yaml 的目录。'
    }
    return choice
  }

  const askSeating = async (agent: unknown, dir: string) => {
    const questions = ctx.get('userQuestions')
    if (!questions) return undefined
    const loaded = await loadPack(dir)
    if (!loaded.ok || !loaded.canon) return undefined
    if (playableCharacters(loaded.canon).length + playableScenes(loaded.canon).length === 0) return undefined
    const answer = await questions.ask({ questions: seatingQuestion(loaded.canon).questions, agent: agent as never })
    const draft = resolveSeating(answer, loaded.canon)
    if (!seatingNeedsTraveler(draft)) return draft
    const bio1 = await questions.ask({ questions: travelerQuestion(1).questions, agent: agent as never })
    const bio2 = await questions.ask({ questions: travelerQuestion(2).questions, agent: agent as never })
    return resolveSeating(answer, loaded.canon, mergeBootAnswers(bio1, bio2))
  }

  const authorGuide = [
    '你是 AIRP 创造者，不是消费者。',
    `用户世界包目录：${userPacksDir(extraUserDir)}`,
    '官方 demo（只读参考）：packs/lotm-tingen、packs/jzdh-dingjiang。不要改 demo 当用户作品。',
    '流程：pack_interview({screen:1}) 再 screen:2 → ask_user_question 原样问 → pack_scaffold（kebab-case id）→ pack_validate → pack_open_play。',
    '用户要先扫小说、改官方 demo、贴全书、复刻 ST 31 字段：拒绝，继续八问。',
    '一条 lore 一个概念。角色卡不写进度数字。数值只经 check / gm。',
    '试跑鉴定用同一套 check_propose。不要发明第二套规则引擎。',
    '已有产出的会话不能热切 preset。pack_open_play 只给交接说明，用户必须新开 airp-play。',
  ].join('\n')

  const bootSession = async (agent: { id: string; inject: (msg: never) => void }) => {
    const key = String(agent.id)
    let choice
    const author = isAuthorPreset(sessionPreset(agent as never))
    try {
      choice = await askChoice(agent, undefined, author)
    } catch (err) {
      if (isAskCancelled(err)) {
        blocked.add(key)
        return
      }
      throw err
    }
    if (author && choice.kind === 'new-pack') {
      agent.inject({
        content: [{ type: 'text', text: `${authorGuide}\n\n用户选择从零写包。pack_interview 取两屏，ask_user_question 各问一次，再 pack_scaffold。` }],
        source: { kind: 'plugin', plugin: 'dsh-airp' },
      } as never)
      return
    }
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const packChoice = choice.kind === 'new-pack'
          ? { kind: 'bundled' as const, packId: config.defaultPack ?? 'lotm-tingen' }
          : choice
        const catalog = await catalogOf()
        const dir = packChoice.kind === 'custom'
          ? expandUserPath(packChoice.path)
          : await resolvePackDir({ catalog, packId: packChoice.packId })
        let seat
        if (!author) {
          try {
            seat = await askSeating(agent, dir)
          } catch (err) {
            if (isAskCancelled(err)) {
              blocked.add(key)
              return
            }
            throw err
          }
        }
        const created = await openRuntime({
          packsDir,
          userDir: extraUserDir,
          sessionId: key,
          choice: packChoice,
          role: author ? 'author' : 'play',
          seat,
        })
        if (config.loreBudgetChars) created.canon.meta.loreBudgetChars = config.loreBudgetChars
        blocked.delete(key)
        runtimes.set(key, created)
        const brief = author ? `${authorGuide}\n\n当前加载：\n${created.bootBrief()}` : created.bootBrief()
        agent.inject({
          content: [{ type: 'text', text: brief }],
          source: { kind: 'plugin', plugin: 'dsh-airp' },
        } as never)
        return created
      } catch (err) {
        if (isAskCancelled(err)) {
          blocked.add(key)
          return
        }
        const message = err instanceof Error ? err.message : String(err)
        try {
          choice = await askChoice(agent, message, author)
        } catch (again) {
          if (isAskCancelled(again)) {
            blocked.add(key)
            return
          }
          throw again
        }
      }
    }
  }

  const tools = ctx.get('tools')
  if (tools) {
    const jsonOut = {
      schema: { type: 'json' as const },
      render(_args: unknown, value: unknown) {
        return [{ type: 'text' as const, text: typeof value === 'string' ? value : JSON.stringify(value) }]
      },
    }

    const runTool = async (name: string, args: Record<string, unknown>, exec: { agent?: { session?: { id?: string; header?: { agentPreset?: string }; events?: ReadonlyArray<{ type?: string; data?: { agentPreset?: string } }> }; id?: string; ctx?: unknown } }) => {
      const denied = denyAuthorTool(name, roleFromPreset(sessionPreset(exec.agent ?? {})))
      if (denied) throw new Error(denied)
      if (name === 'pack_validate') {
        const catalog = await catalogOf()
        const packId = typeof args.packId === 'string' ? args.packId : undefined
        const dir = packId
          ? (packId.includes('/') || packId.includes('\\') || packId.startsWith('~')
            ? expandUserPath(packId)
            : await resolvePackDir({ catalog, packId }).catch(() => expandUserPath(packId)))
          : undefined
        if (dir) {
          const loaded = await loadPack(dir)
          return {
            ok: loaded.ok,
            packId: loaded.canon?.meta.id ?? packId ?? '',
            dir,
            diagnostics: loaded.diagnostics.map((d) => ({
              code: d.code,
              message: d.message,
              severity: d.severity ?? 'error',
            })),
          }
        }
      }
      const rt = await loadRuntime(sessionKey(exec))
      const out = rt.dispatch({ kind: 'tool', name, args })
      if (!out.ok && name !== 'pack_validate') throw new Error(out.text)
      return name === 'pack_validate' || name === 'check_match' ? JSON.parse(out.text) as Json : out.text
    }

    tools.register(defineTool({
      name: 'lore_get',
      description: 'Fetch a Canon lore document by key. Does not change numeric state.',
      parameters: { key: { type: 'string', required: true, description: 'lore key from the thin index' } },
      output: jsonOut,
      execute: (args, exec) => runTool('lore_get', args, exec),
    }))

    tools.register(defineTool({
      name: 'state_read',
      description: 'Read the current world state projection, optionally at a pointer.',
      parameters: { pointer: { type: 'string', description: 'optional JSON pointer like facts.weather' } },
      output: jsonOut,
      execute: (args, exec) => runTool('state_read', args, exec),
    }))

    tools.register(defineTool({
      name: 'check_propose',
      description: 'Propose an adjudication. Numeric fields only change if the engine accepts.',
      parameters: {
        checkId: { type: 'string', required: true, description: 'Canon check id' },
        actors: { type: 'object', additionalProperties: true, description: 'slot -> character id' },
      },
      output: jsonOut,
      execute: (args, exec) => runTool('check_propose', args, exec),
    }))

    tools.register(defineTool({
      name: 'state_propose_fact',
      description: 'Propose a narrative fact. Guarded numeric pointers are rejected.',
      parameters: {
        pointer: { type: 'string', required: true },
        value: { type: 'json', required: true },
      },
      output: jsonOut,
      execute: (args, exec) => runTool('state_propose_fact', args, exec),
    }))

    tools.register(defineTool({
      name: 'check_match',
      description: 'Evaluate author conditions against tags. If a check is forced, call check_propose with the returned actors.',
      parameters: {
        tags: { type: 'array', items: { type: 'string' }, required: true },
        actors: { type: 'object', additionalProperties: true },
      },
      output: jsonOut,
      execute: (args, exec) => runTool('check_match', args, exec),
    }))

    tools.register(defineTool({
      name: 'pack_validate',
      description: 'Validate a world pack. Pass pack id, or a directory that contains pack.yaml. Author preset only.',
      parameters: { packId: { type: 'string', description: 'pack id, or path to a pack directory' } },
      output: jsonOut,
      execute: (args, exec) => runTool('pack_validate', args, exec),
    }))

    tools.register(defineTool({
      name: 'pack_interview',
      description: 'Return authoring questions. screen=1|2 is one ask_user_question page of 4. Do not rewrite questions. Do not scan the workspace for novels first.',
      parameters: { screen: { type: 'number', description: '1 = who/identity/scene/commission; 2 = teach/tier/tone/banned' } },
      output: jsonOut,
      execute: async (args, exec) => {
        const denied = denyAuthorTool('pack_interview', roleFromPreset(sessionPreset(exec.agent ?? {})))
        if (denied) throw new Error(denied)
        const screen = args.screen === 1 || args.screen === 2 ? args.screen : undefined
        const card = interviewCard(screen)
        if (screen) return card as unknown as Json
        const screens = interviewScreens()
        return { questions: card.questions, screens } as unknown as Json
      },
    }))

    tools.register(defineTool({
      name: 'pack_scaffold',
      description: 'Write a NEW pack under ~/.dsh/airp-packs/<id>/. id must be kebab-case ascii. Never destDir into packs/lotm-tingen or packs/jzdh-dingjiang. Do not paste a novel into commission.',
      parameters: {
        id: { type: 'string', required: true, description: 'kebab-case ascii id, e.g. jzdh-mine — not 剑烛大荒' },
        title: { type: 'string', required: true, description: 'human title' },
        protagonistId: { type: 'string', description: 'opening character id' },
        protagonistName: { type: 'string', description: 'opening character display name' },
        commission: { type: 'string', description: 'one-paragraph opening commission' },
        axioms: { type: 'array', items: { type: 'string' }, description: '4–8 immutable world rules' },
        entry_scene: { type: 'string', description: 'opening scene id' },
        destDir: { type: 'string', description: 'optional absolute directory; defaults to ~/.dsh/airp-packs/<id>' },
        interview: { type: 'json', description: 'answers from pack_interview / ask_user_question' },
      },
      output: jsonOut,
      execute: async (args, exec) => {
        const denied = denyAuthorTool('pack_scaffold', roleFromPreset(sessionPreset(exec.agent ?? {})))
        if (denied) throw new Error(denied)
        const axioms = Array.isArray(args.axioms) ? args.axioms.map(String) : undefined
        const interview = args.interview && typeof args.interview === 'object'
          ? parseInterview(args.interview as { answers?: Array<{ id?: string; selected?: string[]; custom?: string }> })
          : undefined
        const result = await scaffoldPack({
          id: String(args.id ?? ''),
          title: String(args.title ?? args.id ?? ''),
          protagonistId: typeof args.protagonistId === 'string' ? args.protagonistId : undefined,
          protagonistName: typeof args.protagonistName === 'string' ? args.protagonistName : undefined,
          commission: typeof args.commission === 'string' ? args.commission : undefined,
          axioms,
          entry_scene: typeof args.entry_scene === 'string' ? args.entry_scene : undefined,
          destDir: typeof args.destDir === 'string' ? args.destDir : undefined,
          interview,
        })
        if (result.ok && result.dir) lastScaffold.set(sessionKey(exec), result.dir)
        return result as unknown as Json
      },
    }))

    tools.register(defineTool({
      name: 'pack_open_play',
      description: 'After pack_validate passes, produce the handoff card for a new airp-play session. Does not switch this session.',
      parameters: { packId: { type: 'string', description: 'pack id or directory; defaults to the loaded pack' } },
      output: jsonOut,
      execute: async (args, exec) => {
        const denied = denyAuthorTool('pack_open_play', roleFromPreset(sessionPreset(exec.agent ?? {})))
        if (denied) throw new Error(denied)
        const catalog = await catalogOf()
        const packId = typeof args.packId === 'string' ? args.packId : undefined
        const scaffolded = lastScaffold.get(sessionKey(exec))
        const cached = runtimes.get(sessionKey(exec))
        if (!packId && !scaffolded && !cached) {
          return {
            ok: false,
            packId: '',
            title: '',
            dir: '',
            preset: 'airp-play',
            how: ['请传入刚 scaffold 的 packId 或目录。从零写包时不要默认交接廷根。'],
            diagnostics: [],
          }
        }
        const rt = packId || scaffolded ? undefined : cached
        const dir = packId
          ? (packId.includes('/') || packId.includes('\\') || packId.startsWith('~')
            ? expandUserPath(packId)
            : await resolvePackDir({ catalog, packId }).catch(() => expandUserPath(packId)))
          : (scaffolded ?? catalog.packs.find((pack) => pack.id === rt!.canon.meta.id)?.dir ?? rt!.canon.meta.id)
        const loaded = packId || scaffolded
          ? await loadPack(dir)
          : { ok: true as const, canon: rt!.canon, diagnostics: (await import('./pack/pack.ts')).validatePack(rt!.canon) }
        const handoff = playHandoff({
          packId: loaded.canon?.meta.id ?? packId ?? '',
          title: loaded.canon?.meta.title,
          dir,
          diagnostics: loaded.diagnostics,
        })
        return {
          ...handoff,
          diagnostics: handoff.diagnostics.map((d) => ({ code: d.code, message: d.message, severity: d.severity })),
        }
      },
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
    if (!isPlayPreset(typed.data?.agentPreset) && !isAuthorPreset(typed.data?.agentPreset)) return
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
    let lexicon = tagsFromMeta()
    const cached = runtimes.get(String(payload.agent.id))
    if (!cached) return next()
    lexicon = tagsFromMeta(cached.canon.meta)
    const tags = matchTags(text, lexicon)
    if (tags.length === 0) return next()
    try {
      const rt = cached
      const snap = rt.snapshot()
      const actors = resolveIcActors(text, snap.state.present, rt.canon.characters)
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
export { loadPack, validatePack, initialState, isError, loreKeyCandidates, resolveLoreKey } from './pack/pack.ts'
export { loadCatalog, matchTags, resolveIcActors, tagsFromMeta, userPacksDir } from './pack/catalog.ts'
export { interviewCard, interviewScreens, parseInterview } from './pack/interview.ts'
export { intentFromTool, intentFromCommand, toolsFor } from './host/translate.ts'
export { HostRuntime } from './host/runtime.ts'
export { shouldBootStory, resolveBootChoice, resolvePathAnswer } from './host/boot.ts'
