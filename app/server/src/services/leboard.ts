// app/server/src/services/leboard.ts

import { config } from '../config'

/**
 * Minimal read-only client for the local LeBoard HTTP API.
 *
 * LeBoard serves on loopback only and needs no auth — its host-header
 * check accepts `127.0.0.1:<port>`, exactly what fetch sends for a
 * loopback URL. It has no project ids: projects are keyed by name, so
 * the name doubles as the id here.
 *
 * Every failure path (LeBoard down, timeout, non-200, malformed body)
 * degrades to `{ available: false }` — this client never throws.
 */

export interface LeboardProject {
  /** LeBoard has no separate id — the project name is the key. */
  id: string
  name: string
}

export type LeboardListResult =
  { available: true; projects: LeboardProject[] } | { available: false }

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

export const LEBOARD_DEFAULT_TIMEOUT_MS = 2000

export function createLeboardClient(options?: {
  baseUrl?: string
  timeoutMs?: number
  fetchImpl?: FetchLike
}) {
  // `?? fallback` keeps partial config mocks in tests working.
  const baseUrl = (options?.baseUrl ?? config.leboardUrl ?? 'http://127.0.0.1:8377').replace(
    /\/+$/,
    '',
  )
  const timeoutMs = options?.timeoutMs ?? LEBOARD_DEFAULT_TIMEOUT_MS
  const fetchImpl: FetchLike = options?.fetchImpl ?? fetch

  return {
    baseUrl,
    async listProjects(): Promise<LeboardListResult> {
      try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), timeoutMs)
        let res: Response
        try {
          res = await fetchImpl(`${baseUrl}/api/projects`, {
            signal: controller.signal,
          })
        } finally {
          clearTimeout(timer)
        }
        if (!res.ok) return { available: false }
        const body = (await res.json()) as { projects?: unknown }
        if (!body || !Array.isArray(body.projects)) return { available: false }
        const projects: LeboardProject[] = []
        for (const raw of body.projects) {
          if (!raw || typeof raw !== 'object') continue
          const name = (raw as Record<string, unknown>).project
          if (typeof name !== 'string' || !name) continue
          projects.push({ id: name, name })
        }
        return { available: true, projects }
      } catch {
        return { available: false }
      }
    },
  }
}

export const leboardClient = createLeboardClient()
