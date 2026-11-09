import { Hono } from 'hono'
import type { EventStore } from '../storage/types'
import type { Project } from '../types'
import { apiError } from '../errors'
import { leboardClient } from '../services/leboard'
import { suggestLeboardMatches } from '../services/leboard-match'

type Env = {
  Variables: {
    store: EventStore
    broadcastToSession: (sessionId: string, msg: object) => void
    broadcastToAll: (msg: object) => void
  }
}

const router = new Hono<Env>()

router.get('/projects', async (c) => {
  const store = c.get('store')
  const rows = await store.getProjects()
  const projects: Project[] = rows.map((r: any) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    leboardProjectId: r.leboard_project_id ?? null,
    leboardProjectName: r.leboard_project_name ?? null,
    createdAt: r.created_at,
    sessionCount: r.session_count,
  }))
  return c.json(projects)
})

// POST /projects — manual project creation from the Projects tab.
// Projects are normally created implicitly when the first session hits,
// but users want to pre-create empty projects they can move sessions
// into from the Project modal. Slug is derived from the name if not
// provided; collisions return 409.
router.post('/projects', async (c) => {
  const store = c.get('store')
  const broadcastToAll = c.get('broadcastToAll')
  let body: Record<string, unknown>
  try {
    body = (await c.req.json()) as Record<string, unknown>
  } catch {
    return apiError(c, 400, 'Invalid JSON body')
  }

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) return apiError(c, 400, 'name must not be empty')

  const providedSlug = typeof body.slug === 'string' ? body.slug.trim() : ''
  const slug = providedSlug || slugify(name)
  if (!slug) return apiError(c, 400, 'could not derive a valid slug from name')
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    return apiError(c, 400, 'slug must be kebab-case (a-z, 0-9, hyphens)')
  }

  if (!(await store.isSlugAvailable(slug))) {
    return apiError(c, 409, `slug "${slug}" is already in use`, { code: 'SLUG_TAKEN' })
  }

  const id = await store.createProject(slug, name)
  broadcastToAll({ type: 'project_update', data: { id, name, slug } })
  return c.json({ id, slug, name, createdAt: Date.now(), sessionCount: 0 }, 201)
})

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// GET /projects/leboard-suggestions — fuzzy-match every project that has
// no LeBoard link yet against the LeBoard project list. Degrades to
// { available: false } when LeBoard is unreachable; never throws.
router.get('/projects/leboard-suggestions', async (c) => {
  const store = c.get('store')
  const leboard = await leboardClient.listProjects()
  if (!leboard.available) {
    return c.json({ available: false, projects: [], suggestions: [] })
  }

  const rows = await store.getProjects()
  const suggestions = rows
    .filter((r: any) => !r.leboard_project_id)
    .map((r: any) => {
      const matches = suggestLeboardMatches({ name: r.name, slug: r.slug }, leboard.projects)
      return {
        projectId: r.id,
        projectName: r.name,
        projectSlug: r.slug,
        best: matches[0] ?? null,
        runnerUp: matches[1] ?? null,
      }
    })
  // `projects` carries the full LeBoard list so the client's "pick from
  // list" picker works without a second endpoint.
  return c.json({ available: true, projects: leboard.projects, suggestions })
})

router.get('/projects/:id/sessions', async (c) => {
  const store = c.get('store')
  const projectId = Number(c.req.param('id'))
  if (isNaN(projectId)) return apiError(c, 400, 'Invalid project ID')

  const rows = await store.getSessionsForProject(projectId)
  const sessions = rows.map((r: any) => ({
    id: r.id,
    projectId: r.project_id,
    slug: r.slug,
    status: r.stopped_at ? 'ended' : 'active',
    startedAt: r.started_at,
    stoppedAt: r.stopped_at,
    transcriptPath: r.transcript_path || null,
    startCwd: r.start_cwd || null,
    metadata: r.metadata ? JSON.parse(r.metadata) : null,
    agentCount: r.agent_count,
    eventCount: r.event_count,
    lastActivity: r.last_activity,
    agentClasses:
      typeof r.agent_classes === 'string' && r.agent_classes
        ? r.agent_classes.split(',').filter(Boolean)
        : [],
  }))
  return c.json(sessions)
})

// PATCH /projects/:id — update project fields (name)
router.patch('/projects/:id', async (c) => {
  const store = c.get('store')
  const broadcastToAll = c.get('broadcastToAll')
  const projectId = Number(c.req.param('id'))
  if (isNaN(projectId)) return apiError(c, 400, 'Invalid project ID')

  try {
    const data = (await c.req.json()) as Record<string, unknown>

    if (data.name && typeof data.name === 'string') {
      const trimmed = data.name.trim()
      if (!trimmed) return apiError(c, 400, 'name must not be empty')
      await store.updateProjectName(projectId, trimmed)
      broadcastToAll({ type: 'project_update', data: { id: projectId, name: trimmed } })
    }

    return c.json({ ok: true })
  } catch {
    return apiError(c, 400, 'Invalid request')
  }
})

// PATCH /projects/:id/leboard — set or clear the project's LeBoard link.
// Body: { leboardProjectId: string | null, leboardProjectName: string | null }.
// Both null clears the link; both non-null strings sets it (LeBoard
// projects are name-keyed, so the id is the name). No other shapes accepted.
router.patch('/projects/:id/leboard', async (c) => {
  const store = c.get('store')
  const broadcastToAll = c.get('broadcastToAll')
  const projectId = Number(c.req.param('id'))
  if (isNaN(projectId)) return apiError(c, 400, 'Invalid project ID')

  let body: Record<string, unknown>
  try {
    body = (await c.req.json()) as Record<string, unknown>
  } catch {
    return apiError(c, 400, 'Invalid JSON body')
  }

  const id = body.leboardProjectId
  const name = body.leboardProjectName
  const hasId = typeof id === 'string' && id.trim().length > 0
  const hasName = typeof name === 'string' && name.trim().length > 0
  if (hasId !== hasName) {
    return apiError(
      c,
      400,
      'leboardProjectId and leboardProjectName must be set or cleared together',
    )
  }
  const leboardProjectId = hasId ? (id as string).trim() : null
  const leboardProjectName = hasName ? (name as string).trim() : null

  const project = await store.getProjectById(projectId)
  if (!project) return apiError(c, 404, 'Project not found')

  await store.updateProjectLeboard(projectId, leboardProjectId, leboardProjectName)
  // Existing project_update shape ({ id, name }) only triggers project
  // query invalidation client-side, which is all the link change needs.
  broadcastToAll({
    type: 'project_update',
    data: { id: projectId, name: project.name },
  })
  return c.json({ ok: true, leboardProjectId, leboardProjectName })
})

export default router
