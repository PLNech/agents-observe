import { describe, it, expect, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithProviders } from '@/test/test-utils'
import { FacetBar, filterSessionsByFacets } from './facet-bar'
import { useUIStore } from '@/stores/ui-store'
import type { RecentSession, SessionFacets } from '@/types'

function makeSession(overrides: Partial<RecentSession>): RecentSession {
  return {
    id: 'sess-1',
    projectId: null,
    projectSlug: null,
    projectName: null,
    slug: null,
    status: 'active',
    startedAt: 1000,
    stoppedAt: null,
    metadata: null,
    lastActivity: 1000,
    agentClasses: [],
    ...overrides,
  }
}

const facets: SessionFacets = {
  sessions: {
    'sess-shell': {
      toolCategories: { shell: 4 },
      toolFailures: 0,
      permissionDenied: 0,
      subagentEvents: 0,
      tags: ['git', 'sqlite'],
      cluster: 0,
    },
    'sess-edit': {
      toolCategories: { edit: 2, shell: 1 },
      toolFailures: 1,
      permissionDenied: 0,
      subagentEvents: 0,
      tags: ['sqlite'],
      cluster: 1,
    },
  },
  categorySessionCounts: { shell: 2, edit: 1 },
  tagSessionCounts: { git: 1, sqlite: 2 },
  clustersPresent: [0, 1],
}

const sessions: RecentSession[] = [
  makeSession({ id: 'sess-shell', status: 'active', agentClasses: ['claude-code'] }),
  makeSession({ id: 'sess-edit', status: 'ended', agentClasses: ['claude-code', 'codex'] }),
]

beforeEach(() => {
  useUIStore.setState({
    facetCategories: [],
    facetStatuses: [],
    facetAgentClasses: [],
    facetTags: [],
    facetClusters: [],
  })
})

describe('filterSessionsByFacets', () => {
  it('returns all sessions when no filter is selected', () => {
    expect(
      filterSessionsByFacets(sessions, facets, {
        categories: [],
        statuses: [],
        agentClasses: [],
        tags: [],
        clusters: [],
      }),
    ).toHaveLength(2)
  })

  it('filters by tool category using the facets payload', () => {
    const filtered = filterSessionsByFacets(sessions, facets, {
      categories: ['edit'],
      statuses: [],
      agentClasses: [],
      tags: [],
      clusters: [],
    })
    expect(filtered.map((s) => s.id)).toEqual(['sess-edit'])
  })

  it('drops sessions with no facet row from a category filter', () => {
    const withUnknown = [...sessions, makeSession({ id: 'sess-quiet' })]
    const filtered = filterSessionsByFacets(withUnknown, facets, {
      categories: ['shell'],
      statuses: [],
      agentClasses: [],
      tags: [],
      clusters: [],
    })
    expect(filtered.map((s) => s.id)).toEqual(['sess-shell', 'sess-edit'])
  })

  it('filters by status', () => {
    const filtered = filterSessionsByFacets(sessions, facets, {
      categories: [],
      statuses: ['ended'],
      agentClasses: [],
      tags: [],
      clusters: [],
    })
    expect(filtered.map((s) => s.id)).toEqual(['sess-edit'])
  })

  it('filters by agent class (a session matches any of its classes)', () => {
    const filtered = filterSessionsByFacets(sessions, facets, {
      categories: [],
      statuses: [],
      agentClasses: ['codex'],
      tags: [],
      clusters: [],
    })
    expect(filtered.map((s) => s.id)).toEqual(['sess-edit'])
  })

  it('filters by tag (a session matches any of its tags)', () => {
    const filtered = filterSessionsByFacets(sessions, facets, {
      categories: [],
      statuses: [],
      agentClasses: [],
      tags: ['git'],
      clusters: [],
    })
    expect(filtered.map((s) => s.id)).toEqual(['sess-shell'])
  })

  it('ORs tags within the axis', () => {
    const filtered = filterSessionsByFacets(sessions, facets, {
      categories: [],
      statuses: [],
      agentClasses: [],
      tags: ['git', 'sqlite'],
      clusters: [],
    })
    expect(filtered.map((s) => s.id)).toEqual(['sess-shell', 'sess-edit'])
  })

  it('drops sessions with no facet row from a tag filter', () => {
    const withUnknown = [...sessions, makeSession({ id: 'sess-quiet' })]
    const filtered = filterSessionsByFacets(withUnknown, facets, {
      categories: [],
      statuses: [],
      agentClasses: [],
      tags: ['sqlite'],
      clusters: [],
    })
    expect(filtered.map((s) => s.id)).toEqual(['sess-shell', 'sess-edit'])
  })

  it('filters by cluster', () => {
    const filtered = filterSessionsByFacets(sessions, facets, {
      categories: [],
      statuses: [],
      agentClasses: [],
      tags: [],
      clusters: ['1'],
    })
    expect(filtered.map((s) => s.id)).toEqual(['sess-edit'])
  })

  it('drops unclustered sessions from a cluster filter', () => {
    const withLoose = [...sessions, makeSession({ id: 'sess-loose' })]
    const filtered = filterSessionsByFacets(withLoose, facets, {
      categories: [],
      statuses: [],
      agentClasses: [],
      tags: [],
      clusters: ['0'],
    })
    expect(filtered.map((s) => s.id)).toEqual(['sess-shell'])
  })

  it('ANDs across axes and ORs within an axis', () => {
    const filtered = filterSessionsByFacets(sessions, facets, {
      categories: ['shell', 'edit'],
      statuses: ['active'],
      agentClasses: [],
      tags: [],
      clusters: [],
    })
    expect(filtered.map((s) => s.id)).toEqual(['sess-shell'])
  })

  it('ANDs a tag axis against a category axis', () => {
    const filtered = filterSessionsByFacets(sessions, facets, {
      categories: ['edit'],
      statuses: [],
      agentClasses: [],
      tags: ['sqlite'],
      clusters: [],
    })
    expect(filtered.map((s) => s.id)).toEqual(['sess-edit'])
  })
})

describe('FacetBar', () => {
  it('renders category, status and harness pills with counts', () => {
    renderWithProviders(<FacetBar sessions={sessions} facets={facets} />)

    expect(screen.getByText('Shell')).toBeInTheDocument()
    expect(screen.getByText('Edit')).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText('Ended')).toBeInTheDocument()
    expect(screen.getByText('claude-code')).toBeInTheDocument()
    expect(screen.getByText('codex')).toBeInTheDocument()
  })

  it('renders tag and cluster pills with counts', () => {
    renderWithProviders(<FacetBar sessions={sessions} facets={facets} />)

    expect(screen.getByText('git')).toBeInTheDocument()
    expect(screen.getByText('sqlite')).toBeInTheDocument()
    expect(screen.getByText('Cluster 0')).toBeInTheDocument()
    expect(screen.getByText('Cluster 1')).toBeInTheDocument()
  })

  it('toggling a category pill writes the selection to the UI store', () => {
    renderWithProviders(<FacetBar sessions={sessions} facets={facets} />)

    fireEvent.click(screen.getByText('Edit'))
    expect(useUIStore.getState().facetCategories).toEqual(['edit'])

    fireEvent.click(screen.getByText('Edit'))
    expect(useUIStore.getState().facetCategories).toEqual([])
  })

  it('toggling a tag pill writes the selection to the UI store', () => {
    renderWithProviders(<FacetBar sessions={sessions} facets={facets} />)

    fireEvent.click(screen.getByText('sqlite'))
    expect(useUIStore.getState().facetTags).toEqual(['sqlite'])

    fireEvent.click(screen.getByText('sqlite'))
    expect(useUIStore.getState().facetTags).toEqual([])
  })

  it('toggling a cluster pill writes the selection to the UI store', () => {
    renderWithProviders(<FacetBar sessions={sessions} facets={facets} />)

    fireEvent.click(screen.getByText('Cluster 1'))
    expect(useUIStore.getState().facetClusters).toEqual(['1'])

    fireEvent.click(screen.getByText('Cluster 1'))
    expect(useUIStore.getState().facetClusters).toEqual([])
  })

  it('shows at most 12 tag pills with a "+N more" expander', () => {
    const manyTags: SessionFacets = {
      ...facets,
      tagSessionCounts: Object.fromEntries(
        Array.from({ length: 15 }, (_, i) => [`tag-${String(i).padStart(2, '0')}`, 1]),
      ),
    }
    renderWithProviders(<FacetBar sessions={sessions} facets={manyTags} />)

    expect(screen.getByText('tag-00')).toBeInTheDocument()
    expect(screen.getByText('tag-11')).toBeInTheDocument()
    expect(screen.queryByText('tag-12')).not.toBeInTheDocument()
    expect(screen.getByText('+3 more')).toBeInTheDocument()

    fireEvent.click(screen.getByText('+3 more'))
    expect(screen.getByText('tag-12')).toBeInTheDocument()
    expect(screen.getByText('tag-14')).toBeInTheDocument()
    expect(screen.getByText('Less')).toBeInTheDocument()
  })

  it('shows a Clear button only when a selection exists', () => {
    const { rerender } = renderWithProviders(<FacetBar sessions={sessions} facets={facets} />)
    expect(screen.queryByTitle('Clear facet filters')).not.toBeInTheDocument()

    useUIStore.setState({ facetStatuses: ['active'] })
    rerender(<FacetBar sessions={sessions} facets={facets} />)
    expect(screen.getByTitle('Clear facet filters')).toBeInTheDocument()

    fireEvent.click(screen.getByTitle('Clear facet filters'))
    expect(useUIStore.getState().facetStatuses).toEqual([])
  })

  it('Clear also empties tag and cluster selections', () => {
    useUIStore.setState({ facetTags: ['git'], facetClusters: ['0'] })
    renderWithProviders(<FacetBar sessions={sessions} facets={facets} />)

    fireEvent.click(screen.getByTitle('Clear facet filters'))
    expect(useUIStore.getState().facetTags).toEqual([])
    expect(useUIStore.getState().facetClusters).toEqual([])
  })

  it('renders nothing when there are no sessions', () => {
    const { container } = renderWithProviders(<FacetBar sessions={[]} facets={facets} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders status and harness pills even when facets have not loaded', () => {
    renderWithProviders(<FacetBar sessions={sessions} facets={null} />)

    expect(screen.queryByText('Shell')).not.toBeInTheDocument()
    expect(screen.queryByText('git')).not.toBeInTheDocument()
    expect(screen.queryByText('Cluster 0')).not.toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText('claude-code')).toBeInTheDocument()
  })
})
