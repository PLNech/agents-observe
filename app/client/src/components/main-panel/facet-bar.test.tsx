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
    },
    'sess-edit': {
      toolCategories: { edit: 2, shell: 1 },
      toolFailures: 1,
      permissionDenied: 0,
      subagentEvents: 0,
    },
  },
  categorySessionCounts: { shell: 2, edit: 1 },
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
  })
})

describe('filterSessionsByFacets', () => {
  it('returns all sessions when no filter is selected', () => {
    expect(
      filterSessionsByFacets(sessions, facets, { categories: [], statuses: [], agentClasses: [] }),
    ).toHaveLength(2)
  })

  it('filters by tool category using the facets payload', () => {
    const filtered = filterSessionsByFacets(sessions, facets, {
      categories: ['edit'],
      statuses: [],
      agentClasses: [],
    })
    expect(filtered.map((s) => s.id)).toEqual(['sess-edit'])
  })

  it('drops sessions with no facet row from a category filter', () => {
    const withUnknown = [...sessions, makeSession({ id: 'sess-quiet' })]
    const filtered = filterSessionsByFacets(withUnknown, facets, {
      categories: ['shell'],
      statuses: [],
      agentClasses: [],
    })
    expect(filtered.map((s) => s.id)).toEqual(['sess-shell', 'sess-edit'])
  })

  it('filters by status', () => {
    const filtered = filterSessionsByFacets(sessions, facets, {
      categories: [],
      statuses: ['ended'],
      agentClasses: [],
    })
    expect(filtered.map((s) => s.id)).toEqual(['sess-edit'])
  })

  it('filters by agent class (a session matches any of its classes)', () => {
    const filtered = filterSessionsByFacets(sessions, facets, {
      categories: [],
      statuses: [],
      agentClasses: ['codex'],
    })
    expect(filtered.map((s) => s.id)).toEqual(['sess-edit'])
  })

  it('ANDs across axes and ORs within an axis', () => {
    const filtered = filterSessionsByFacets(sessions, facets, {
      categories: ['shell', 'edit'],
      statuses: ['active'],
      agentClasses: [],
    })
    expect(filtered.map((s) => s.id)).toEqual(['sess-shell'])
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

  it('toggling a category pill writes the selection to the UI store', () => {
    renderWithProviders(<FacetBar sessions={sessions} facets={facets} />)

    fireEvent.click(screen.getByText('Edit'))
    expect(useUIStore.getState().facetCategories).toEqual(['edit'])

    fireEvent.click(screen.getByText('Edit'))
    expect(useUIStore.getState().facetCategories).toEqual([])
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

  it('renders nothing when there are no sessions', () => {
    const { container } = renderWithProviders(<FacetBar sessions={[]} facets={facets} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders status and harness pills even when facets have not loaded', () => {
    renderWithProviders(<FacetBar sessions={sessions} facets={null} />)

    expect(screen.queryByText('Shell')).not.toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText('claude-code')).toBeInTheDocument()
  })
})
