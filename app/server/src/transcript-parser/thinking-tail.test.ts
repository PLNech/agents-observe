import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, appendFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ThinkingTailTracker,
  extractThinkingFromLine,
  THINKING_TEXT_MAX_CHARS,
  THINKING_BUFFER_LIMIT,
  thinkingTailTracker,
} from './thinking-tail'

function thinkingLine(text: string, ts = '2026-11-09T10:00:00.000Z', overrides = {}) {
  return {
    type: 'assistant',
    uuid: `u-${Math.random().toString(36).slice(2)}`,
    timestamp: ts,
    message: {
      id: `msg-${Math.random().toString(36).slice(2)}`,
      model: 'claude-opus-4-7',
      content: [{ type: 'thinking', thinking: text }],
      usage: {},
    },
    ...overrides,
  }
}

function textLine(text: string) {
  return {
    type: 'assistant',
    timestamp: '2026-11-09T10:00:01.000Z',
    message: {
      id: `msg-${Math.random().toString(36).slice(2)}`,
      model: 'claude-opus-4-7',
      content: [{ type: 'text', text }],
      usage: {},
    },
  }
}

function toJsonl(lines: unknown[]): string {
  return lines.map((l) => JSON.stringify(l)).join('\n') + '\n'
}

describe('extractThinkingFromLine', () => {
  test('pulls the thinking text and timestamp from an assistant line', () => {
    const found = extractThinkingFromLine(thinkingLine('hmm', '2026-11-09T10:00:02.000Z'))
    expect(found).toHaveLength(1)
    expect(found[0].text).toBe('hmm')
    expect(found[0].ts).toBe(Date.parse('2026-11-09T10:00:02.000Z'))
  })

  test('ignores text blocks, user lines, and malformed input', () => {
    expect(extractThinkingFromLine(textLine('nope'))).toEqual([])
    expect(extractThinkingFromLine({ type: 'user', message: { content: 'hi' } })).toEqual([])
    expect(extractThinkingFromLine(null)).toEqual([])
    expect(extractThinkingFromLine('garbage')).toEqual([])
    // Empty / whitespace thinking counts as nothing.
    expect(extractThinkingFromLine(thinkingLine('   '))).toEqual([])
  })
})

describe('ThinkingTailTracker', () => {
  let dir: string
  let path: string
  let tracker: ThinkingTailTracker

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'thinking-tail-'))
    path = join(dir, 'session.jsonl')
    tracker = new ThinkingTailTracker()
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  test('missing file yields no blocks and no state', async () => {
    expect(await tracker.poll('s1', join(dir, 'nope.jsonl'))).toEqual([])
    expect(tracker.getRecent('s1')).toEqual([])
  })

  test('first poll of an existing file returns its thinking blocks with seq 1..n', async () => {
    writeFileSync(path, toJsonl([thinkingLine('first'), textLine('skip'), thinkingLine('second')]))
    const blocks = await tracker.poll('s1', path)
    expect(blocks.map((b) => b.text)).toEqual(['first', 'second'])
    expect(blocks.map((b) => b.seq)).toEqual([1, 2])
    expect(tracker.getRecent('s1')).toHaveLength(2)
  })

  test('unchanged file polls empty', async () => {
    writeFileSync(path, toJsonl([thinkingLine('only')]))
    await tracker.poll('s1', path)
    expect(await tracker.poll('s1', path)).toEqual([])
  })

  test('appended lines are picked up on the next poll, seq continues', async () => {
    writeFileSync(path, toJsonl([thinkingLine('a')]))
    const first = await tracker.poll('s1', path)
    expect(first).toHaveLength(1)

    appendFileSync(path, toJsonl([thinkingLine('b'), thinkingLine('c')]))
    const second = await tracker.poll('s1', path)
    expect(second.map((b) => b.text)).toEqual(['b', 'c'])
    expect(second.map((b) => b.seq)).toEqual([2, 3])
  })

  test('a partial trailing line is not consumed until its newline lands', async () => {
    const fullLine = JSON.stringify(thinkingLine('complete me'))
    writeFileSync(path, toJsonl([thinkingLine('done')]) + fullLine.slice(0, 20))

    await tracker.poll('s1', path)
    expect(tracker.getRecent('s1')).toHaveLength(1) // only the initial block

    appendFileSync(path, Buffer.from(fullLine.slice(20) + '\n'))
    const grown = await tracker.poll('s1', path)
    expect(grown.map((b) => b.text)).toEqual(['complete me'])
  })

  test('long thinking text is truncated to the wire cap', async () => {
    writeFileSync(path, toJsonl([thinkingLine('x'.repeat(THINKING_TEXT_MAX_CHARS + 500))]))
    const blocks = await tracker.poll('s1', path)
    expect(blocks[0].text.length).toBe(THINKING_TEXT_MAX_CHARS)
  })

  test('buffer caps at THINKING_BUFFER_LIMIT, keeping the newest', async () => {
    const lines = Array.from({ length: THINKING_BUFFER_LIMIT + 10 }, (_, i) =>
      thinkingLine(`t${i}`),
    )
    writeFileSync(path, toJsonl(lines))
    await tracker.poll('s1', path)
    const recent = tracker.getRecent('s1')
    expect(recent).toHaveLength(THINKING_BUFFER_LIMIT)
    expect(recent[recent.length - 1].text).toBe(`t${THINKING_BUFFER_LIMIT + 9}`)
  })

  test('file truncation restarts the read instead of failing', async () => {
    writeFileSync(path, toJsonl([thinkingLine('a'), thinkingLine('b')]))
    await tracker.poll('s1', path)
    writeFileSync(path, toJsonl([thinkingLine('fresh')]))
    const blocks = await tracker.poll('s1', path)
    expect(blocks.map((b) => b.text)).toEqual(['fresh'])
  })

  test('malformed lines are skipped without breaking the stream', async () => {
    writeFileSync(path, '{not json\n' + toJsonl([thinkingLine('ok')]))
    const blocks = await tracker.poll('s1', path)
    expect(blocks.map((b) => b.text)).toEqual(['ok'])
  })

  test('prune drops only idle, unsubscribed states', async () => {
    writeFileSync(path, toJsonl([thinkingLine('a')]))
    await tracker.poll('s1', path)
    await tracker.poll('s2', path)

    const now = Date.now()
    expect(tracker.prune(new Set(['s1']), now, 1000)).toBe(0) // s2 polled just now
    expect(tracker.getRecent('s1')).toHaveLength(1)
    expect(tracker.prune(new Set(['s1']), now + 2000, 1000)).toBe(1) // s2 idle
    expect(tracker.getRecent('s2')).toEqual([])
  })

  test('the shared singleton is usable by both route and tick', async () => {
    thinkingTailTracker.clearAllForTests()
    writeFileSync(path, toJsonl([thinkingLine('shared')]))
    const blocks = await thinkingTailTracker.poll('shared-sess', path)
    expect(blocks.map((b) => b.text)).toEqual(['shared'])
    thinkingTailTracker.clearAllForTests()
  })
})
