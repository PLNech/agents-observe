import { describe, it, expect } from 'vitest'
import { TOOL_CATEGORIES, TOOL_CATEGORY_LABELS, dominantToolCategory } from './tool-categories'

describe('tool-categories', () => {
  it('picks the category with the most events', () => {
    expect(dominantToolCategory({ shell: 3, edit: 9, read: 4 })).toBe('edit')
  })

  it('breaks ties toward the earlier TOOL_CATEGORIES entry', () => {
    expect(dominantToolCategory({ read: 5, shell: 5 })).toBe('shell')
  })

  it('returns null for an empty or unknown-only mix', () => {
    expect(dominantToolCategory({})).toBeNull()
    expect(dominantToolCategory({ not_a_category: 3 })).toBeNull()
  })

  it('labels every category', () => {
    for (const category of TOOL_CATEGORIES) expect(TOOL_CATEGORY_LABELS[category]).toBeTruthy()
  })
})
