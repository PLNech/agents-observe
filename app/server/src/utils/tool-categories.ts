// app/server/src/utils/tool-categories.ts
//
// Deterministic tool-name → category mapping for the session facet layer
// (see GET /sessions/facets). Pure: storage extracts `payload.tool_name`
// per event and folds it through toolCategory(); the client renders the
// closed set below, in TOOL_CATEGORIES order.

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

const EXACT_CATEGORIES: Record<string, ToolCategory> = {
  Bash: 'shell',
  Edit: 'edit',
  MultiEdit: 'edit',
  Write: 'edit',
  NotebookEdit: 'edit',
  Read: 'read',
  Grep: 'read',
  Glob: 'read',
  LS: 'read',
  WebFetch: 'web',
  WebSearch: 'web',
  Agent: 'delegate',
  Task: 'delegate',
  SendMessage: 'delegate',
  SubagentHandback: 'delegate',
  Skill: 'skill',
  ToolSearch: 'meta',
  TaskCreate: 'meta',
  TaskUpdate: 'meta',
  TaskList: 'meta',
  TaskGet: 'meta',
  TaskStop: 'meta',
  TodoWrite: 'meta',
  ScheduleWakeup: 'meta',
  AskUserQuestion: 'ask',
}

/**
 * Map a tool name to a small closed category set. MCP tools
 * (`mcp__<server>__<tool>`) collapse to a single `mcp` bucket; anything
 * unknown (or empty) lands in `other`.
 */
export function toolCategory(toolName: string | null | undefined): ToolCategory {
  if (!toolName) return 'other'
  if (toolName.startsWith('mcp__')) return 'mcp'
  return EXACT_CATEGORIES[toolName] ?? 'other'
}
