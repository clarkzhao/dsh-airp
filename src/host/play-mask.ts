import type { Context } from '@deepseek-ai/cordis'

/** Preset-local: hide author-only tools from airp-play. */
export const name = 'airp-play-mask'
export const inject = ['tools']

export function apply(ctx: Context): void {
  ctx.tools.restrict({ deny: ['pack_validate', 'pack_scaffold'] })
}
