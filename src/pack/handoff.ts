import { isError, type PackDiagnostic } from './pack.ts'

export interface PlayHandoff {
  ok: boolean
  packId: string
  title: string
  dir: string
  preset: 'airp-play'
  how: string[]
  diagnostics: Array<PackDiagnostic & { severity: 'error' | 'warning' }>
}

export function playHandoff(opts: {
  packId: string
  title?: string
  dir: string
  diagnostics?: PackDiagnostic[]
}): PlayHandoff {
  const diagnostics = (opts.diagnostics ?? []).map((d) => ({
    ...d,
    severity: d.severity ?? 'error' as const,
  }))
  const ok = !diagnostics.some(isError)
  return {
    ok,
    packId: opts.packId,
    title: opts.title ?? opts.packId,
    dir: opts.dir,
    preset: 'airp-play',
    how: ok
      ? [
          '已有产出的会话不能热切 preset。请新开一条 AIRP 消费者（airp-play）会话。',
          `开局卡选「${opts.title ?? opts.packId} (${opts.packId})」，或在卡片底部粘贴：${opts.dir}`,
          '不要在创造者会话里继续扮演。那边没有消费者的叙述合同。',
        ]
      : [
          '包还有 error，先 pack_validate 修完再交给消费者。',
        ],
    diagnostics,
  }
}
