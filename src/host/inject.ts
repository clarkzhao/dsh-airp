import { randomUUID } from 'node:crypto'

const CONTEXT_SUMMARY_MAX = 120

export interface PluginNotice {
  id: string
  role: 'user'
  content: Array<{ type: 'text'; text: string }>
  source: { kind: 'plugin'; plugin: 'dsh-airp'; form: 'notice'; summary: string }
}

export function pluginNotice(text: string, summary?: string): PluginNotice {
  const line = (summary ?? text.split('\n')[0] ?? text).trim()
  const clipped = line.length <= CONTEXT_SUMMARY_MAX ? line : `${line.slice(0, CONTEXT_SUMMARY_MAX - 1)}…`
  return {
    id: randomUUID(),
    role: 'user',
    content: [{ type: 'text', text }],
    source: { kind: 'plugin', plugin: 'dsh-airp', form: 'notice', summary: clipped || 'AIRP' },
  }
}

export function injectNotice(agent: { inject?: (msg: never) => void }, text: string, summary?: string): void {
  if (typeof agent.inject !== 'function') return
  try {
    // Call as a method so ReactLoopAgent.inject keeps `this` for this.send().
    agent.inject(pluginNotice(text, summary) as never)
  } catch {
    /* inbox may reject; indexText still lands via systemPrompt */
  }
}
