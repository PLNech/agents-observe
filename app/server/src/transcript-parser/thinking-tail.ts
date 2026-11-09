import { promises as fsp } from 'node:fs'

/**
 * A single thinking block tail-read from a Claude Code transcript.
 * `seq` is a per-session monotonic counter assigned in file order —
 * the client keys on it to merge poll results without duplicates.
 */
export interface ThinkingBlock {
  /** Line timestamp (ms since epoch); 0 when the line carried none. */
  ts: number
  /** Thinking text, truncated to THINKING_TEXT_MAX_CHARS. */
  text: string
  seq: number
}

// ── Tunables ──────────────────────────────────────────────────────

/** Hard cap on any single thinking block sent over the wire. */
export const THINKING_TEXT_MAX_CHARS = 2000
/** Recent-block ring buffer kept per session for route serving. */
export const THINKING_BUFFER_LIMIT = 50
/**
 * On first sight of a session we skip straight to the file tail — a
 * full backfill of a long transcript costs a whole-file read for
 * blocks nobody is watching anymore. 32 KB covers the last handful of
 * thinking blocks in practice.
 */
export const THINKING_INITIAL_WINDOW_BYTES = 32 * 1024
/** A single unterminated line longer than this is dropped, not buffered. */
const MAX_PENDING_BYTES = 1024 * 1024

interface TailState {
  path: string
  /** Next byte offset to read. Always at a line boundary (or the
   *  initial window start, whose first partial line fails JSON.parse
   *  and is skipped naturally). */
  offset: number
  /** Bytes of an unterminated trailing line carried over to the next read. */
  pending: Buffer
  seq: number
  buffer: ThinkingBlock[]
  lastPolledAt: number
}

/**
 * Extract the thinking blocks from one transcript JSONL line.
 * Claude Code emits thinking as assistant-message content blocks with
 * `type: 'thinking'` and the text in `thinking`. Everything else
 * (user lines, tool_use, plain text, malformed JSON) yields [].
 * Exported pure for tests.
 */
export function extractThinkingFromLine(line: unknown): Array<{ ts: number; text: string }> {
  if (!line || typeof line !== 'object') return []
  const rec = line as Record<string, unknown>
  if (rec.type !== 'assistant') return []
  const message = rec.message as Record<string, unknown> | undefined
  if (!message || !Array.isArray(message.content)) return []
  const ts = typeof rec.timestamp === 'string' ? Date.parse(rec.timestamp) : 0
  const out: Array<{ ts: number; text: string }> = []
  for (const block of message.content) {
    if (!block || typeof block !== 'object') continue
    const b = block as Record<string, unknown>
    if (b.type !== 'thinking') continue
    if (typeof b.thinking !== 'string' || b.thinking.trim() === '') continue
    out.push({ ts: Number.isFinite(ts) ? ts : 0, text: b.thinking })
  }
  return out
}

/**
 * Per-session tail reader for transcript thinking blocks. Tracks one
 * byte offset per session so repeated polls only read what grew —
 * never a whole-transcript re-parse. A small ring buffer of recent
 * blocks serves the REST route without touching the file again.
 *
 * The module-level `thinkingTailTracker` instance is shared by the
 * REST route and the WS broadcast tick so `seq` stays monotonic per
 * session no matter which path a block arrives through.
 */
export class ThinkingTailTracker {
  private states = new Map<string, TailState>()

  /**
   * Read any newly-appended bytes of `path` for `sessionId` and return
   * the thinking blocks found there (newest last, seq assigned in
   * order). First sighting starts at the tail window, not byte 0.
   * Missing/unreadable files drop the state silently — the next poll
   * re-inits (and re-backfills the window) if the file returns.
   */
  async poll(sessionId: string, path: string): Promise<ThinkingBlock[]> {
    let stat
    try {
      stat = await fsp.stat(path)
    } catch {
      this.states.delete(sessionId)
      return []
    }

    let state = this.states.get(sessionId)
    if (!state || state.path !== path) {
      state = {
        path,
        offset: Math.max(0, stat.size - THINKING_INITIAL_WINDOW_BYTES),
        pending: Buffer.alloc(0),
        seq: 0,
        buffer: [],
        lastPolledAt: 0,
      }
      this.states.set(sessionId, state)
    }
    state.lastPolledAt = Date.now()

    // Truncated or replaced by a shorter file — restart from the top.
    if (stat.size < state.offset) {
      state.offset = 0
      state.pending = Buffer.alloc(0)
    }
    // Nothing grew: a carried-over partial line can only complete when
    // new bytes arrive, so a no-growth poll is always empty.
    if (stat.size === state.offset) return []

    // Read every byte appended since the last poll. Invariant: offset
    // always points at the first byte NOT yet captured in memory —
    // after this read that is the end of file, with any unterminated
    // trailing line held in `pending` (never re-read).
    const start = state.offset
    const length = stat.size - start
    const buf = Buffer.alloc(length)
    const fh = await fsp.open(path, 'r')
    try {
      await fh.read(buf, 0, length, start)
    } finally {
      await fh.close()
    }
    state.offset = stat.size

    // Only consume up to the last complete line; the trailing partial
    // line waits in `pending` for its newline.
    let lastNewline = -1
    for (let i = buf.length - 1; i >= 0; i--) {
      if (buf[i] === 0x0a) {
        lastNewline = i
        break
      }
    }
    if (lastNewline === -1) {
      // No complete line in this chunk — buffer it (capped) and bail.
      state.pending = appendCapped(state.pending, buf)
      return []
    }
    const complete = Buffer.concat([state.pending, buf.subarray(0, lastNewline + 1)])
    state.pending = Buffer.alloc(0)
    if (lastNewline + 1 < buf.length) {
      state.pending = appendCapped(state.pending, buf.subarray(lastNewline + 1))
    }

    const blocks: ThinkingBlock[] = []
    for (const raw of complete.toString('utf8').split('\n')) {
      if (!raw.trim()) continue
      let line: unknown
      try {
        line = JSON.parse(raw)
      } catch {
        continue
      }
      for (const found of extractThinkingFromLine(line)) {
        state.seq += 1
        blocks.push({
          ts: found.ts,
          text:
            found.text.length > THINKING_TEXT_MAX_CHARS
              ? found.text.slice(0, THINKING_TEXT_MAX_CHARS)
              : found.text,
          seq: state.seq,
        })
      }
    }

    if (blocks.length > 0) {
      state.buffer.push(...blocks)
      if (state.buffer.length > THINKING_BUFFER_LIMIT) {
        state.buffer.splice(0, state.buffer.length - THINKING_BUFFER_LIMIT)
      }
    }
    return blocks
  }

  /** Recent blocks buffered for a session (oldest first). */
  getRecent(sessionId: string): ThinkingBlock[] {
    return this.states.get(sessionId)?.buffer ?? []
  }

  /**
   * Drop states for sessions that are neither actively subscribed nor
   * polled within `idleTtlMs` — keeps the map bounded when sessions
   * churn. Returns the number of states dropped.
   */
  prune(activeSessionIds: Set<string>, now: number, idleTtlMs: number): number {
    let dropped = 0
    for (const [sessionId, state] of this.states) {
      if (activeSessionIds.has(sessionId)) continue
      if (now - state.lastPolledAt > idleTtlMs) {
        this.states.delete(sessionId)
        dropped += 1
      }
    }
    return dropped
  }

  /** Test-only: drop all state. */
  clearAllForTests(): void {
    this.states.clear()
  }
}

function appendCapped(current: Buffer, addition: Buffer): Buffer {
  const merged = Buffer.concat([current, addition])
  if (merged.length <= MAX_PENDING_BYTES) return merged
  // Keep only the tail — the dropped prefix is a partial line too
  // large to be a thinking block worth waiting for.
  return merged.subarray(merged.length - MAX_PENDING_BYTES)
}

/** Shared singleton — the REST route and the WS tick must agree on seq. */
export const thinkingTailTracker = new ThinkingTailTracker()
