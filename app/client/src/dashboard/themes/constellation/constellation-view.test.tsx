import { describe, it, expect, afterEach, vi } from 'vitest'
import { cleanup, screen, fireEvent } from '@testing-library/react'
import { renderWithProviders } from '@/test/test-utils'
import { useUIStore } from '@/stores/ui-store'
import { ConstellationView } from './constellation-view'
import type { RecentSession } from '@/types'

// The constellation fetches its own activity-windowed sessions; mock that hook.
let mockWindowed: { data: RecentSession[]; isLoading: boolean } = { data: [], isLoading: false }
vi.mock('@/hooks/use-windowed-sessions', () => ({
  useWindowedSessions: () => mockWindowed,
}))

function session(id: string, over: Partial<RecentSession> = {}): RecentSession {
  return {
    id,
    projectId: 1,
    projectSlug: 'alpha',
    projectName: 'alpha',
    slug: id,
    status: 'active',
    startedAt: 0,
    stoppedAt: null,
    metadata: null,
    lastActivity: Date.now(),
    agentClasses: ['ClaudeCode'],
    eventCount: 100,
    agentCount: 3,
    ...over,
  }
}

const props = { sessions: [], isLoading: false, onOpenSession: () => {} }

afterEach(() => {
  cleanup()
  useUIStore.getState().clearPreviewSession()
  mockWindowed = { data: [], isLoading: false }
})

describe('ConstellationView', () => {
  it('mounts and renders a star + well label per session/project without throwing', () => {
    mockWindowed = {
      data: [
        session('swift-otter'),
        session('calm-harbor', { projectName: 'beta', projectId: 2, projectSlug: 'beta' }),
      ],
      isLoading: false,
    }
    renderWithProviders(<ConstellationView {...props} />)
    expect(screen.getByText('swift-otter')).toBeTruthy()
    expect(screen.getByText('calm-harbor')).toBeTruthy()
    expect(screen.getByText('alpha')).toBeTruthy() // well label
    expect(screen.getByText('beta')).toBeTruthy()
    expect(screen.getByText('Deep Space')).toBeTruthy() // palette control
  })

  it('shows an empty state when there are no sessions in the window', () => {
    mockWindowed = { data: [], isLoading: false }
    renderWithProviders(<ConstellationView {...props} />)
    expect(screen.getByText(/No sessions active in the last 24 hours/i)).toBeTruthy()
  })

  it('runs its animation frame without error', () => {
    mockWindowed = { data: [session('a')], isLoading: false }
    let fired = false
    const raf = vi
      .spyOn(globalThis, 'requestAnimationFrame')
      .mockImplementation((cb: FrameRequestCallback) => {
        if (!fired) {
          fired = true
          cb(0)
        }
        return 0
      })
    expect(() => renderWithProviders(<ConstellationView {...props} />)).not.toThrow()
    raf.mockRestore()
  })

  it('renders inline sliders and collapses the controls to a gear', () => {
    mockWindowed = { data: [session('a')], isLoading: false }
    renderWithProviders(<ConstellationView {...props} />)
    // sliders present
    expect(screen.getByText('window')).toBeTruthy()
    expect(screen.getByText('zoom')).toBeTruthy()
    expect(screen.getByText('decay τ')).toBeTruthy()
    expect(screen.getByText('Deep Space')).toBeTruthy() // palette visible while expanded

    fireEvent.click(screen.getByLabelText('Hide controls'))
    expect(screen.queryByText('Deep Space')).toBeNull() // body collapsed
    expect(screen.getByLabelText('Show controls')).toBeTruthy() // gear remains

    fireEvent.click(screen.getByLabelText('Show controls'))
    expect(screen.getByText('Deep Space')).toBeTruthy() // expanded again
  })

  it('sets the sidebar preview on focus and clears it on background click', () => {
    mockWindowed = { data: [session('swift-otter', { projectId: 7 })], isLoading: false }
    const { container } = renderWithProviders(<ConstellationView {...props} />)
    expect(useUIStore.getState().previewSessionId).toBeNull()

    const star = screen.getByText('swift-otter').closest('g.cst-star')!
    fireEvent.click(star)
    expect(useUIStore.getState().previewSessionId).toBe('swift-otter')
    expect(useUIStore.getState().previewProjectId).toBe(7)

    fireEvent.click(container.querySelector('svg')!)
    expect(useUIStore.getState().previewSessionId).toBeNull()
  })

  it('zooms the camera on wheel and holds still while a drill-in is focused', () => {
    mockWindowed = { data: [session('swift-otter')], isLoading: false }
    const { container } = renderWithProviders(<ConstellationView {...props} />)
    const svg = container.querySelector('svg')!
    const zoomInput = () => screen.getByLabelText('zoom') as HTMLInputElement
    const before = zoomInput().value

    fireEvent.wheel(svg, { deltaY: -480 }) // scroll up → zoom in
    expect(zoomInput().value).not.toBe(before)
    const zoomedIn = zoomInput().value

    fireEvent.click(screen.getByText('swift-otter').closest('g.cst-star')!)
    fireEvent.wheel(svg, { deltaY: -480 })
    expect(zoomInput().value).toBe(zoomedIn) // camera owned by the drill box
  })
})
