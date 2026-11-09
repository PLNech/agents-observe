import type { EventStore } from '../storage/types'
import { config } from '../config'
import { resolveTranscriptPath } from './transcript-path'
import { thinkingTailTracker, type ThinkingBlock } from '../transcript-parser/thinking-tail'

/**
 * Near-live thinking broadcast. Every THINKING_POLL_INTERVAL_MS the
 * tick looks at each subscribed session's transcript, tail-reads the
 * bytes that grew since the last poll (byte-offset tracking in the
 * tracker — never a full re-parse), and pushes any new thinking blocks
 * to the session's WS subscribers as `{type: 'thinking', data: …}`.
 *
 * Resource guards:
 *  - subscribed sessions only (getSubscribedSessions)
 *  - per-session transcript-path lookup cached for PATH_CACHE_TTL_MS
 *    (one DB hit per minute per session, not per tick)
 *  - the tracker prunes states for sessions no longer subscribed
 */

export const THINKING_POLL_INTERVAL_MS = 5_000
const PATH_CACHE_TTL_MS = 60_000
const TRACKER_IDLE_TTL_MS = 10 * 60_000

export interface ThinkingTickerDeps {
  getSubscribedSessions: () => Set<string>
  getTranscriptPath: (sessionId: string) => Promise<string | null>
  resolvePath: (hostPath: string) => string
  poll: (sessionId: string, path: string) => Promise<ThinkingBlock[]>
  prune: (activeSessionIds: Set<string>, now: number, idleTtlMs: number) => number
  broadcast: (sessionId: string, message: object) => void
  now?: () => number
}

export interface ThinkingTicker {
  tick: () => Promise<void>
  stop: () => void
}

/**
 * Core tick loop, injectable for tests. Each tick:
 *  1. resolves (and caches) each subscribed session's transcript path
 *  2. tail-polls the tracker for new thinking blocks
 *  3. broadcasts non-empty results to that session's subscribers
 *  4. prunes tracker state for sessions nobody watches anymore
 */
export function createThinkingTicker(deps: ThinkingTickerDeps): ThinkingTicker {
  const now = deps.now ?? (() => Date.now())
  const pathCache = new Map<string, { path: string; cachedAt: number }>()

  async function tick(): Promise<void> {
    const active = deps.getSubscribedSessions()

    // Evict path-cache entries for sessions that are no longer subscribed.
    for (const sessionId of pathCache.keys()) {
      if (!active.has(sessionId)) pathCache.delete(sessionId)
    }

    for (const sessionId of active) {
      try {
        let entry = pathCache.get(sessionId)
        if (!entry || now() - entry.cachedAt > PATH_CACHE_TTL_MS) {
          const hostPath = await deps.getTranscriptPath(sessionId)
          entry = {
            path: hostPath ? deps.resolvePath(hostPath) : '',
            cachedAt: now(),
          }
          pathCache.set(sessionId, entry)
        }
        if (!entry.path) continue
        const blocks = await deps.poll(sessionId, entry.path)
        if (blocks.length > 0) {
          deps.broadcast(sessionId, {
            type: 'thinking',
            data: { sessionId, blocks },
          })
        }
      } catch {
        // One broken session must not starve the rest of the tick.
      }
    }

    deps.prune(active, now(), TRACKER_IDLE_TTL_MS)
  }

  return { tick, stop: () => pathCache.clear() }
}

/**
 * Production wiring: real store + websocket + shared tracker, on a
 * setInterval that never keeps the process alive. Returns a stop fn.
 */
export function startThinkingBroadcast(
  store: EventStore,
  getSubscribedSessions: () => Set<string>,
  broadcastToSession: (sessionId: string, message: object) => void,
): () => void {
  const ticker = createThinkingTicker({
    getSubscribedSessions,
    getTranscriptPath: (id) => store.getSessionTranscriptPath(id),
    resolvePath: (hostPath) => resolveTranscriptPath(hostPath, config.transcriptStats.bases),
    poll: (id, path) => thinkingTailTracker.poll(id, path),
    prune: (active, now, ttl) => thinkingTailTracker.prune(active, now, ttl),
    broadcast: broadcastToSession,
  })

  // Feature gate: shares the transcript-stats flag — when transcript
  // files aren't readable there is nothing to tail.
  if (!config.transcriptStats.enabled) {
    return () => {}
  }

  const interval = setInterval(() => {
    void ticker.tick()
  }, THINKING_POLL_INTERVAL_MS)
  interval.unref()

  return () => {
    clearInterval(interval)
    ticker.stop()
  }
}
