import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen, fireEvent, waitFor, within } from '@testing-library/react'
import { renderWithProviders } from '@/test/test-utils'
import { LeboardLinkSection } from './leboard-link'
import type { LeboardSuggestions, Project } from '@/types'

// Polyfill for Radix UI in jsdom
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver

const { mockSuggestions, mockSetLeboard } = vi.hoisted(() => ({
  mockSuggestions: { current: null as LeboardSuggestions | null },
  mockSetLeboard: vi.fn(() => Promise.resolve({ ok: true })),
}))

vi.mock('@/lib/api-client', () => ({
  api: {
    getLeboardSuggestions: () => Promise.resolve(mockSuggestions.current),
    setProjectLeboard: mockSetLeboard,
  },
}))

const unlinkedProject: Project = {
  id: 1,
  slug: 'agents-observe',
  name: 'Agents Observe',
  createdAt: Date.now(),
  sessionCount: 2,
}

const linkedProject: Project = {
  ...unlinkedProject,
  leboardProjectId: 'agents-observe',
  leboardProjectName: 'agents-observe',
}

const suggestions: LeboardSuggestions = {
  available: true,
  projects: [
    { id: 'agents-observe', name: 'agents-observe' },
    { id: 'agents-sdk', name: 'agents-sdk' },
  ],
  suggestions: [
    {
      projectId: 1,
      projectName: 'Agents Observe',
      projectSlug: 'agents-observe',
      best: {
        leboardId: 'agents-observe',
        leboardName: 'agents-observe',
        score: 1,
        confident: true,
      },
      runnerUp: {
        leboardId: 'agents-sdk',
        leboardName: 'agents-sdk',
        score: 0.5,
        confident: false,
      },
    },
  ],
}

beforeEach(() => {
  mockSetLeboard.mockClear()
  mockSuggestions.current = suggestions
})

describe('LeboardLinkSection', () => {
  it('shows the current mapping with a clear button when linked', async () => {
    renderWithProviders(<LeboardLinkSection project={linkedProject} open={true} />)

    await waitFor(() => {
      expect(screen.getByText('agents-observe')).toBeInTheDocument()
    })
    expect(screen.getByTitle('Clear LeBoard link')).toBeInTheDocument()
    expect(screen.queryByText('Confirm')).not.toBeInTheDocument()
  })

  it('clearing the link sends nulls', async () => {
    renderWithProviders(<LeboardLinkSection project={linkedProject} open={true} />)

    await waitFor(() => {
      expect(screen.getByTitle('Clear LeBoard link')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByTitle('Clear LeBoard link'))

    await waitFor(() => {
      expect(mockSetLeboard).toHaveBeenCalledWith(1, null, null)
    })
  })

  it('shows the suggestion with a confident score badge and confirm', async () => {
    renderWithProviders(<LeboardLinkSection project={unlinkedProject} open={true} />)

    await waitFor(() => {
      expect(screen.getByText('agents-observe')).toBeInTheDocument()
    })
    expect(screen.getByText('Suggested:')).toBeInTheDocument()
    expect(screen.getByText('100%')).toBeInTheDocument()
    expect(screen.getByText('Confirm')).toBeInTheDocument()
    expect(screen.getByText('Choose…')).toBeInTheDocument()
  })

  it('confirming the suggestion stores the mapping', async () => {
    renderWithProviders(<LeboardLinkSection project={unlinkedProject} open={true} />)

    await waitFor(() => {
      expect(screen.getByText('Confirm')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Confirm'))

    await waitFor(() => {
      expect(mockSetLeboard).toHaveBeenCalledWith(1, 'agents-observe', 'agents-observe')
    })
  })

  it('picker lists leboard projects and links the picked one', async () => {
    renderWithProviders(<LeboardLinkSection project={unlinkedProject} open={true} />)

    await waitFor(() => {
      expect(screen.getByText('Choose…')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Choose…'))

    const dialog = screen.getByText('Link to LeBoard project...').closest('[role="dialog"]')
    expect(dialog).not.toBeNull()
    await waitFor(() => {
      expect(within(dialog as HTMLElement).getByText('agents-sdk')).toBeInTheDocument()
    })

    // Search filters the list
    fireEvent.change(
      within(dialog as HTMLElement).getByPlaceholderText('Search LeBoard projects'),
      {
        target: { value: 'sdk' },
      },
    )
    expect(within(dialog as HTMLElement).queryByText('agents-observe')).not.toBeInTheDocument()

    fireEvent.click(within(dialog as HTMLElement).getByText('agents-sdk'))
    await waitFor(() => {
      expect(mockSetLeboard).toHaveBeenCalledWith(1, 'agents-sdk', 'agents-sdk')
    })
  })

  it('says LeBoard is not reachable when the server reports it unavailable', async () => {
    mockSuggestions.current = { available: false, projects: [], suggestions: [] }
    renderWithProviders(<LeboardLinkSection project={unlinkedProject} open={true} />)

    await waitFor(() => {
      expect(screen.getByText('LeBoard is not reachable')).toBeInTheDocument()
    })
    expect(screen.queryByText('Confirm')).not.toBeInTheDocument()
  })

  it('offers Choose… with no suggestion but LeBoard available', async () => {
    mockSuggestions.current = { available: true, projects: [], suggestions: [] }
    renderWithProviders(<LeboardLinkSection project={unlinkedProject} open={true} />)

    await waitFor(() => {
      expect(screen.getByText('No matching LeBoard project')).toBeInTheDocument()
    })
    expect(screen.getByText('Choose…')).toBeInTheDocument()
  })
})
