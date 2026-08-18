import { homedir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { readdir } from 'node:fs/promises'
import type { PackMeta } from '../kernel/types.ts'
import { loadPack } from './pack.ts'

export const BUNDLED_DEMO_IDS = ['lotm-tingen', 'jzdh-dingjiang'] as const

export const DEFAULT_USER_PACKS_DIR = join(homedir(), '.dsh', 'airp-packs')

export const LOTM_TAGS: Record<string, string[]> = {
  contest: ['对抗', '交手', '动手', '战斗', '偷袭', '拦住'],
  digest: ['扮演', '消化', '魔药'],
  lose_control: ['失控', '污染', '低语'],
}

export type PackOrigin = 'bundled' | 'user' | 'custom'

export interface PackRef {
  id: string
  title: string
  dir: string
  origin: PackOrigin
  description?: string
  license?: string
}

export interface Catalog {
  bundledDir: string
  userDir: string
  packs: PackRef[]
}

export function userPacksDir(override?: string): string {
  return override ? resolve(override) : DEFAULT_USER_PACKS_DIR
}

export function expandUserPath(value: string): string {
  return resolve(value.replace(/^~(?=\/|$)/, homedir()))
}

export function tagsFromMeta(meta?: Pick<PackMeta, 'tags'>): Record<string, string[]> {
  return meta?.tags && Object.keys(meta.tags).length > 0 ? meta.tags : LOTM_TAGS
}

export function matchTags(text: string, lexicon: Record<string, string[]>): string[] {
  const tags: string[] = []
  for (const [tag, words] of Object.entries(lexicon)) {
    if (words.some((word) => word && text.includes(word))) tags.push(tag)
  }
  return tags
}

export async function scanPackDir(dir: string, origin: PackOrigin): Promise<PackRef | undefined> {
  const loaded = await loadPack(dir)
  if (!loaded.ok || !loaded.canon) return undefined
  const meta = loaded.canon.meta
  return {
    id: meta.id || basename(dir),
    title: meta.title || meta.id || basename(dir),
    dir,
    origin,
    description: meta.description,
    license: meta.license,
  }
}

async function listChildPacks(root: string, origin: PackOrigin): Promise<PackRef[]> {
  try {
    const names = await readdir(root, { withFileTypes: true })
    const found: PackRef[] = []
    for (const ent of names) {
      if (!ent.isDirectory() || ent.name.startsWith('.')) continue
      const ref = await scanPackDir(resolve(root, ent.name), origin)
      if (ref) found.push(ref)
    }
    return found
  } catch {
    return []
  }
}

export async function loadCatalog(opts: {
  bundledDir: string
  userDir?: string
}): Promise<Catalog> {
  const bundledDir = resolve(opts.bundledDir)
  const userDir = userPacksDir(opts.userDir)
  const bundled = await listChildPacks(bundledDir, 'bundled')
  const user = (await listChildPacks(userDir, 'user')).filter((pack) => !bundled.some((b) => b.id === pack.id))
  return { bundledDir, userDir, packs: [...bundled, ...user] }
}

export function pickPack(catalog: Catalog, packId: string): PackRef | undefined {
  return catalog.packs.find((pack) => pack.id === packId)
}

export async function resolvePackDir(opts: {
  catalog: Catalog
  packId?: string
  customPath?: string
}): Promise<string> {
  if (opts.customPath) return expandUserPath(opts.customPath)
  if (opts.packId) {
    const hit = pickPack(opts.catalog, opts.packId)
    if (hit) return hit.dir
    const bundled = resolve(opts.catalog.bundledDir, opts.packId)
    const user = resolve(opts.catalog.userDir, opts.packId)
    const fromBundled = await scanPackDir(bundled, 'bundled')
    if (fromBundled) return fromBundled.dir
    const fromUser = await scanPackDir(user, 'user')
    if (fromUser) return fromUser.dir
    throw new Error(`unknown pack ${opts.packId}`)
  }
  throw new Error('pack id or path required')
}

export function isBundledDemo(id: string): boolean {
  return (BUNDLED_DEMO_IDS as readonly string[]).includes(id)
}
