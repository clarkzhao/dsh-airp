export interface InterviewQuestion {
  id: string
  header: string
  question: string
  options?: Array<{ label: string; description?: string }>
}

export interface InterviewCard {
  questions: InterviewQuestion[]
}

export interface InterviewAnswers {
  who?: string
  identity?: string
  scene?: string
  commission?: string
  teach?: 'axioms' | 'play'
  tier?: 'narrative' | 'default' | 'hard'
  tone?: string
  banned?: string
}

const TEACH_AXIOMS = '先读公理再开玩'
const TEACH_PLAY = '直接开玩'
const TIER_NARRATIVE = '纯叙事（几乎不鉴定）'
const TIER_DEFAULT = '默认判定（关键冲突才鉴定）'
const TIER_HARD = '硬核（对抗 + 代价都鉴定）'
const TONE_SERIOUS = '严肃'
const TONE_LIGHT = '轻松'
const TONE_FAST = '快节奏'

export function interviewCard(): InterviewCard {
  return {
    questions: [
      { id: 'who', header: '扮演谁', question: '你想扮演谁？写名字或称呼。' },
      { id: 'identity', header: '对外身份', question: '这个角色此刻对外怎么自称？不要写进度数字。' },
      { id: 'scene', header: '开场地点', question: '从哪个地点/场景开始？' },
      { id: 'commission', header: '委托', question: '开局委托或目标是什么？一句说清谁委托、要查什么。' },
      {
        id: 'teach',
        header: '开场阅读',
        question: '要先读公理，还是直接开玩？',
        options: [
          { label: TEACH_AXIOMS, description: 'opening.revealed 含 axioms + commission' },
          { label: TEACH_PLAY, description: '只揭示委托，公理按需 lore_get' },
        ],
      },
      {
        id: 'tier',
        header: '机制档',
        question: '鉴定要多重？',
        options: [
          { label: TIER_NARRATIVE, description: 'rng: none，走路闲聊仍不鉴定' },
          { label: TIER_DEFAULT, description: 'bernoulli，关键冲突才鉴定（推荐）' },
          { label: TIER_HARD, description: '对抗失败额外付代价' },
        ],
      },
      {
        id: 'tone',
        header: '语气',
        question: '叙事语气？',
        options: [
          { label: TONE_SERIOUS, description: 'facts.tone = 严肃' },
          { label: TONE_LIGHT, description: 'facts.tone = 轻松' },
          { label: TONE_FAST, description: 'facts.tone = 快节奏' },
        ],
      },
      { id: 'banned', header: '禁忌', question: '有没有绝对不能出现的主题？没有就写「无」。写入 facts.banned，不写进角色卡。' },
    ],
  }
}

export function parseInterview(input: {
  answers?: Array<{ id?: string; selected?: string[]; custom?: string }>
} | InterviewAnswers): InterviewAnswers {
  if (input && typeof input === 'object' && !('answers' in input)) {
    return { ...(input as InterviewAnswers) }
  }
  const out: InterviewAnswers = {}
  for (const item of input.answers ?? []) {
    const id = item.id
    const text = (item.custom?.trim() || item.selected?.[0]?.trim() || '')
    if (!id || !text) continue
    if (id === 'who') out.who = text
    else if (id === 'identity') out.identity = text
    else if (id === 'scene') out.scene = text
    else if (id === 'commission') out.commission = text
    else if (id === 'teach') out.teach = text === TEACH_PLAY ? 'play' : 'axioms'
    else if (id === 'tier') {
      out.tier = text === TIER_NARRATIVE ? 'narrative' : text === TIER_HARD ? 'hard' : 'default'
    }
    else if (id === 'tone') out.tone = text
    else if (id === 'banned') out.banned = text === '无' ? undefined : text
  }
  return out
}

export function interviewFacts(answers: InterviewAnswers): Record<string, string> {
  const facts: Record<string, string> = { commission: 'pending' }
  if (answers.identity) facts.identity = answers.identity
  if (answers.tone) facts.tone = answers.tone
  if (answers.banned) facts.banned = answers.banned
  return facts
}

export function interviewRevealed(answers: InterviewAnswers): string[] {
  return answers.teach === 'play' ? ['commission'] : ['axioms', 'commission']
}

export function interviewRng(answers: InterviewAnswers): 'bernoulli' | 'none' {
  return answers.tier === 'narrative' ? 'none' : 'bernoulli'
}
