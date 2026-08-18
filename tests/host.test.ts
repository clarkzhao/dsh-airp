import assert from 'node:assert/strict'
import { test } from 'node:test'
import { intentFromCommand, intentFromTool, toolsFor } from '../src/host/translate.ts'

test('play mask does not include pack_validate', () => {
  assert.deepEqual([...toolsFor('play')], ['lore_get', 'state_read', 'check_match', 'check_propose', 'state_propose_fact'])
  assert.ok(toolsFor('author').includes('pack_validate'))
  assert.ok(toolsFor('author').includes('pack_scaffold'))
  assert.ok(toolsFor('author').includes('pack_open_play'))
  assert.ok(toolsFor('author').includes('pack_interview'))
  assert.ok(!toolsFor('play').includes('pack_scaffold'))
  assert.ok(!toolsFor('play').includes('pack_open_play'))
  assert.ok(!toolsFor('play').includes('pack_interview'))
})

test('tool names translate to kernel intents', () => {
  assert.deepEqual(intentFromTool('lore_get', { key: 'axioms' }), { type: 'lore', key: 'axioms' })
  assert.deepEqual(intentFromTool('check_propose', { checkId: 'contest-sequence', actors: { attacker: 'klein' } }), {
    type: 'check',
    checkId: 'contest-sequence',
    actors: { attacker: 'klein' },
  })
  assert.deepEqual(intentFromTool('state_propose_fact', { pointer: 'facts.weather', value: '雨' }), {
    type: 'fact',
    pointer: 'facts.weather',
    value: '雨',
  })
})

test('retry is fork, not a turn intent', () => {
  assert.deepEqual(intentFromCommand('retry', ''), { fork: true, checkId: undefined })
  assert.deepEqual(intentFromCommand('retry', 'contest-sequence'), { fork: true, checkId: 'contest-sequence' })
})

test('gm parses pointer and required reason', () => {
  assert.deepEqual(intentFromCommand('gm', 'facts.alarm=true :: 卡死了'), {
    type: 'gm',
    patch: { 'facts.alarm': true },
    reason: '卡死了',
  })
  assert.equal('error' in intentFromCommand('gm', 'facts.alarm=true'), true)
})
