import { describe, test, expect, vi } from 'vitest'
import { createLeboardClient, LEBOARD_DEFAULT_TIMEOUT_MS } from './leboard'

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response
}

describe('createLeboardClient', () => {
  test('listProjects maps the /api/projects payload to id+name', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        projects: [
          { project: 'agents-observe', goal: null, reports: 2 },
          { project: 'domovoy', goal: 'home automation', reports: 0 },
        ],
      }),
    )
    const client = createLeboardClient({ baseUrl: 'http://127.0.0.1:8377', fetchImpl })

    const result = await client.listProjects()
    expect(result).toEqual({
      available: true,
      projects: [
        { id: 'agents-observe', name: 'agents-observe' },
        { id: 'domovoy', name: 'domovoy' },
      ],
    })
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://127.0.0.1:8377/api/projects',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  test('skips malformed rows', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        projects: [{ project: 'ok' }, { project: '' }, 'junk', null, { other: 'x' }],
      }),
    )
    const client = createLeboardClient({ fetchImpl })
    const result = await client.listProjects()
    expect(result.available && result.projects).toEqual([{ id: 'ok', name: 'ok' }])
  })

  test('non-array or missing projects payload is unavailable', async () => {
    const client = createLeboardClient({ fetchImpl: vi.fn().mockResolvedValue(jsonResponse({})) })
    expect(await client.listProjects()).toEqual({ available: false })

    const client2 = createLeboardClient({
      fetchImpl: vi.fn().mockResolvedValue(jsonResponse({ projects: 'nope' })),
    })
    expect(await client2.listProjects()).toEqual({ available: false })
  })

  test('HTTP error status is unavailable', async () => {
    const client = createLeboardClient({
      fetchImpl: vi.fn().mockResolvedValue(jsonResponse({ error: 'x' }, 500)),
    })
    expect(await client.listProjects()).toEqual({ available: false })
  })

  test('rejected fetch (LeBoard down) is unavailable, never throws', async () => {
    const client = createLeboardClient({
      fetchImpl: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    })
    expect(await client.listProjects()).toEqual({ available: false })
  })

  test('aborts after the timeout and reports unavailable', async () => {
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
        }),
    )
    const client = createLeboardClient({ fetchImpl, timeoutMs: 10 })
    const result = await client.listProjects()
    expect(result).toEqual({ available: false })
  })

  test('strips trailing slashes from the base URL', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ projects: [] }))
    const client = createLeboardClient({ baseUrl: 'http://127.0.0.1:8377///', fetchImpl })
    await client.listProjects()
    expect(fetchImpl).toHaveBeenCalledWith('http://127.0.0.1:8377/api/projects', expect.anything())
  })

  test('default timeout is short (loopback should answer instantly)', () => {
    expect(LEBOARD_DEFAULT_TIMEOUT_MS).toBeLessThanOrEqual(2000)
  })
})
