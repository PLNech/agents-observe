import { useMemo } from 'react'
import { List } from 'lucide-react'
import { useUIStore } from '@/stores/ui-store'
import { SessionList } from '@/components/main-panel/session-list'
import { FacetBar, filterSessionsByFacets } from '@/components/main-panel/facet-bar'
import { useSessionFacets } from '@/hooks/use-session-facets'
import type { DashboardTheme, DashboardThemeProps } from '../../types'

/**
 * The classic vertical list of recent sessions — the default dashboard theme.
 * SessionList handles its own click→navigation, so onOpenSession is unused here.
 * A facet bar (tool category / status / harness) filters the list client-side.
 */
function SessionsListView({ sessions, isLoading }: DashboardThemeProps) {
  const sessionSortOrder = useUIStore((s) => s.sessionSortOrder)
  const facetCategories = useUIStore((s) => s.facetCategories)
  const facetStatuses = useUIStore((s) => s.facetStatuses)
  const facetAgentClasses = useUIStore((s) => s.facetAgentClasses)
  const { data: facets } = useSessionFacets()

  const filteredSessions = useMemo(
    () =>
      filterSessionsByFacets(sessions, facets ?? null, {
        categories: facetCategories,
        statuses: facetStatuses,
        agentClasses: facetAgentClasses,
      }),
    [sessions, facets, facetCategories, facetStatuses, facetAgentClasses],
  )

  return (
    <div className="h-full flex flex-col">
      {!isLoading && sessions.length > 0 && (
        <FacetBar sessions={sessions} facets={facets ?? null} />
      )}
      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="flex items-center justify-center h-32 text-xs text-muted-foreground">
            Loading...
          </div>
        )}
        {!isLoading && sessions.length > 0 && filteredSessions.length > 0 && (
          <SessionList sessions={filteredSessions} showProject sortBy={sessionSortOrder} />
        )}
        {!isLoading && sessions.length > 0 && filteredSessions.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-2">
            <span className="text-sm">No sessions match the selected filters</span>
            <span className="text-xs">Toggle a facet pill off to widen the list</span>
          </div>
        )}
      </div>
    </div>
  )
}

export const sessionsListTheme: DashboardTheme = {
  id: 'sessions-list',
  name: 'List',
  description: 'The classic vertical list of recent sessions.',
  icon: List,
  usesSort: true,
  Component: SessionsListView,
}
