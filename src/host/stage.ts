/**
 * Host presentation seam. Kernel still has no images; play still has no extra
 * tools. Adapters (any image plugin) publish a file here, and the
 * narrator embeds the returned http(s) URL in prose.
 *
 * Web Markdown only renders http(s) `![alt](url)`. Relative `/airp-media/…`
 * is dropped by the sanitizer, so markdownUrl is a same-origin absolute URL.
 */
import { copyFile, mkdir, readFile, stat } from 'node:fs/promises'
import type { IncomingMessage, IncomingHttpHeaders, ServerResponse } from 'node:http'
import { basename, extname, resolve, sep } from 'node:path'

export const AIRP_MEDIA_PREFIX = '/airp-media'
export const AIRP_STAGE_MAX_BYTES = 20 * 1024 * 1024

const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const MEDIA_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
}

export interface AirpStageAsset {
  fileName: string
  url?: string
}

export interface AirpStage {
  readonly prefix: typeof AIRP_MEDIA_PREFIX
  markdownUrl(fileName: string): string | undefined
  publish(input: { filePath: string }): Promise<AirpStageAsset>
  mountRoot(dir: string): () => void
  hint(): string
  handle(req: IncomingMessage, res: ServerResponse): Promise<void>
}

export interface AirpStageOptions {
  stageDir: string
  origin?: () => string | undefined
  trustedHosts?: () => readonly string[]
}

export function isSafeStageName(name: string): boolean {
  if (!name || name.length > 180) return false
  if (name.includes('..') || name.includes('/') || name.includes('\\') || name.includes('\0')) return false
  if (!SAFE_NAME.test(name)) return false
  return mediaTypeForName(name) !== undefined
}

export function mediaTypeForName(name: string): string | undefined {
  return MEDIA_TYPES[extname(name).toLowerCase()]
}

export function loopbackOrigin(port: number | undefined): string | undefined {
  if (typeof port !== 'number' || !Number.isInteger(port) || port <= 0) return undefined
  return `http://127.0.0.1:${port}`
}

export function createAirpStage(opts: AirpStageOptions): AirpStage {
  const stageDir = resolve(opts.stageDir)
  const mounts: string[] = []

  const originOf = () => opts.origin?.()
  const trustedOf = () => opts.trustedHosts?.() ?? []

  const markdownUrl = (fileName: string): string | undefined => {
    const origin = originOf()
    if (!origin || !isSafeStageName(fileName)) return undefined
    return `${origin}${AIRP_MEDIA_PREFIX}/${encodeURIComponent(fileName)}`
  }

  const assetOf = (fileName: string): AirpStageAsset => {
    const url = markdownUrl(fileName)
    return { fileName, ...(url ? { url } : {}) }
  }

  return {
    prefix: AIRP_MEDIA_PREFIX,
    markdownUrl,
    hint() {
      const origin = originOf()
      if (!origin) return '当前没有 Web 舞台；只叙述，不贴图片路径。'
      return [
        `舞台 ${origin}${AIRP_MEDIA_PREFIX}/<文件>。`,
        `对白写 ![说明](${origin}${AIRP_MEDIA_PREFIX}/文件名.jpg)。Web 只渲染绝对 http(s)，且须同源。`,
        '禁止本地路径、file://、data:、相对 /path。不要等工具卡出图。回执没有 http(s) 链接就只叙述。',
      ].join('')
    },
    mountRoot(dir: string) {
      const root = resolve(dir)
      mounts.push(root)
      return () => {
        const index = mounts.lastIndexOf(root)
        if (index >= 0) mounts.splice(index, 1)
      }
    },
    async publish(input) {
      const fileName = basename(input.filePath)
      if (!isSafeStageName(fileName)) {
        throw new Error(`airpStage: refused file name ${fileName}`)
      }
      await mkdir(stageDir, { recursive: true, mode: 0o700 })
      const dest = confine(stageDir, fileName)
      await copyFile(input.filePath, dest)
      return assetOf(fileName)
    },
    async handle(req, res) {
      if (!isTrustedStageRequest(req.headers, trustedOf())) {
        res.writeHead(403, { 'Content-Type': 'text/plain' })
        res.end('forbidden')
        return
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405)
        res.end()
        return
      }
      const fileName = stageNameFromUrl(req.url)
      if (!fileName) {
        res.writeHead(400, { 'Content-Type': 'text/plain' })
        res.end('bad request')
        return
      }
      const found = await readStageFile(fileName, [stageDir, ...mounts])
      if (!found) {
        res.writeHead(404, { 'Content-Type': 'text/plain' })
        res.end('not found')
        return
      }
      res.writeHead(200, { 'Content-Type': found.mediaType, 'Cache-Control': 'no-cache' })
      res.end(req.method === 'HEAD' ? undefined : found.body)
    },
  }
}

export function stageNameFromUrl(url: string | undefined): string | undefined {
  const path = (url ?? '/').split('?')[0] ?? '/'
  const prefix = `${AIRP_MEDIA_PREFIX}/`
  const raw = path.startsWith(prefix) ? path.slice(prefix.length) : path.split('/').pop()
  if (raw === undefined) return undefined
  let decoded = raw
  try {
    decoded = decodeURIComponent(raw)
  } catch {
    return undefined
  }
  return isSafeStageName(decoded) ? decoded : undefined
}

export async function readStageFile(
  fileName: string,
  roots: readonly string[],
): Promise<{ mediaType: string; body: Buffer } | undefined> {
  if (!isSafeStageName(fileName)) return undefined
  const mediaType = mediaTypeForName(fileName)
  if (!mediaType) return undefined
  for (const root of roots) {
    const filePath = confine(root, fileName)
    try {
      const info = await stat(filePath)
      if (info.isFile() && info.size > 0 && info.size <= AIRP_STAGE_MAX_BYTES) {
        return { mediaType, body: await readFile(filePath) }
      }
    } catch {
      /* try next root */
    }
  }
  return undefined
}

function confine(dir: string, name: string): string {
  const filePath = resolve(dir, name)
  if (!filePath.startsWith(dir + sep) && filePath !== dir) {
    throw new Error(`airpStage: refused to leave ${dir}`)
  }
  return filePath
}

export function isTrustedStageRequest(
  headers: IncomingHttpHeaders,
  trustedHosts: readonly string[] = [],
): boolean {
  const host = header(headers, 'host')
  if (host === undefined) return false
  let hostUrl: URL
  try {
    hostUrl = new URL(`http://${host}`)
  } catch {
    return false
  }
  if (!isLoopbackHostname(hostUrl.hostname) && !isTrustedAuthority(hostUrl, trustedHosts)) return false
  if (header(headers, 'sec-fetch-site') === 'cross-site') return false
  const origin = header(headers, 'origin')
  if (origin === undefined) return true
  try {
    return new URL(origin).host === hostUrl.host
  } catch {
    return false
  }
}

function header(headers: IncomingHttpHeaders, name: string): string | undefined {
  const value = headers[name]
  return typeof value === 'string' ? value : undefined
}

function isLoopbackHostname(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '[::1]') return true
  const parts = hostname.split('.')
  return parts.length === 4
    && parts[0] === '127'
    && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)
}

function isTrustedAuthority(hostUrl: URL, trustedHosts: readonly string[]): boolean {
  return trustedHosts.some((entry) => {
    try {
      const entryUrl = new URL(`http://${entry}`)
      return entry.includes(':') ? entryUrl.host === hostUrl.host : entryUrl.hostname === hostUrl.hostname
    } catch {
      return false
    }
  })
}
