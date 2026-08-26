import assert from 'node:assert/strict'
import { test } from 'node:test'
import { denyAuthorTool, DIRECTOR_COMMANDS, intentFromCommand, intentFromTool, isAuthorTool, roleFromPreset, toolsFor } from '../src/host/translate.ts'

test('play mask does not include pack_validate', () => {
  assert.deepEqual([...toolsFor('play')], ['lore_get', 'state_read', 'check_match', 'check_propose', 'state_propose_fact'])
  assert.ok(toolsFor('author').includes('pack_validate'))
  assert.ok(toolsFor('author').includes('pack_scaffold'))
  assert.ok(toolsFor('author').includes('pack_open_play'))
  assert.ok(toolsFor('author').includes('pack_interview'))
  assert.ok(!toolsFor('play').includes('pack_scaffold'))
  assert.ok(!toolsFor('play').includes('pack_open_play'))
  assert.ok(!toolsFor('play').includes('pack_interview'))
  assert.equal(isAuthorTool('pack_validate'), true)
  assert.equal(isAuthorTool('lore_get'), false)
  assert.equal(roleFromPreset('airp-play'), 'play')
  assert.equal(roleFromPreset('airp-author'), 'author')
  assert.equal(roleFromPreset(undefined), 'play')
  assert.equal(denyAuthorTool('pack_validate', 'play'), 'tool pack_validate is not visible to play')
  assert.equal(denyAuthorTool('pack_scaffold', 'play'), 'tool pack_scaffold is not visible to play')
  assert.equal(denyAuthorTool('pack_interview', 'play'), 'tool pack_interview is not visible to play')
  assert.equal(denyAuthorTool('pack_open_play', 'play'), 'tool pack_open_play is not visible to play')
  assert.equal(denyAuthorTool('pack_validate', 'author'), undefined)
  assert.equal(denyAuthorTool('lore_get', 'play'), undefined)
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
  assert.equal('error' in intentFromCommand('gm', ''), true)
})

test('director commands advertise composer input so Web does not fire bare /gm', () => {
  const byName = Object.fromEntries(DIRECTOR_COMMANDS.map((row) => [row.name, row.hint]))
  assert.deepEqual(Object.keys(byName), ['look', 'state', 'retry', 'gm', 'correct', 'ooc'])
  assert.equal(byName.gm, '<pointer>=<json> :: <reason>')
  assert.equal(byName.correct, '<pointer>=<json> :: <reason>')
  assert.match(byName.look, /pointer/)
  assert.match(byName.ooc, /note/)
})
