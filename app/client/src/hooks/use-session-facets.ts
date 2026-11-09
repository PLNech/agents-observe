import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

/**
 * Cached fetch of `/api/sessions/facets` — per-session tool-category mixes
 * and error counts for the sessions-list facet bar. Facet aggregates move
 * as events land; the default staleTime plus refetch-on-mount (theme
 * switches remount the bar) keep the pills fresh without a polling loop.
 */
export function useSessionFacets() {
  return useQuery({
    queryKey: ['session-facets'],
    queryFn: () => api.getSessionFacets(),
  })
}
