import { useMemo, useState } from 'react'
import { useUIStore } from '@/stores/ui-store'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { RecentSession, SessionFacets } from '@/types'

// Mirrors the server's closed category set
// (app/server/src/utils/tool-categories.ts). Duplicated client-side so the
// dashboard bundle never imports server code; keep the two in sync.
const TOOL_CATEGORIES = [
  'shell',
  'edit',
  'read',
  'web',
  'delegate',
  'skill',
  'mcp',
  'meta',
  'ask',
  'other',
] as const

const TOOL_CATEGORY_LABELS: Record<(typeof TOOL_CATEGORIES)[number], string> = {
  shell: 'Shell',
  edit: 'Edit',
  read: 'Read',
  web: 'Web',
  delegate: 'Delegate',
  skill: 'Skill',
  mcp: 'MCP',
  meta: 'Meta',
  ask: 'Ask',
  other: 'Other',
}

const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  ended: 'Ended',
}

// Tags are unbounded (the NLP layer derives them); the bar shows the most
// common TAG_PILL_LIMIT and a "+N more" expander past that.
const TAG_PILL_LIMIT = 12

export interface FacetFilters {
  categories: string[]
  statuses: string[]
  agentClasses: string[]
  /** Tag strings (cluster ids stay strings for pill symmetry). */
  tags: string[]
  /** Cluster ids as strings, e.g. '0'. */
  clusters: string[]
}

/**
 * Client-side facet filter over the sessions prop. Every axis is an OR
 * within itself and the axes AND together; an empty selection on an axis
 * means "show all" for that axis.
 */
export function filterSessionsByFacets(
  sessions: RecentSession[],
  facets: SessionFacets | null,
  filters: FacetFilters,
): RecentSession[] {
  const { categories, statuses, agentClasses, tags, clusters } = filters
  if (
    categories.length === 0 &&
    statuses.length === 0 &&
    agentClasses.length === 0 &&
    tags.length === 0 &&
    clusters.length === 0
  ) {
    return sessions
  }
  return sessions.filter((session) => {
    if (statuses.length > 0 && !statuses.includes(session.status)) return false
    if (agentClasses.length > 0 && !session.agentClasses.some((c) => agentClasses.includes(c))) {
      return false
    }
    if (categories.length > 0) {
      // A session with no facet row has no recorded tool use, so it can't
      // match a category selection.
      const cats = facets?.sessions[session.id]?.toolCategories
      if (!cats || !categories.some((c) => (cats[c] ?? 0) > 0)) return false
    }
    if (tags.length > 0) {
      // Same rule: no facet row means no NLP tags, so no tag can match.
      const sessionTags = facets?.sessions[session.id]?.tags
      if (!sessionTags || !tags.some((t) => sessionTags.includes(t))) return false
    }
    if (clusters.length > 0) {
      const cluster = facets?.sessions[session.id]?.cluster
      if (cluster === null || cluster === undefined || !clusters.includes(String(cluster))) {
        return false
      }
    }
    return true
  })
}

interface FacetPill {
  value: string
  label: string
  count: number
  active: boolean
  onToggle: () => void
}

function FacetPillButton({ pill }: { pill: FacetPill }) {
  return (
    <Button
      variant={pill.active ? 'default' : 'outline'}
      size="xs"
      className={cn('rounded-full', !pill.active && 'text-muted-foreground')}
      onClick={pill.onToggle}
      title={`${pill.active ? 'Remove' : 'Add'} filter: ${pill.label}`}
    >
      {pill.label}
      <span className={cn('ml-0.5 tabular-nums', pill.active ? 'opacity-80' : 'opacity-60')}>
        {pill.count}
      </span>
    </Button>
  )
}

interface FacetBarProps {
  /** The unfiltered recent sessions — pill counts always reflect the full list. */
  sessions: RecentSession[]
  /** /sessions/facets aggregates; null while loading or on fetch failure. */
  facets: SessionFacets | null
}

/**
 * Multi-select facet filter bar for the sessions-list theme: tool category
 * (from /sessions/facets), status, harness (agent classes, derived from
 * the sessions prop), NLP tags and KMeans cluster (both from /sessions/
 * facets). Selections persist in the UI store across theme switches.
 * Project filtering stays in the sidebar.
 */
export function FacetBar({ sessions, facets }: FacetBarProps) {
  const facetCategories = useUIStore((s) => s.facetCategories)
  const facetStatuses = useUIStore((s) => s.facetStatuses)
  const facetAgentClasses = useUIStore((s) => s.facetAgentClasses)
  const facetTags = useUIStore((s) => s.facetTags)
  const facetClusters = useUIStore((s) => s.facetClusters)
  const toggleFacetCategory = useUIStore((s) => s.toggleFacetCategory)
  const toggleFacetStatus = useUIStore((s) => s.toggleFacetStatus)
  const toggleFacetAgentClass = useUIStore((s) => s.toggleFacetAgentClass)
  const toggleFacetTag = useUIStore((s) => s.toggleFacetTag)
  const toggleFacetCluster = useUIStore((s) => s.toggleFacetCluster)
  const clearFacetFilters = useUIStore((s) => s.clearFacetFilters)
  const [tagsExpanded, setTagsExpanded] = useState(false)

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const session of sessions) counts[session.status] = (counts[session.status] ?? 0) + 1
    return counts
  }, [sessions])

  // A session can carry several agent classes (e.g. main + subagent lanes),
  // so it counts toward each class it used.
  const harnessCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const session of sessions) {
      for (const agentClass of session.agentClasses) {
        counts[agentClass] = (counts[agentClass] ?? 0) + 1
      }
    }
    return counts
  }, [sessions])

  if (sessions.length === 0) return null

  const hasSelection =
    facetCategories.length > 0 ||
    facetStatuses.length > 0 ||
    facetAgentClasses.length > 0 ||
    facetTags.length > 0 ||
    facetClusters.length > 0

  const tagEntries = Object.entries(facets?.tagSessionCounts ?? {})
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const visibleTagEntries = tagsExpanded ? tagEntries : tagEntries.slice(0, TAG_PILL_LIMIT)

  const groups: { pills: FacetPill[] }[] = [
    {
      pills: TOOL_CATEGORIES.filter((c) => (facets?.categorySessionCounts[c] ?? 0) > 0).map(
        (category) => ({
          value: category,
          label: TOOL_CATEGORY_LABELS[category],
          count: facets?.categorySessionCounts[category] ?? 0,
          active: facetCategories.includes(category),
          onToggle: () => toggleFacetCategory(category),
        }),
      ),
    },
    {
      pills: ['active', 'ended']
        .filter((status) => (statusCounts[status] ?? 0) > 0)
        .map((status) => ({
          value: status,
          label: STATUS_LABELS[status] ?? status,
          count: statusCounts[status] ?? 0,
          active: facetStatuses.includes(status),
          onToggle: () => toggleFacetStatus(status),
        })),
    },
    {
      pills: Object.keys(harnessCounts)
        .sort()
        .map((agentClass) => ({
          value: agentClass,
          label: agentClass,
          count: harnessCounts[agentClass],
          active: facetAgentClasses.includes(agentClass),
          onToggle: () => toggleFacetAgentClass(agentClass),
        })),
    },
    {
      pills: visibleTagEntries.map(([tag, count]) => ({
        value: tag,
        label: tag,
        count,
        active: facetTags.includes(tag),
        onToggle: () => toggleFacetTag(tag),
      })),
    },
    {
      pills: (facets?.clustersPresent ?? []).map((cluster) => ({
        value: String(cluster),
        label: `Cluster ${cluster}`,
        count: Object.values(facets?.sessions ?? {}).filter((f) => f.cluster === cluster).length,
        active: facetClusters.includes(String(cluster)),
        onToggle: () => toggleFacetCluster(String(cluster)),
      })),
    },
  ].filter((group) => group.pills.length > 0)

  if (groups.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2 border-b border-border">
      {groups.map((group, i) => (
        <div key={i} className="flex flex-wrap items-center gap-1.5">
          {group.pills.map((pill) => (
            <FacetPillButton key={pill.value} pill={pill} />
          ))}
        </div>
      ))}
      {tagEntries.length > TAG_PILL_LIMIT && (
        <Button
          variant="ghost"
          size="xs"
          className="rounded-full text-muted-foreground"
          onClick={() => setTagsExpanded((v) => !v)}
          title={tagsExpanded ? 'Show fewer tags' : 'Show all tags'}
        >
          {tagsExpanded ? 'Less' : `+${tagEntries.length - TAG_PILL_LIMIT} more`}
        </Button>
      )}
      {hasSelection && (
        <Button
          variant="ghost"
          size="xs"
          className="rounded-full text-muted-foreground"
          onClick={clearFacetFilters}
          title="Clear facet filters"
        >
          Clear
        </Button>
      )}
    </div>
  )
}
