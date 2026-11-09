import { describe, test, expect } from 'vitest'
import {
  normalizeForMatch,
  diceCoefficient,
  scoreMatch,
  suggestLeboardMatches,
  CONFIDENT_THRESHOLD,
} from './leboard-match'

describe('normalizeForMatch', () => {
  test('lowercases and folds separators to spaces', () => {
    expect(normalizeForMatch('Agents-Observe')).toBe('agents observe')
    expect(normalizeForMatch('  SRE_toolkit.v2 ')).toBe('sre toolkit v2')
  })

  test('collapses runs of separators and trims', () => {
    expect(normalizeForMatch('--a___b--')).toBe('a b')
  })
})

describe('diceCoefficient', () => {
  test('identical strings score 1', () => {
    expect(diceCoefficient('agents observe', 'agents observe')).toBe(1)
  })

  test('disjoint strings score 0', () => {
    expect(diceCoefficient('alpha', 'zork')).toBe(0)
  })

  test('single-character strings only match exactly', () => {
    expect(diceCoefficient('s', 's')).toBe(1)
    expect(diceCoefficient('s', 'x')).toBe(0)
  })

  test('similar strings land between 0 and 1', () => {
    const score = diceCoefficient('agents observe', 'agents observer')
    expect(score).toBeGreaterThan(0.8)
    expect(score).toBeLessThan(1)
  })
})

describe('scoreMatch', () => {
  test('exact name match scores 1 regardless of case', () => {
    expect(scoreMatch({ name: 'SRE', slug: 'sre' }, 'sre')).toBe(1)
  })

  test('exact slug match scores 1', () => {
    expect(scoreMatch({ name: 'Agents Observe', slug: 'agents-observe' }, 'agents-observe')).toBe(1)
  })

  test('unrelated names score low', () => {
    expect(scoreMatch({ name: 'Domovoy', slug: 'domovoy' }, 'Quarterly Taxes')).toBeLessThan(0.3)
  })

  test('partial overlap scores mid-range', () => {
    const score = scoreMatch({ name: 'agents-observe', slug: 'agents-observe' }, 'agents')
    expect(score).toBeGreaterThan(0.3)
    expect(score).toBeLessThan(CONFIDENT_THRESHOLD)
  })
})

describe('suggestLeboardMatches', () => {
  const candidates = [
    { id: 'agents-observe', name: 'agents-observe' },
    { id: 'agents-sdk', name: 'agents-sdk' },
    { id: 'domovoy', name: 'Domovoy' },
  ]

  test('returns best match first with runner-up second', () => {
    const matches = suggestLeboardMatches(
      { name: 'Agents Observe', slug: 'agents-observe' },
      candidates,
    )
    expect(matches).toHaveLength(2)
    expect(matches[0].leboardId).toBe('agents-observe')
    expect(matches[0].score).toBe(1)
    expect(matches[0].confident).toBe(true)
    expect(matches[1].leboardId).toBe('agents-sdk')
    expect(matches[1].score).toBeLessThan(matches[0].score)
  })

  test('marks low scores as not confident', () => {
    const matches = suggestLeboardMatches({ name: 'Zork', slug: 'zork' }, candidates)
    expect(matches.every((m) => !m.confident)).toBe(true)
  })

  test('respects the limit', () => {
    const matches = suggestLeboardMatches(
      { name: 'Agents Observe', slug: 'agents-observe' },
      candidates,
      1,
    )
    expect(matches).toHaveLength(1)
  })

  test('returns empty for no candidates', () => {
    expect(suggestLeboardMatches({ name: 'SRE', slug: 'sre' }, [])).toEqual([])
  })
})
