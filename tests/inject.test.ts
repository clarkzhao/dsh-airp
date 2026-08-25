import assert from 'node:assert/strict'
import { test } from 'node:test'
import { injectNotice, pluginNotice } from '../src/host/inject.ts'

/**
 * Minimal stand-in for DSH ReactLoopAgent.inject → this.send → inbox.validate.
 * Detaching the method loses `this` (reading 'send'). Duplicate undefined ids
 * trip "already pending". AIRP must not do either.
 */
class LoopAgent {
  inbox: Array<{ id?: string }> = []
  send(message: { id?: string }) {
    const ids = new Set(this.inbox.map((item) => item.id))
    if (ids.has(message.id)) throw new Error(`message "${message.id}" is already pending`)
    this.inbox.push(message)
  }
  inject(message: { id?: string }) {
    this.send(message)
  }
}

test('pluginNotice ids are unique so inbox.validate accepts two injects', () => {
  const agent = new LoopAgent()
  agent.inject(pluginNotice('first'))
  agent.inject(pluginNotice('second'))
  assert.equal(agent.inbox.length, 2)
  assert.notEqual(agent.inbox[0]!.id, agent.inbox[1]!.id)
  assert.throws(() => {
    agent.inject({} as { id?: string })
    agent.inject({} as { id?: string })
  }, /already pending/)
})

test('injectNotice uses method call so this.send exists', () => {
  const agent = new LoopAgent()
  const detached = agent.inject
  assert.throws(() => detached(pluginNotice('detached')), /reading ['"]send['"]/)
  injectNotice(agent, 'AIRP 已加载 剑烛大荒·全图')
  injectNotice(agent, 'AIRP 已加载 剑烛大荒·全图')
  assert.equal(agent.inbox.length, 2)
  assert.ok(agent.inbox.every((item) => typeof item.id === 'string' && item.id.length > 0))
})

test('injectNotice swallows inbox rejection instead of throwing to boot', () => {
  assert.doesNotThrow(() => injectNotice({
    inject() {
      throw new Error('message "undefined" is already pending')
    },
  }, 'brief'))
  assert.doesNotThrow(() => injectNotice({
    inject() {
      throw new TypeError("Cannot read properties of undefined (reading 'send')")
    },
  }, 'brief'))
})
