import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { Hono } from 'hono'
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { EventStore } from '../storage/types'

// Mock config like transcript-stats.test.ts — mutable for flag tests.
const transcriptConfig = vi.hoisted(() => ({
  enabled: true,
  bases: [] as Array<{ host: string; container: string }>,
  maxFileBytes: 100 * 1024 * 1024,
}))
vi.mock('../config', () => ({
  config: { transcriptStats: transcriptConfig, dataDir: '/tmp/agents-observe-test' },
}))

// Import after the mock; reset the shared tracker between tests.
import thinkingRouter from './thinking'
import { thinkingTailTracker } from '../transcript-parser/thinking-tail'

function makeApp(store: Partial<EventStore>) {
  const app = new Hono<{ Variables: { store: EventStore } }>()
  app.use('*', async (c, next) => {
    c.set('store', store as EventStore)
    await next()
  })
  app.route('/api', thinkingRouter)
  return app
}

function thinkingLine(text: string, ts = '2026-11-09T10:00:00.000Z') {
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
  }
}

describe('GET /api/sessions/:sessionId/thinking', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'thinking-route-'))
    transcriptConfig.enabled = true
    transcriptConfig.bases = []
    thinkingTailTracker.clearAllForTests()
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  test('returns 404 disabled when the transcript feature flag is off', async () => {
    transcriptConfig.enabled = false
    const app = makeApp({ getSessionTranscriptPath: async () => '/never.jsonl' })
    const res = await app.request('/api/sessions/s1/thinking')
    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe('disabled')
  })

  test('returns 404 no_transcript when the session has no transcript path', async () => {
    const app = makeApp({ getSessionTranscriptPath: async () => null })
    const res = await app.request('/api/sessions/s1/thinking')
    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe('no_transcript')
  })

  test('returns 404 file_not_found when the transcript file is missing', async () => {
    const app = makeApp({
      getSessionTranscriptPath: async () => join(dir, 'missing.jsonl'),
    })
    const res = await app.request('/api/sessions/s1/thinking')
    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe('file_not_found')
  })

  test('returns recent thinking blocks for an existing transcript', async () => {
    const path = join(dir, 'session.jsonl')
    writeFileSync(
      path,
      [thinkingLine('first thought'), thinkingLine('second thought', '2026-11-09T10:00:05.000Z')]
        .map((l) => JSON.stringify(l))
        .join('\n') + '\n',
    )
    const app = makeApp({ getSessionTranscriptPath: async () => path })
    const res = await app.request('/api/sessions/sess-1/thinking')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.sessionId).toBe('sess-1')
    expect(body.total).toBe(2)
    expect(body.blocks.map((b: any) => b.text)).toEqual(['first thought', 'second thought'])
    expect(body.blocks.map((b: any) => b.seq)).toEqual([1, 2])
    expect(body.blocks[0].ts).toBe(Date.parse('2026-11-09T10:00:00.000Z'))
  })

  test('?since=<seq> filters out already-seen blocks', async () => {
    const path = join(dir, 'session.jsonl')
    writeFileSync(
      path,
      [thinkingLine('a'), thinkingLine('b'), thinkingLine('c')]
        .map((l) => JSON.stringify(l))
        .join('\n') + '\n',
    )
    const app = makeApp({ getSessionTranscriptPath: async () => path })
    const res = await app.request('/api/sessions/s1/thinking?since=1')
    const body = await res.json()
    expect(body.blocks.map((b: any) => b.text)).toEqual(['b', 'c'])
    expect(body.total).toBe(3)
  })

  test('picks up appended thinking on a second fetch (tail-read, shared tracker)', async () => {
    const path = join(dir, 'session.jsonl')
    writeFileSync(path, JSON.stringify(thinkingLine('a')) + '\n')
    const app = makeApp({ getSessionTranscriptPath: async () => path })
    const first = await (await app.request('/api/sessions/s1/thinking')).json()
    expect(first.blocks).toHaveLength(1)

    const { appendFileSync } = await import('node:fs')
    appendFileSync(path, JSON.stringify(thinkingLine('b')) + '\n')
    const second = await (await app.request('/api/sessions/s1/thinking')).json()
    expect(second.blocks.map((b: any) => b.text)).toEqual(['a', 'b'])
    expect(second.blocks[1].seq).toBe(2)
  })
})
