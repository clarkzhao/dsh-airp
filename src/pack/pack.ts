import { readdir, readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import yaml from 'js-yaml'
import { DEFAULT_GUARDED, type Canon, type CharacterCard, type CheckDef, type Json, type LoreDoc, type PackMeta, type Predicate, type WorldState } from '../kernel/types.ts'

export type PackDiagnosticCode =
  | 'MISSING_FILE'
  | 'BAD_YAML'
  | 'BAD_POINTER'
  | 'MISSING_CARD'
  | 'BAD_CONDITION'
  | 'GUARDED_IN_FACT_SCHEMA'
  | 'LORE_BUDGET'
  | 'PROGRESS_IN_CARD'
  | 'MULTI_CONCEPT'
  | 'REVEALED_OVERFLOW'
  | 'MISSING_COMMISSION'
  | 'OPENING_ABSENT'
  | 'MISSING_SCENE'

export interface PackDiagnostic {
  code: PackDiagnosticCode
  message: string
  severity?: 'error' | 'warning'
}

export interface PackLoadResult {
  ok: boolean
  canon?: Canon
  diagnostics: PackDiagnostic[]
}

export async function loadPack(dir: string): Promise<PackLoadResult> {
  const diagnostics: PackDiagnostic[] = []
  const packRaw = await readOptional(join(dir, 'pack.yaml'))
  const indexRaw = await readOptional(join(dir, 'index.yaml'))
  if (!packRaw) diagnostics.push({ code: 'MISSING_FILE', message: 'pack.yaml missing' })
  if (!indexRaw) diagnostics.push({ code: 'MISSING_FILE', message: 'index.yaml missing' })
  if (diagnostics.length) return { ok: false, diagnostics }

  let meta: PackMeta
  let index: Canon['index']
  try {
    meta = yaml.load(packRaw!) as PackMeta
  } catch (err) {
    return { ok: false, diagnostics: [{ code: 'BAD_YAML', message: `pack.yaml: ${String(err)}` }] }
  }
  try {
    index = yaml.load(indexRaw!) as Canon['index']
  } catch (err) {
    return { ok: false, diagnostics: [{ code: 'BAD_YAML', message: `index.yaml: ${String(err)}` }] }
  }

  const checks: Record<string, CheckDef> = {}
  for (const file of await listYaml(join(dir, 'checks'))) {
    try {
      const def = yaml.load(await readFile(file, 'utf8')) as CheckDef
      checks[def.id] = def
    } catch (err) {
      diagnostics.push({ code: 'BAD_YAML', message: `${basename(file)}: ${String(err)}` })
    }
  }

  const characters: Record<string, CharacterCard> = {}
  for (const file of await listMd(join(dir, 'characters'))) {
    const parsed = parseFrontmatter(await readFile(file, 'utf8'))
    const id = String(parsed.data.id ?? basename(file, '.md'))
    characters[id] = {
      id,
      name: String(parsed.data.name ?? id),
      keys: Array.isArray(parsed.data.keys) ? parsed.data.keys.map(String) : [],
      pathway: parsed.data.pathway ? String(parsed.data.pathway) : undefined,
      sequence_declared: typeof parsed.data.sequence_declared === 'number' ? parsed.data.sequence_declared : undefined,
      stats: isJsonRecord(parsed.data.stats) ? parsed.data.stats : undefined,
      body: parsed.body,
      provisional: Boolean(parsed.data.provisional),
    }
  }

  const lore: Record<string, LoreDoc> = {}
  for (const file of await listMd(join(dir, 'lore'))) {
    const key = basename(file, '.md')
    lore[key] = { key, body: await readFile(file, 'utf8') }
  }

  const guarded = Array.isArray((meta as PackMeta & { guarded?: string[] }).guarded)
    ? (meta as PackMeta & { guarded: string[] }).guarded
    : [...DEFAULT_GUARDED]

  const canon: Canon = { meta, index: index ?? { checks: [], characters: [], lore: [] }, checks, characters, lore, guarded }
  diagnostics.push(...validatePack(canon))
  return { ok: !diagnostics.some(isError), canon, diagnostics }
}

export function isError(diag: PackDiagnostic): boolean {
  return (diag.severity ?? 'error') === 'error'
}

const PROGRESS_IN_CARD = /消化\s*[0-9.]|失控\s*[0-9.]|sequence\s*[:=]\s*\d|digest\s*[:=]|lose_control\s*[:=]|当前序列|当前品级|进度\s*[0-9.]/

export function validatePack(canon: Canon): PackDiagnostic[] {
  const out: PackDiagnostic[] = []
  for (const id of canon.index.characters ?? []) {
    if (!canon.characters[id]) out.push({ code: 'MISSING_CARD', message: `index character ${id} has no card` })
  }
  for (const id of canon.index.checks ?? []) {
    if (!canon.checks[id]) out.push({ code: 'MISSING_FILE', message: `index check ${id} missing` })
  }
  for (const key of canon.index.lore ?? []) {
    if (!canon.lore[key]) out.push({ code: 'MISSING_FILE', message: `index lore ${key} missing` })
  }
  for (const id of [...(canon.meta.opening?.present ?? []), ...(canon.meta.opening?.roster ?? [])]) {
    if (!canon.characters[id]) out.push({ code: 'OPENING_ABSENT', message: `opening character ${id} has no card` })
  }
  for (const check of Object.values(canon.checks)) {
    if (check.condition) out.push(...validatePredicate(check.condition, `check ${check.id}`))
    for (const outcome of Object.values(check.outcomes)) {
      for (const pointer of Object.keys(outcome?.apply ?? {})) {
        if (pointer.includes('{')) continue
        if (!looksLikePointer(pointer)) out.push({ code: 'BAD_POINTER', message: `${check.id} bad pointer ${pointer}` })
      }
    }
    if (check.kind === 'generic' && 'fact_schema' in check) {
      out.push({ code: 'GUARDED_IN_FACT_SCHEMA', message: `${check.id} must not declare a fact schema` })
    }
  }
  const budget = canon.meta.loreBudgetChars ?? 4000
  for (const doc of Object.values(canon.lore)) {
    if (doc.body.length > budget) {
      out.push({ code: 'LORE_BUDGET', message: `lore ${doc.key} is ${doc.body.length} chars, budget ${budget}` })
    }
    const headings = doc.body.match(/^#{1,3}\s+/gm)
    if ((headings?.length ?? 0) > 2) {
      out.push({
        code: 'MULTI_CONCEPT',
        severity: 'warning',
        message: `lore ${doc.key} has ${headings!.length} headings; split into one concept per file`,
      })
    }
  }
  for (const card of Object.values(canon.characters)) {
    if (PROGRESS_IN_CARD.test(card.body)) {
      out.push({
        code: 'PROGRESS_IN_CARD',
        severity: 'warning',
        message: `character ${card.id} body looks like live progress; keep numbers in State`,
      })
    }
  }
  const revealed = canon.meta.opening?.revealed ?? []
  if (revealed.length > 6) {
    out.push({
      code: 'REVEALED_OVERFLOW',
      severity: 'warning',
      message: `opening.revealed has ${revealed.length} keys; keep axioms + scene + commission`,
    })
  }
  const hasCommission = Object.keys(canon.lore).some((key) => key.includes('commission'))
  if (!hasCommission) {
    out.push({
      code: 'MISSING_COMMISSION',
      severity: 'warning',
      message: 'no lore key containing "commission"; play boot will have no opening job',
    })
  }
  for (const scene of canon.index.scenes ?? []) {
    if (!sceneHasLore(scene, canon.lore)) {
      out.push({
        code: 'MISSING_SCENE',
        severity: 'warning',
        message: `index scene ${scene} has no lore file ${scene.replaceAll('.', '-')}.md (or a parent key)`,
      })
    }
  }
  return out
}

const LOTM_STATS: Record<string, Json> = {
  pathway: 'unknown',
  sequence: 9,
  digest: 0,
  lose_control: 0,
}

export function defaultCharacterStats(canon: Canon): Record<string, Json> {
  return canon.meta.stats && Object.keys(canon.meta.stats).length > 0
    ? { ...canon.meta.stats }
    : { ...LOTM_STATS }
}

export function openingCharacterState(canon: Canon, card: CharacterCard): WorldState['characters'][string] {
  const state = defaultCharacterStats(canon)
  if (card.pathway) state.pathway = card.pathway
  if (card.sequence_declared !== undefined) state.sequence = card.sequence_declared
  if (card.stats) Object.assign(state, card.stats)
  return state
}

export function initialState(canon: Canon, seed: string): WorldState {
  const opening = canon.meta.opening
  const present = opening?.present
    ?? canon.index.characters.filter((id) => canon.characters[id] && !canon.characters[id]!.provisional)
  const roster = new Set([...present, ...(opening?.roster ?? [])])
  const characters: WorldState['characters'] = {}
  for (const id of roster) {
    const card = canon.characters[id]
    if (!card) continue
    characters[id] = openingCharacterState(canon, card)
  }
  return {
    turn: 0,
    scene: canon.meta.entry_scene ?? 'start',
    rng_seed: seed,
    revealed: opening?.revealed ?? (canon.index.lore ?? []).slice(0, 2),
    present,
    characters,
    facts: { ...(opening?.facts ?? {}) },
  }
}

function validatePredicate(pred: Predicate, ctx: string): PackDiagnostic[] {
  const keys = Object.keys(pred)
  const allowed = ['all', 'any', 'tag', 'present', 'eq', 'lt', 'lte', 'gt', 'gte']
  if (keys.length !== 1 || !allowed.includes(keys[0]!)) {
    return [{ code: 'BAD_CONDITION', message: `${ctx}: invalid predicate keys ${keys.join(',')}` }]
  }
  if ('all' in pred) return pred.all.flatMap((p) => validatePredicate(p, ctx))
  if ('any' in pred) return pred.any.flatMap((p) => validatePredicate(p, ctx))
  return []
}

function looksLikePointer(pointer: string): boolean {
  return pointer.split('.').length >= 2
}

async function readOptional(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return undefined
  }
}

async function listYaml(dir: string): Promise<string[]> {
  try {
    const names = await readdir(dir)
    return names.filter((n) => n.endsWith('.yaml') || n.endsWith('.yml')).map((n) => join(dir, n))
  } catch {
    return []
  }
}

async function listMd(dir: string): Promise<string[]> {
  try {
    const names = await readdir(dir)
    return names.filter((n) => n.endsWith('.md')).map((n) => join(dir, n))
  } catch {
    return []
  }
}

function sceneHasLore(scene: string, lore: Record<string, LoreDoc>): boolean {
  const dashed = scene.replaceAll('.', '-')
  if (lore[dashed] || lore[scene]) return true
  const parts = scene.split('.')
  while (parts.length > 1) {
    parts.pop()
    const parent = parts.join('-')
    if (lore[parent] || lore[parts.join('.')]) return true
  }
  return false
}

function isJsonRecord(value: unknown): value is Record<string, Json> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function parseFrontmatter(text: string): { data: Record<string, unknown>; body: string } {
  if (!text.startsWith('---')) return { data: {}, body: text }
  const end = text.indexOf('\n---', 3)
  if (end < 0) return { data: {}, body: text }
  const raw = text.slice(4, end)
  const body = text.slice(end + 4).replace(/^\s+/, '')
  const data = (yaml.load(raw) ?? {}) as Record<string, unknown>
  return { data, body }
}
