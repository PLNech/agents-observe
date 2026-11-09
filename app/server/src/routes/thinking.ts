import { Hono } from 'hono'
import { promises as fs } from 'node:fs'
import type { EventStore } from '../storage/types'
import { config } from '../config'
import { resolveTranscriptPath } from '../services/transcript-path'
import { thinkingTailTracker } from '../transcript-parser/thinking-tail'

type Env = { Variables: { store: EventStore } }

/**
 * GET /api/sessions/:sessionId/thinking
 *
 * Recent thinking blocks tail-read from the session's transcript.
 * Shares the ThinkingTailTracker singleton with the WS broadcast tick,
 * so `seq` is monotonic per session across both paths and the client
 * can merge without duplicates. `?since=<seq>` filters to blocks newer
 * than a seq the client has already seen; `total` is the tracker's
 * buffered count so the UI can show an "earlier N" hint without
 * fetching history.
 */
const router = new Hono<Env>()

router.get('/sessions/:sessionId/thinking', async (c) => {
  if (!config.transcriptStats.enabled) {
    return c.json(
      {
        error: 'disabled',
        message:
          'Transcript parsing is disabled. Unset AGENTS_OBSERVE_TRANSCRIPT_STATS (or remove the =0 override) on the server to re-enable.',
      },
      404,
    )
  }

  const sessionId = c.req.param('sessionId')
  const store = c.get('store')
  const hostPath = await store.getSessionTranscriptPath(sessionId)
  if (!hostPath) {
    return c.json({ error: 'no_transcript', message: 'No transcript path found for session.' }, 404)
  }

  const resolved = resolveTranscriptPath(hostPath, config.transcriptStats.bases)

  try {
    await fs.stat(resolved)
  } catch (err: any) {
    if (err?.code === 'ENOENT') {
      return c.json({ error: 'file_not_found', message: 'Transcript file not found.' }, 404)
    }
    if (err?.code === 'EACCES') {
      return c.json(
        {
          error: 'file_unreadable',
          message: `Transcript file exists but is not readable by the server process: ${err.message}`,
        },
        403,
      )
    }
    throw err
  }

  // Tail-read anything new, then serve from the tracker buffer.
  await thinkingTailTracker.poll(sessionId, resolved)
  const recent = thinkingTailTracker.getRecent(sessionId)
  const since = Number(c.req.query('since') ?? 0)
  const blocks = since > 0 ? recent.filter((b) => b.seq > since) : recent

  return c.json({ sessionId, blocks, total: recent.length }, 200)
})

export default router
