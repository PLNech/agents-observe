import { describe, test, expect } from 'vitest'
import { toolCategory, TOOL_CATEGORIES, TOOL_CATEGORY_LABELS } from './tool-categories'

describe('toolCategory', () => {
  test('maps shell tools', () => {
    expect(toolCategory('Bash')).toBe('shell')
  })

  test('maps edit tools', () => {
    expect(toolCategory('Edit')).toBe('edit')
    expect(toolCategory('MultiEdit')).toBe('edit')
    expect(toolCategory('Write')).toBe('edit')
    expect(toolCategory('NotebookEdit')).toBe('edit')
  })

  test('maps read tools', () => {
    expect(toolCategory('Read')).toBe('read')
    expect(toolCategory('Grep')).toBe('read')
    expect(toolCategory('Glob')).toBe('read')
    expect(toolCategory('LS')).toBe('read')
  })

  test('maps web tools', () => {
    expect(toolCategory('WebFetch')).toBe('web')
    expect(toolCategory('WebSearch')).toBe('web')
  })

  test('maps delegation tools', () => {
    expect(toolCategory('Agent')).toBe('delegate')
    expect(toolCategory('Task')).toBe('delegate')
    expect(toolCategory('SendMessage')).toBe('delegate')
    expect(toolCategory('SubagentHandback')).toBe('delegate')
  })

  test('maps Skill', () => {
    expect(toolCategory('Skill')).toBe('skill')
  })

  test('collapses every mcp__ tool into the mcp category', () => {
    expect(toolCategory('mcp__rea__analyze_function')).toBe('mcp')
    expect(toolCategory('mcp__leboard__leboard_task_add')).toBe('mcp')
    expect(toolCategory('mcp__')).toBe('mcp')
  })

  test('maps bookkeeping tools to meta', () => {
    for (const name of [
      'ToolSearch',
      'TaskCreate',
      'TaskUpdate',
      'TaskList',
      'TaskGet',
      'TaskStop',
      'TodoWrite',
      'ScheduleWakeup',
    ]) {
      expect(toolCategory(name)).toBe('meta')
    }
  })

  test('maps AskUserQuestion to ask', () => {
    expect(toolCategory('AskUserQuestion')).toBe('ask')
  })

  test('returns other for unknown tool names', () => {
    expect(toolCategory('SomeFutureTool')).toBe('other')
  })

  test('returns other for empty / missing names', () => {
    expect(toolCategory('')).toBe('other')
    expect(toolCategory(null)).toBe('other')
    expect(toolCategory(undefined)).toBe('other')
  })
})

describe('TOOL_CATEGORIES', () => {
  test('has a human label for every category', () => {
    for (const category of TOOL_CATEGORIES) {
      expect(TOOL_CATEGORY_LABELS[category]).toBeTruthy()
    }
  })

  test('labels match the closed set', () => {
    expect(Object.keys(TOOL_CATEGORY_LABELS).sort()).toEqual([...TOOL_CATEGORIES].sort())
  })
})
