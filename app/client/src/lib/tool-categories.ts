// Mirrors the server's closed category set
// (app/server/src/utils/tool-categories.ts). Duplicated client-side so the
// dashboard bundle never imports server code; keep the two in sync.

/** Stable category order for UI rendering. */
export const TOOL_CATEGORIES = [
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

export type ToolCategory = (typeof TOOL_CATEGORIES)[number]

export const TOOL_CATEGORY_LABELS: Record<ToolCategory, string> = {
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

/**
 * The category with the most events in a session's tool-category mix, or
 * null when the mix is empty. Ties resolve to the earlier TOOL_CATEGORIES
 * entry, so the result is deterministic for a given row.
 */
export function dominantToolCategory(toolCategories: Record<string, number>): ToolCategory | null {
  let best: ToolCategory | null = null
  let bestCount = 0
  for (const category of TOOL_CATEGORIES) {
    const count = toolCategories[category] ?? 0
    if (count > bestCount) {
      best = category
      bestCount = count
    }
  }
  return best
}
