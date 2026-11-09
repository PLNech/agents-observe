// app/server/src/services/leboard-match.ts
//
// Fuzzy matching between agents-observe projects and LeBoard projects.
// Pure functions, no I/O — the leboard client (leboard.ts) supplies the
// candidate list. Small built-in scorer (Sørensen–Dice on character
// bigrams over normalized names) so the server needs no fuzzy-matching
// dependency; both sides are short strings, where dice is well-behaved.

/** Score at or above this counts as a confident suggestion. */
export const CONFIDENT_THRESHOLD = 0.7

export interface MatchCandidate {
  /** LeBoard project key (LeBoard has no separate id — its name is the key). */
  id: string
  name: string
}

export interface MatchResult {
  leboardId: string
  leboardName: string
  /** 0..1 similarity against the better of the project's name and slug. */
  score: number
  /** score >= CONFIDENT_THRESHOLD. */
  confident: boolean
}

/** Lowercase, fold non-alphanumerics to spaces, collapse runs, trim. */
export function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Sørensen–Dice coefficient on character bigrams of the two normalized
 * strings. 1 = identical, 0 = no shared bigrams. Strings too short to
 * have bigrams (length 1) only score on exact equality.
 */
export function diceCoefficient(a: string, b: string): number {
  if (a === b) return 1
  if (a.length < 2 || b.length < 2) return 0
  const bigrams = new Map<string, number>()
  for (let i = 0; i < a.length - 1; i++) {
    const g = a.slice(i, i + 2)
    bigrams.set(g, (bigrams.get(g) ?? 0) + 1)
  }
  let hits = 0
  for (let i = 0; i < b.length - 1; i++) {
    const g = b.slice(i, i + 2)
    const count = bigrams.get(g) ?? 0
    if (count > 0) {
      bigrams.set(g, count - 1)
      hits++
    }
  }
  return (2 * hits) / (a.length - 1 + (b.length - 1))
}

/**
 * Score one project against one LeBoard project name. The better of the
 * project's name and its slug wins — slugs are the kebab-case form users
 * tend to have mirrored on the LeBoard side.
 */
export function scoreMatch(project: { name: string; slug: string }, leboardName: string): number {
  const candidate = normalizeForMatch(leboardName)
  const byName = diceCoefficient(normalizeForMatch(project.name), candidate)
  const bySlug = diceCoefficient(normalizeForMatch(project.slug), candidate)
  return Math.max(byName, bySlug)
}

/**
 * Rank candidates for one project, best first. Returns at most `limit`
 * matches (default 2: a best match plus a runner-up for the UI).
 */
export function suggestLeboardMatches(
  project: { name: string; slug: string },
  candidates: MatchCandidate[],
  limit = 2,
): MatchResult[] {
  const scored = candidates.map((c) => {
    const score = scoreMatch(project, c.name)
    return {
      leboardId: c.id,
      leboardName: c.name,
      score,
      confident: score >= CONFIDENT_THRESHOLD,
    }
  })
  scored.sort((a, b) => b.score - a.score || a.leboardName.localeCompare(b.leboardName))
  return scored.slice(0, limit)
}
