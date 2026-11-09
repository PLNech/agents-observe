import { describe, test, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import type { EventStore } from '../storage/types'

type Env = {
  Variables: {
    store: EventStore
    broadcastToSession: (sessionId: string, msg: object) => void
    broadcastToAll: (msg: object) => void
  }
}

describe('project leboard routes', () => {
  let app: Hono<Env>
  const mockStore = {
    getProjects: vi.fn(),
    getProjectById: vi.fn(),
    updateProjectLeboard: vi.fn(),
  }
  const broadcastToAll = vi.fn()
  const listProjects = vi.fn()

  beforeEach(async () => {
    vi.resetModules()
    Object.values(mockStore).forEach((fn) => fn.mockReset())
    broadcastToAll.mockReset()
    listProjects.mockReset()
    mockStore.updateProjectLeboard.mockResolvedValue(undefined)

    vi.doMock('../services/leboard', () => ({
      leboardClient: { listProjects },
    }))

    const { default: projectsRouter } = await import('./projects')
    app = new Hono<Env>()
    app.use('*', async (c, next) => {
      c.set('store', mockStore as unknown as EventStore)
      c.set('broadcastToSession', vi.fn())
      c.set('broadcastToAll', broadcastToAll)
      await next()
    })
    app.route('/api', projectsRouter)
  })

  describe('GET /api/projects', () => {
    test('exposes leboard fields with null fallback', async () => {
      mockStore.getProjects.mockResolvedValue([
        {
          id: 1,
          slug: 'sre',
          name: 'SRE',
          leboard_project_id: 'sre',
          leboard_project_name: 'SRE',
          created_at: 1,
          session_count: 3,
        },
        { id: 2, slug: 'zork', name: 'Zork', created_at: 1, session_count: 0 },
      ])

      const res = await app.request('/api/projects')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body[0].leboardProjectId).toBe('sre')
      expect(body[0].leboardProjectName).toBe('SRE')
      expect(body[1].leboardProjectId).toBeNull()
      expect(body[1].leboardProjectName).toBeNull()
    })
  })

  describe('GET /api/projects/leboard-suggestions', () => {
    test('suggests best + runner-up for unmapped projects only', async () => {
      mockStore.getProjects.mockResolvedValue([
        { id: 1, slug: 'agents-observe', name: 'Agents Observe', leboard_project_id: 'linked' },
        { id: 2, slug: 'agents-observe-2', name: 'Agents Observe 2' },
        { id: 3, slug: 'zork', name: 'Zork' },
      ])
      listProjects.mockResolvedValue({
        available: true,
        projects: [
          { id: 'agents-observe', name: 'agents-observe' },
          { id: 'agents-sdk', name: 'agents-sdk' },
        ],
      })

      const res = await app.request('/api/projects/leboard-suggestions')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.available).toBe(true)
      expect(body.suggestions).toHaveLength(2)
      const first = body.suggestions[0]
      expect(first.projectId).toBe(2)
      expect(first.best.leboardId).toBe('agents-observe')
      expect(first.best.confident).toBe(true)
      expect(first.runnerUp.leboardId).toBe('agents-sdk')
    })

    test('reports unavailable when LeBoard is down', async () => {
      listProjects.mockResolvedValue({ available: false })
      const res = await app.request('/api/projects/leboard-suggestions')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toEqual({ available: false, projects: [], suggestions: [] })
      expect(mockStore.getProjects).not.toHaveBeenCalled()
    })

    test('carries the full leboard project list for the picker', async () => {
      mockStore.getProjects.mockResolvedValue([])
      listProjects.mockResolvedValue({
        available: true,
        projects: [{ id: 'sre', name: 'SRE' }],
      })
      const res = await app.request('/api/projects/leboard-suggestions')
      const body = await res.json()
      expect(body.projects).toEqual([{ id: 'sre', name: 'SRE' }])
    })

    test('best is null when LeBoard has no projects', async () => {
      mockStore.getProjects.mockResolvedValue([{ id: 1, slug: 'sre', name: 'SRE' }])
      listProjects.mockResolvedValue({ available: true, projects: [] })
      const res = await app.request('/api/projects/leboard-suggestions')
      const body = await res.json()
      expect(body.suggestions[0].best).toBeNull()
      expect(body.suggestions[0].runnerUp).toBeNull()
    })
  })

  describe('PATCH /api/projects/:id/leboard', () => {
    beforeEach(() => {
      mockStore.getProjectById.mockResolvedValue({ id: 1, name: 'SRE', slug: 'sre' })
    })

    test('sets the link and broadcasts', async () => {
      const res = await app.request('/api/projects/1/leboard', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leboardProjectId: 'sre', leboardProjectName: 'SRE' }),
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toEqual({ ok: true, leboardProjectId: 'sre', leboardProjectName: 'SRE' })
      expect(mockStore.updateProjectLeboard).toHaveBeenCalledWith(1, 'sre', 'SRE')
      expect(broadcastToAll).toHaveBeenCalledWith({
        type: 'project_update',
        data: { id: 1, name: 'SRE' },
      })
    })

    test('clears the link with nulls', async () => {
      const res = await app.request('/api/projects/1/leboard', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leboardProjectId: null, leboardProjectName: null }),
      })
      expect(res.status).toBe(200)
      expect(mockStore.updateProjectLeboard).toHaveBeenCalledWith(1, null, null)
    })

    test('rejects mismatched set/clear payloads', async () => {
      const res = await app.request('/api/projects/1/leboard', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leboardProjectId: 'sre', leboardProjectName: null }),
      })
      expect(res.status).toBe(400)
      expect(mockStore.updateProjectLeboard).not.toHaveBeenCalled()
    })

    test('rejects empty strings as set', async () => {
      const res = await app.request('/api/projects/1/leboard', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leboardProjectId: '  ', leboardProjectName: 'SRE' }),
      })
      expect(res.status).toBe(400)
    })

    test('404 for unknown project', async () => {
      mockStore.getProjectById.mockResolvedValue(null)
      const res = await app.request('/api/projects/99/leboard', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leboardProjectId: 'sre', leboardProjectName: 'SRE' }),
      })
      expect(res.status).toBe(404)
    })

    test('400 for invalid JSON', async () => {
      const res = await app.request('/api/projects/1/leboard', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: 'not json',
      })
      expect(res.status).toBe(400)
    })
  })
})
