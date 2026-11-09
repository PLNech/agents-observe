import { describe, test, expect, vi } from 'vitest'
import {
  createThinkingTicker,
  THINKING_POLL_INTERVAL_MS,
  type ThinkingTickerDeps,
} from './thinking-broadcast'
import type { ThinkingBlock } from '../transcript-parser/thinking-tail'

function makeDeps(overrides: Partial<ThinkingTickerDeps> = {}): ThinkingTickerDeps & {
  broadcasts: Array<{ sessionId: string; message: object }>
  pathLookups: string[]
} {
  const broadcasts: Array<{ sessionId: string; message: object }> = []
  const pathLookups: string[] = []
  const deps = {
    getSubscribedSessions: () => new Set(['s1']),
    getTranscriptPath: (id: string) => {
      pathLookups.push(id)
      return Promise.resolve(`/host/${id}.jsonl`)
    },
    resolvePath: (hostPath: string) => hostPath.replace('/host/', '/container/'),
    poll: () => Promise.resolve<ThinkingBlock[]>([]),
    prune: () => 0,
    broadcast: (sessionId: string, message: object) => {
      broadcasts.push({ sessionId, message })
    },
    ...overrides,
    broadcasts,
    pathLookups,
  }
  return deps as typeof deps & ThinkingTickerDeps
}

describe('createThinkingTicker', () => {
  test('broadcasts new thinking blocks to the subscribed session', async () => {
    const deps = makeDeps({
      poll: () => Promise.resolve<ThinkingBlock[]>([{ ts: 1, text: 'hmm', seq: 1 }]),
    })
    const ticker = createThinkingTicker(deps)
    await ticker.tick()

    expect(deps.broadcasts).toHaveLength(1)
    expect(deps.broadcasts[0].sessionId).toBe('s1')
    expect(deps.broadcasts[0].message).toEqual({
      type: 'thinking',
      data: { sessionId: 's1', blocks: [{ ts: 1, text: 'hmm', seq: 1 }] },
    })
  })

  test('broadcasts nothing when a poll yields no new blocks', async () => {
    const deps = makeDeps()
    const ticker = createThinkingTicker(deps)
    await ticker.tick()
    expect(deps.broadcasts).toHaveLength(0)
  })

  test('skips subscribed sessions with no transcript path', async () => {
    const deps = makeDeps({
      getTranscriptPath: () => Promise.resolve(null),
      poll: vi.fn(() => Promise.resolve<ThinkingBlock[]>([{ ts: 1, text: 'x', seq: 1 }])),
    })
    const ticker = createThinkingTicker(deps)
    await ticker.tick()
    expect(deps.broadcasts).toHaveLength(0)
    expect(deps.poll).not.toHaveBeenCalled()
  })

  test('caches the transcript path between ticks and refreshes after the TTL', async () => {
    let clock = 0
    const deps = makeDeps({ now: () => clock })
    const ticker = createThinkingTicker(deps)

    await ticker.tick()
    await ticker.tick()
    expect(deps.pathLookups).toEqual(['s1']) // cached

    clock = 61_000 // past the 60s TTL
    await ticker.tick()
    expect(deps.pathLookups).toEqual(['s1', 's1'])
  })

  test('evicts path-cache entries for unsubscribed sessions', async () => {
    let subscribed = new Set(['s1', 's2'])
    const deps = makeDeps({
      getSubscribedSessions: () => subscribed,
      getTranscriptPath: (id: string) => {
        deps.pathLookups.push(id)
        return Promise.resolve(`/host/${id}.jsonl`)
      },
    })
    const ticker = createThinkingTicker(deps)
    await ticker.tick()
    expect([...deps.pathLookups].sort()).toEqual(['s1', 's2'])

    // s2 unsubscribes — its cache entry is dropped, so a re-subscribe
    // pays for a fresh lookup while s1 stays cached.
    subscribed = new Set(['s1'])
    await ticker.tick()
    expect(deps.pathLookups).toEqual(['s1', 's2'])

    subscribed = new Set(['s1', 's2'])
    await ticker.tick()
    expect(deps.pathLookups).toEqual(['s1', 's2', 's2'])
  })

  test('one failing session does not starve the others', async () => {
    const deps = makeDeps({
      getSubscribedSessions: () => new Set(['bad', 'good']),
      getTranscriptPath: (id: string) =>
        id === 'bad' ? Promise.reject(new Error('db down')) : Promise.resolve('/host/good.jsonl'),
      poll: () => Promise.resolve<ThinkingBlock[]>([{ ts: 1, text: 'x', seq: 1 }]),
    })
    const ticker = createThinkingTicker(deps)
    await ticker.tick()
    expect(deps.broadcasts.map((b) => b.sessionId)).toEqual(['good'])
  })

  test('prune is called with the active set and idle TTL', async () => {
    const prune = vi.fn(() => 0)
    const clock = 1234
    const deps = makeDeps({ prune, now: () => clock })
    const ticker = createThinkingTicker(deps)
    await ticker.tick()
    expect(prune).toHaveBeenCalledWith(new Set(['s1']), clock, expect.any(Number))
  })

  test('poll interval constant is the documented 5s throttle', () => {
    expect(THINKING_POLL_INTERVAL_MS).toBe(5_000)
  })
})
