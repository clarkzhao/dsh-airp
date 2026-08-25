import assert from 'node:assert/strict'
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http'
import {
  AIRP_MEDIA_PREFIX,
  createAirpStage,
  isSafeStageName,
  isTrustedStageRequest,
  loopbackOrigin,
  mediaTypeForName,
  stageNameFromUrl,
} from '../src/host/stage.ts'
import { HostRuntime } from '../src/host/runtime.ts'
import { loadPack } from '../src/pack/pack.ts'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EB//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/EB//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/EB//2Q==',
  'base64',
)

function mockRes() {
  const out: { status: number; headers: Record<string, string>; body?: Buffer | string } = {
    status: 0,
    headers: {},
  }
  const res = {
    writeHead(status: number, headers?: Record<string, string>) {
      out.status = status
      out.headers = headers ?? {}
    },
    end(body?: Buffer | string) {
      out.body = body
    },
  }
  return { res: res as unknown as ServerResponse, out }
}

function mockReq(url: string, headers: IncomingHttpHeaders = { host: '127.0.0.1:3080' }, method = 'GET') {
  return { method, url, headers } as IncomingMessage
}

test('safe names and media types', () => {
  assert.equal(isSafeStageName('mashui-cat-1.jpg'), true)
  assert.equal(isSafeStageName('a.webp'), true)
  assert.equal(isSafeStageName('../secret.jpg'), false)
  assert.equal(isSafeStageName('a/b.jpg'), false)
  assert.equal(isSafeStageName('note.txt'), false)
  assert.equal(isSafeStageName(''), false)
  assert.equal(mediaTypeForName('x.JPG'), 'image/jpeg')
  assert.equal(stageNameFromUrl('/airp-media/mashui-cat-1.jpg'), 'mashui-cat-1.jpg')
  assert.equal(stageNameFromUrl('/airp-media/../secret.jpg'), undefined)
  assert.equal(stageNameFromUrl('/airp-media/%2e%2e%2fx.jpg'), undefined)
  assert.equal(loopbackOrigin(3080), 'http://127.0.0.1:3080')
  assert.equal(loopbackOrigin(undefined), undefined)
})

test('markdownUrl is same-origin absolute http, never a relative path', () => {
  const dir = mkdtempSync(join(tmpdir(), 'airp-stage-'))
  try {
    const stage = createAirpStage({ stageDir: dir, origin: () => 'http://127.0.0.1:3080' })
    assert.equal(stage.prefix, AIRP_MEDIA_PREFIX)
    assert.equal(stage.markdownUrl('cat.jpg'), 'http://127.0.0.1:3080/airp-media/cat.jpg')
    assert.match(stage.hint(), /http:\/\/127\.0\.0\.1:3080\/airp-media/)
    const dark = createAirpStage({ stageDir: dir })
    assert.equal(dark.markdownUrl('cat.jpg'), undefined)
    assert.match(dark.hint(), /没有 Web 舞台/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('publish copies into the stage dir and handle serves it', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'airp-stage-'))
  const extra = mkdtempSync(join(tmpdir(), 'airp-extra-'))
  try {
    const src = join(dir, 'src.jpg')
    writeFileSync(src, JPEG)
    const stage = createAirpStage({
      stageDir: join(dir, 'stage'),
      origin: () => 'http://127.0.0.1:3080',
    })
    const published = await stage.publish({ filePath: src })
    assert.equal(published.fileName, 'src.jpg')
    assert.equal(published.url, 'http://127.0.0.1:3080/airp-media/src.jpg')
    assert.equal(published.markdown, '![src.jpg](http://127.0.0.1:3080/airp-media/src.jpg)')

    const ok = mockRes()
    await stage.handle(mockReq('/airp-media/src.jpg'), ok.res)
    assert.equal(ok.out.status, 200)
    assert.equal(ok.out.headers['Content-Type'], 'image/jpeg')
    assert.ok(Buffer.isBuffer(ok.out.body) && (ok.out.body as Buffer).length === JPEG.length)

    writeFileSync(join(extra, 'mounted.jpg'), JPEG)
    const unmount = stage.mountRoot(extra)
    const mounted = mockRes()
    await stage.handle(mockReq('/airp-media/mounted.jpg'), mounted.res)
    assert.equal(mounted.out.status, 200)
    unmount()
    const gone = mockRes()
    await stage.handle(mockReq('/airp-media/mounted.jpg'), gone.res)
    assert.equal(gone.out.status, 404)

    const missing = mockRes()
    await stage.handle(mockReq('/airp-media/nope.jpg'), missing.res)
    assert.equal(missing.out.status, 404)

    const bad = mockRes()
    await stage.handle(mockReq('/airp-media/../src.jpg'), bad.res)
    assert.equal(bad.out.status, 400)

    const forbidden = mockRes()
    await stage.handle(mockReq('/airp-media/src.jpg', { host: 'evil.example' }), forbidden.res)
    assert.equal(forbidden.out.status, 403)
  } finally {
    rmSync(dir, { recursive: true, force: true })
    rmSync(extra, { recursive: true, force: true })
  }
})

test('trust fence allows loopback and trusted hosts, rejects cross-site', () => {
  assert.equal(isTrustedStageRequest({ host: '127.0.0.1:3080' }), true)
  assert.equal(isTrustedStageRequest({ host: 'evil.example' }), false)
  assert.equal(isTrustedStageRequest({ host: 'clarkmac-mini.tailb74d6d.ts.net' }, ['clarkmac-mini.tailb74d6d.ts.net']), true)
  assert.equal(isTrustedStageRequest({
    host: '127.0.0.1:3080',
    'sec-fetch-site': 'cross-site',
  }), false)
})

test('HostRuntime brief stays silent without a stage, and uses the hint when given', async () => {
  const packDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'packs', 'lotm-tingen')
  const loaded = await loadPack(packDir)
  assert.equal(loaded.ok, true)
  const dark = new HostRuntime({ canon: loaded.canon!, sessionId: 's', seed: 'seed' })
  assert.match(dark.bootBrief(), /没有 Web 舞台/)
  assert.doesNotMatch(dark.bootBrief(), /image_gen/)
  const lit = new HostRuntime({
    canon: loaded.canon!,
    sessionId: 's2',
    seed: 'seed',
    stageHint: '舞台 http://127.0.0.1:3080/airp-media/<文件>。',
  })
  assert.match(lit.bootBrief(), /\/airp-media\//)
  assert.doesNotMatch(lit.bootBrief(), /image_gen/)
})
