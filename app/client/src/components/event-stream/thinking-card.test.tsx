import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithProviders } from '@/test/test-utils'
import { ThinkingCard } from './thinking-card'
import type { ThinkingBlock } from '@/types'

// Mock timeago.js to return stable strings
vi.mock('timeago.js', () => ({
  format: () => 'just now',
}))

// Mock api-client — the card must swallow failures (returns null data)
// and render nothing when there are no blocks.
const mockGetSessionThinking = vi.fn()
vi.mock('@/lib/api-client', () => ({
  api: {
    getSessionThinking: (...args: unknown[]) => mockGetSessionThinking(...args),
  },
}))

function blocks(texts: string[]): ThinkingBlock[] {
  return texts.map((text, i) => ({ ts: 1700000000000 + i, text, seq: i + 1 }))
}

function renderCard() {
  return renderWithProviders(<ThinkingCard sessionId="sess-1" />)
}

beforeEach(() => {
  mockGetSessionThinking.mockReset()
})

describe('ThinkingCard', () => {
  it('renders nothing when the server reports no thinking blocks', () => {
    mockGetSessionThinking.mockResolvedValue({ sessionId: 'sess-1', blocks: [] })
    renderCard()
    expect(screen.queryByTestId('thinking-card')).not.toBeInTheDocument()
  })

  it('renders nothing when the fetch fails', async () => {
    mockGetSessionThinking.mockResolvedValue(null)
    renderCard()
    expect(screen.queryByTestId('thinking-card')).not.toBeInTheDocument()
  })

  it('shows the latest block collapsed, with the earlier count', async () => {
    mockGetSessionThinking.mockResolvedValue({
      sessionId: 'sess-1',
      blocks: blocks(['first thought', 'second thought', 'third thought']),
      total: 3,
    })
    renderCard()
    expect(await screen.findByTestId('thinking-card')).toBeInTheDocument()
    expect(screen.getByText('Thinking')).toBeInTheDocument()
    expect(screen.getByText('third thought')).toBeInTheDocument()
    // Collapsed: earlier blocks stay out of the DOM, only the count shows.
    expect(screen.queryByText('first thought')).not.toBeInTheDocument()
    expect(screen.getByText('earlier 2')).toBeInTheDocument()
  })

  it('expands to show recent blocks plus an "earlier N not shown" hint', async () => {
    mockGetSessionThinking.mockResolvedValue({
      sessionId: 'sess-1',
      blocks: blocks(['t1', 't2', 't3', 't4', 't5', 't6', 't7']),
      total: 7,
    })
    renderCard()
    fireEvent.click(await screen.findByText('earlier 6'))

    // Expanded view: the 5 most recent blocks, older ones summarized.
    expect(screen.getByText('t7')).toBeInTheDocument()
    expect(screen.getByText('t3')).toBeInTheDocument()
    expect(screen.queryByText('t2')).not.toBeInTheDocument()
    expect(screen.getByText('2 earlier blocks not shown')).toBeInTheDocument()
    // Toggle back collapses again.
    fireEvent.click(screen.getByText('collapse'))
    expect(screen.queryByText('t3')).not.toBeInTheDocument()
    expect(screen.getByText('earlier 6')).toBeInTheDocument()
  })
})
