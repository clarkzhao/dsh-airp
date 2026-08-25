import type { OpeningSeat } from '../kernel/types.ts'
import { loadPack, playableScenes, resolveLoreKey, loreKeyCandidates } from '../pack/pack.ts'
import { expandUserPath, type PackRef } from '../pack/catalog.ts'
import { HostRuntime } from './runtime.ts'

export const PLAY_PRESET_ID = 'airp-play'
export const AUTHOR_PRESET_ID = 'airp-author'
export const BUNDLED_TINGEN = '廷根切片（推荐）'
export const BUNDLED_JZDH = '定江切片'
export const PICK_CUSTOM = '选择我的世界包目录…'
export const PICK_NEW_PACK = '从零写一个新世界包…'
export const PICK_DEFAULT_SEAT = '用包默认开场'
export const PICK_EASY_DING = '轻松丁松言剧情'
export const PICK_CUSTOM_TRAVELER = '自拟穿越者'

export interface BootAsk {
  questions: Array<{
    id: string
    header?: string
    question: string
    options?: Array<{ label: string; description?: string }>
  }>
}

export interface BootAnswer {
  answers: Array<{ id: string; selected?: string[]; custom?: string }>
}

export function isPlayPreset(presetId?: string): boolean {
  return presetId === PLAY_PRESET_ID
}

export function isAuthorPreset(presetId?: string): boolean {
  return presetId === AUTHOR_PRESET_ID
}

export function sessionIsBlank(session?: { events?: ReadonlyArray<{ type?: string }> }): boolean {
  return !session?.events?.some((event) => event.type === 'turn/start')
}

export function presetFromSession(session?: {
  header?: { agentPreset?: string }
  events?: ReadonlyArray<{ type?: string; data?: { agentPreset?: string } }>
}): string | undefined {
  const events = session?.events
  if (events) {
    for (let index = events.length - 1; index >= 0; index -= 1) {
      const event = events[index]
      if (event?.type === 'agent-preset/selected' && event.data?.agentPreset) return event.data.agentPreset
    }
  }
  return session?.header?.agentPreset
}

export function shouldBootStory(opts: {
  presetId?: string
  source?: string
  blank?: boolean
  alreadyBooted?: boolean
}): boolean {
  if (opts.alreadyBooted || opts.blank === false) return false
  if (opts.source === 'resume' || opts.source === 'compact') return false
  return isPlayPreset(opts.presetId) || isAuthorPreset(opts.presetId)
}

/** Author can load a pack with no seating card. A still-blank switch to play must ask seating. */
export function shouldReseatForPlay(opts: {
  presetId?: string
  role?: string
  blank?: boolean
}): boolean {
  return isPlayPreset(opts.presetId) && opts.role === 'author' && opts.blank !== false
}

export function isAskCancelled(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const code = 'code' in error ? String((error as { code?: unknown }).code ?? '') : ''
  const message = error instanceof Error ? error.message : String(error)
  return code === 'ASK_CANCELLED' || code === 'ASK_ABORTED' || /cancelled ask_user_question|aborted before the user answered/i.test(message)
}

/** Inbox / inject failures are not a missing pack.yaml. Do not re-prompt for a directory. */
export function isHarnessNoise(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /is already pending|invalid inbox splice|reading ['"]send['"]/i.test(message)
}

export type BootLoadAttempt<T> =
  | { kind: 'loaded'; runtime: T }
  | { kind: 'cancelled' }
  | { kind: 'retry'; error: string }
  | { kind: 'abort'; error: string }

/**
 * One boot-card attempt: load the pack, then seed the model. Inject/inbox
 * failures after a successful load must not bounce the user back to a path card.
 */
export async function bootLoadAttempt<T>(opts: {
  load: () => Promise<T>
  afterLoad?: (runtime: T) => void
}): Promise<BootLoadAttempt<T>> {
  try {
    const runtime = await opts.load()
    try {
      opts.afterLoad?.(runtime)
    } catch (err) {
      if (isAskCancelled(err)) return { kind: 'cancelled' }
      return { kind: 'loaded', runtime }
    }
    return { kind: 'loaded', runtime }
  } catch (err) {
    if (isAskCancelled(err)) return { kind: 'cancelled' }
    const error = err instanceof Error ? err.message : String(err)
    if (isHarnessNoise(err)) return { kind: 'abort', error }
    return { kind: 'retry', error }
  }
}

export function looksLikePackPath(value: string): boolean {
  const text = value.trim()
  if (!text || text === PICK_CUSTOM || text === BUNDLED_TINGEN || text === BUNDLED_JZDH || text === PICK_NEW_PACK) return false
  return text.startsWith('/') || text.startsWith('~') || text.includes('pack.yaml') || text.includes('\\') || /^[A-Za-z]:[\\/]/.test(text)
}

function optionBlurb(pack: PackRef | undefined, fallback: string): string {
  if (!pack) return fallback
  const bits = [pack.description || fallback]
  if (pack.license) bits.push(pack.license)
  if (pack.origin === 'user') bits.push('~/.dsh/airp-packs')
  return bits.join(' · ')
}

function typedPath(item: BootAnswer['answers'][number] | undefined): string {
  const custom = item?.custom?.trim()
  if (custom) return custom
  const selected = item?.selected?.[0]?.trim()
  return selected && looksLikePackPath(selected) ? selected : ''
}

export function bootQuestion(packIds: string[]): BootAsk {
  return bootQuestionFromRefs(packIds.map((id) => ({ id, title: id, dir: id, origin: 'bundled' as const })))
}

export function bootQuestionFromRefs(packs: PackRef[]): BootAsk {
  const seen = new Set<string>()
  const options: Array<{ label: string; description?: string }> = [
    { label: BUNDLED_TINGEN, description: optionBlurb(packs.find((pack) => pack.id === 'lotm-tingen'), '立刻进入黑荆棘安保公司，读委托开玩。官方示例。') },
  ]
  seen.add('lotm-tingen')
  if (packs.some((pack) => pack.id === 'jzdh-dingjiang')) {
    options.push({ label: BUNDLED_JZDH, description: optionBlurb(packs.find((pack) => pack.id === 'jzdh-dingjiang'), '大荒时代切片。开局自选人物与地点。官方示例。') })
    seen.add('jzdh-dingjiang')
  }
  for (const pack of packs) {
    if (seen.has(pack.id)) continue
    seen.add(pack.id)
    const where = pack.origin === 'user' ? '你的世界包目录' : pack.origin === 'custom' ? '自选目录' : '官方示例'
    const license = pack.license ? ` · ${pack.license}` : ''
    options.push({
      label: pack.title || '未命名世界',
      description: `${pack.description ?? pack.title} · ${where}${license}`,
    })
  }
  options.push({ label: PICK_CUSTOM, description: '下一屏粘贴含 pack.yaml 的目录。卡片底部也可直接输入路径。' })
  return {
    questions: [{
      id: 'boot_pack',
      header: '加载世界',
      question: '先选要进的世界。官方示例已列在上面；自己的世界放在用户世界包目录，或在卡片底部粘贴目录路径。',
      options,
    }],
  }
}

export function pathQuestion(error?: string): BootAsk {
  return {
    questions: [{
      id: 'boot_path',
      header: '世界包路径',
      question: error
        ? `没能加载该目录：${error}\n请再贴一次世界包所在目录（里面要有世界清单文件）。`
        : '请输入或粘贴世界包所在目录。不要选廷根，除非你改主意了。',
    }],
  }
}

export function resolveBootChoice(answer: BootAnswer, packs: PackRef[] = []): { kind: 'bundled'; packId: string } | { kind: 'custom'; path: string } | { kind: 'need-path' } | { kind: 'new-pack' } {
  const hit = answer.answers.find((a) => a.id === 'boot_pack') ?? answer.answers.find((a) => a.id === 'boot_path')
  const path = typedPath(hit)
  if (path) return { kind: 'custom', path }
  const label = hit?.selected?.[0]
  if (!label || label === PICK_CUSTOM) return { kind: 'need-path' }
  if (label === PICK_NEW_PACK) return { kind: 'new-pack' }
  if (label === BUNDLED_TINGEN) return { kind: 'bundled', packId: 'lotm-tingen' }
  if (label === BUNDLED_JZDH) return { kind: 'bundled', packId: 'jzdh-dingjiang' }
  const byTitle = packs.find((pack) => label === pack.title || label === `${pack.title} (${pack.id})` || label === pack.id)
  if (byTitle) return { kind: 'bundled', packId: byTitle.id }
  return { kind: 'bundled', packId: label }
}

export function resolvePathAnswer(answer: BootAnswer): { kind: 'custom'; path: string } | { kind: 'need-path' } {
  const path = typedPath(answer.answers.find((a) => a.id === 'boot_path'))
  return path ? { kind: 'custom', path } : { kind: 'need-path' }
}

export async function listPackIds(packsDir: string): Promise<string[]> {
  const { loadCatalog } = await import('../pack/catalog.ts')
  const catalog = await loadCatalog({ bundledDir: packsDir })
  const ids = catalog.packs.map((pack) => pack.id)
  return ids.length ? ids.sort() : ['lotm-tingen']
}

export function seatingQuestion(canon: import('../kernel/types.ts').Canon): BootAsk {
  const scenes = playableScenes(canon)
  const dingjiang = canon.meta.id === 'jzdh-dingjiang'
  const modeOptions = dingjiang
    ? [
        { label: PICK_EASY_DING, description: '当康庙说书人，接失踪的张睿。轻松跟一条样例线。' },
        { label: PICK_CUSTOM_TRAVELER, description: '自拟身份，同年同夜切入。丁松言仍在城中，两条线可能相交。' },
      ]
    : [
        { label: PICK_DEFAULT_SEAT, description: '沿用这个世界自己的默认开场人物和地点。' },
        { label: PICK_CUSTOM_TRAVELER, description: '自拟路人，不占用原著底牌。' },
      ]
  const sceneOptions = scenes.map((id) => {
    const title = sceneTitle(canon, id)
    return { label: title, description: `从「${title}」开场` }
  })
  return {
    questions: [
      {
        id: 'boot_mode',
        header: '开局方式',
        question: dingjiang
          ? '轻松跟丁松言样例线，还是自拟一个同年同夜切入的穿越者？'
          : '用包默认开场，还是自拟人物？',
        options: modeOptions,
      },
      {
        id: 'boot_scene',
        header: '从哪开场',
        question: dingjiang
          ? '自拟穿越者再选落点。轻松丁松言线默认当康庙。'
          : '自拟人物再选地点。默认开场可忽略。',
        options: sceneOptions.length ? sceneOptions : [{ label: PICK_DEFAULT_SEAT, description: `默认${sceneTitle(canon, canon.meta.entry_scene ?? '') || '开场地点'}` }],
      },
    ],
  }
}

export function travelerQuestion(screen: 1 | 2 = 1): BootAsk {
  const questions = [
    { id: 'boot_name', header: '称呼', question: '你在这个时代怎么自称？不要写品级或进度。' },
    { id: 'boot_age', header: '年龄', question: '外表年龄？一个数字或「约二十」。' },
    { id: 'boot_vocation', header: '职业出身', question: '出身或眼下营生？如说书人、县衙书办、镖师、农户。' },
    { id: 'boot_origin', header: '来历', question: '对外怎么解释自己？如离魂失忆、外乡投亲。不要编完整地球履历。' },
    { id: 'boot_birthplace', header: '出生地', question: '这个时代的籍贯或落脚处？如定江府城余巷、岳江府、宁州乡野。' },
    { id: 'boot_ties', header: '人物关系', question: '开场已认识谁？没有就写「无」。可点丁家、许长安、宵明弟子，两条线才可能相交。' },
  ]
  return { questions: screen === 1 ? questions.slice(0, 3) : questions.slice(3, 6) }
}

export function mergeBootAnswers(...cards: BootAnswer[]): BootAnswer {
  return { answers: cards.flatMap((card) => card.answers) }
}

function sceneTitle(canon: import('../kernel/types.ts').Canon, sceneId: string): string {
  if (!sceneId) return ''
  const key = resolveLoreKey(loreKeyCandidates(sceneId), canon.lore)
  const body = key ? canon.lore[key]?.body ?? '' : ''
  const heading = body.match(/^#\s+(.+)$/m)
  const title = heading?.[1]?.trim()
  return title || sceneId.split('.').pop() || sceneId
}

function resolveSceneLabel(canon: import('../kernel/types.ts').Canon, label: string): string | undefined {
  if (!label || label === PICK_DEFAULT_SEAT) return undefined
  const scenes = playableScenes(canon)
  if (scenes.includes(label)) return label
  const hit = scenes.find((id) => sceneTitle(canon, id) === label)
  return hit
}

function field(answer: BootAnswer, id: string): string {
  const hit = answer.answers.find((a) => a.id === id)
  return (hit?.custom ?? hit?.selected?.[0] ?? '').trim()
}

export function resolveSeating(answer: BootAnswer, canon: import('../kernel/types.ts').Canon, traveler?: BootAnswer): OpeningSeat {
  const modeLabel = field(answer, 'boot_mode')
  const sceneLabel = field(answer, 'boot_scene')
  const dingjiang = canon.meta.id === 'jzdh-dingjiang'
  const easy = modeLabel === PICK_EASY_DING || modeLabel === PICK_DEFAULT_SEAT || !modeLabel
  if (easy && modeLabel !== PICK_CUSTOM_TRAVELER) {
    return dingjiang
      ? { mode: 'easy', pc: 'ding-songyan', scene: canon.meta.entry_scene }
      : { mode: 'easy' }
  }
  const seat: OpeningSeat = { mode: 'custom' }
  const sceneId = resolveSceneLabel(canon, sceneLabel)
  if (sceneId) seat.scene = sceneId
  const name = traveler ? field(traveler, 'boot_name') : ''
  seat.customName = name || '路人'
  if (traveler) {
    seat.age = field(traveler, 'boot_age') || undefined
    seat.vocation = field(traveler, 'boot_vocation') || undefined
    seat.origin = field(traveler, 'boot_origin') || undefined
    seat.birthplace = field(traveler, 'boot_birthplace') || undefined
    seat.ties = field(traveler, 'boot_ties') || undefined
  }
  return seat
}

export function seatingNeedsTraveler(seat: OpeningSeat): boolean {
  return seat.mode === 'custom'
}

export async function openRuntime(opts: {
  packsDir: string
  sessionId: string
  choice: { kind: 'bundled'; packId: string } | { kind: 'custom'; path: string }
  seed?: string
  role?: 'play' | 'author'
  userDir?: string
  seat?: OpeningSeat
  stageHint?: string
}): Promise<HostRuntime> {
  const { loadCatalog, resolvePackDir } = await import('../pack/catalog.ts')
  const catalog = await loadCatalog({ bundledDir: opts.packsDir, userDir: opts.userDir })
  const dir = opts.choice.kind === 'custom'
    ? expandUserPath(opts.choice.path)
    : await resolvePackDir({ catalog, packId: opts.choice.packId })
  const loaded = await loadPack(dir)
  if (!loaded.ok || !loaded.canon) {
    throw new Error(`无法加载世界包 ${dir}: ${loaded.diagnostics.map((d) => d.message).join('; ')}`)
  }
  const packId = loaded.canon.meta.id
  return new HostRuntime({
    canon: loaded.canon,
    sessionId: opts.sessionId,
    seed: opts.seed ?? `${packId}:${opts.sessionId}`,
    role: opts.role,
    seat: opts.seat,
    stageHint: opts.stageHint,
  })
}
