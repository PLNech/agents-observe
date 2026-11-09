import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import type { ThinkingBlock } from '@/types'
import { format } from 'timeago.js'

/** How many recent blocks the expanded view shows; older ones collapse
 *  into the "earlier N" count. Keeps the DOM tiny on long sessions. */
const EXPANDED_VISIBLE = 5

/**
 * Compact, secondary "thinking" card pinned above the event stream:
 * the latest thinking block tail-read from the session transcript,
 * updated live via the WS `thinking` push (use-websocket writes the
 * ['thinking', sessionId] cache this query reads).
 *
 * Deliberately muted — thinking is context, not an event. Collapsed by
 * default to two lines; expanding shows a few recent blocks plus an
 * "earlier N" hint. Renders nothing until the server reports blocks,
 * so codex sessions and empty transcripts stay clean.
 */
export function ThinkingCard({ sessionId }: { sessionId: string }) {
  const [expanded, setExpanded] = useState(false)
  const { data } = useQuery({
    queryKey: ['thinking', sessionId],
    queryFn: () => api.getSessionThinking(sessionId),
    enabled: !!sessionId,
    // WS pushes keep the cache fresh; refetch only on session switch.
    staleTime: 60_000,
    gcTime: 0,
  })

  const blocks = data?.blocks ?? []
  if (blocks.length === 0) return null

  const latest = blocks[blocks.length - 1]
  const earlier = blocks.length - 1
  const visible = expanded ? blocks.slice(-EXPANDED_VISIBLE) : [latest]
  const hidden = expanded ? Math.max(0, blocks.length - EXPANDED_VISIBLE) : earlier

  return (
    <div
      data-testid="thinking-card"
      className="shrink-0 border-b border-border/50 bg-muted/30 px-3 py-2 text-xs text-muted-foreground italic"
    >
      <div className="mb-1 flex items-center gap-2">
        <span className="font-medium not-italic">Thinking</span>
        <span className="text-[10px] text-muted-foreground/70 dark:text-muted-foreground/50">
          {format(latest.ts)}
        </span>
        {(earlier > 0 || expanded) && (
          <button
            type="button"
            className="ml-auto text-[10px] text-muted-foreground/70 underline-offset-2 hover:underline dark:text-muted-foreground/50"
            onClick={() => setExpanded((e) => !e)}
          >
            {expanded ? 'collapse' : `earlier ${earlier}`}
          </button>
        )}
      </div>
      <div className="space-y-1">
        {visible.map((b) => (
          <ThinkingLine key={b.seq} block={b} expanded={expanded} />
        ))}
      </div>
      {expanded && hidden > 0 && (
        <div className="mt-1 text-[10px] not-italic text-muted-foreground/70 dark:text-muted-foreground/50">
          {hidden} earlier block{hidden === 1 ? '' : 's'} not shown
        </div>
      )}
    </div>
  )
}

function ThinkingLine({ block, expanded }: { block: ThinkingBlock; expanded: boolean }) {
  return (
    <p className={expanded ? 'whitespace-pre-wrap break-words' : 'line-clamp-2 break-words'}>
      {block.text}
    </p>
  )
}
