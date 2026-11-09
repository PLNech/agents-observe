import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Check, Link2, Search, Unlink } from 'lucide-react'
import type { LeboardMatch, Project } from '@/types'

/**
 * "LeBoard link" section for the project modal: shows the current LeBoard
 * mapping or the server's fuzzy-match suggestion, with confirm / clear /
 * pick-from-list. LeBoard itself is only touched server-side (the
 * suggestions endpoint); this component speaks to /api only.
 */
export function LeboardLinkSection({ project, open }: { project: Project; open: boolean }) {
  const queryClient = useQueryClient()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const linked = !!project.leboardProjectId

  const { data: suggestions } = useQuery({
    queryKey: ['leboard-suggestions'],
    queryFn: () => api.getLeboardSuggestions(),
    enabled: open,
    staleTime: 30_000,
  })

  const suggestion = suggestions?.suggestions.find((s) => s.projectId === project.id)

  async function link(leboardId: string, leboardName: string) {
    setBusy(true)
    try {
      await api.setProjectLeboard(project.id, leboardId, leboardName)
      await queryClient.invalidateQueries({ queryKey: ['projects'] })
      await queryClient.invalidateQueries({ queryKey: ['leboard-suggestions'] })
      setPickerOpen(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-2 px-5 py-2.5 border-b border-border/50 text-sm">
      <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="shrink-0 text-xs text-muted-foreground">LeBoard</span>

      {linked ? (
        <>
          <span className="truncate">{project.leboardProjectName}</span>
          <Button
            variant="ghost"
            size="icon-xs"
            className="ml-auto shrink-0"
            disabled={busy}
            title="Clear LeBoard link"
            onClick={async () => {
              setBusy(true)
              try {
                await api.setProjectLeboard(project.id, null, null)
                await queryClient.invalidateQueries({ queryKey: ['projects'] })
                await queryClient.invalidateQueries({ queryKey: ['leboard-suggestions'] })
              } finally {
                setBusy(false)
              }
            }}
          >
            <Unlink className="h-3.5 w-3.5" />
          </Button>
        </>
      ) : suggestions && !suggestions.available ? (
        <span className="text-xs text-muted-foreground truncate">LeBoard is not reachable</span>
      ) : suggestion?.best ? (
        <>
          <span className="text-xs text-muted-foreground truncate">
            Suggested: <span className="text-foreground">{suggestion.best.leboardName}</span>
          </span>
          <ScoreBadge match={suggestion.best} />
          <div className="ml-auto flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="xs"
              disabled={busy}
              onClick={() => link(suggestion.best!.leboardId, suggestion.best!.leboardName)}
            >
              <Check className="h-3 w-3 mr-1" />
              Confirm
            </Button>
            <Button variant="ghost" size="xs" disabled={busy} onClick={() => setPickerOpen(true)}>
              Choose…
            </Button>
          </div>
        </>
      ) : suggestions?.available ? (
        <>
          <span className="text-xs text-muted-foreground truncate">
            No matching LeBoard project
          </span>
          <Button
            variant="ghost"
            size="xs"
            className="ml-auto shrink-0"
            disabled={busy}
            onClick={() => setPickerOpen(true)}
          >
            Choose…
          </Button>
        </>
      ) : (
        <span className="text-xs text-muted-foreground truncate">Checking LeBoard…</span>
      )}

      <LeboardPickerModal
        open={pickerOpen}
        projects={suggestions?.projects ?? []}
        busy={busy}
        onPick={(p) => link(p.id, p.name)}
        onClose={() => setPickerOpen(false)}
      />
    </div>
  )
}

function ScoreBadge({ match }: { match: LeboardMatch }) {
  const pct = Math.round(match.score * 100)
  return (
    <Badge
      variant={match.confident ? 'default' : 'outline'}
      className="shrink-0 text-[10px] px-1.5 py-0"
      title={`Match score ${pct}%`}
    >
      {pct}%
    </Badge>
  )
}

function LeboardPickerModal({
  open,
  projects,
  busy,
  onPick,
  onClose,
}: {
  open: boolean
  projects: { id: string; name: string }[]
  busy: boolean
  onPick: (project: { id: string; name: string }) => void
  onClose: () => void
}) {
  const [filter, setFilter] = useState('')
  const needle = filter.trim().toLowerCase()
  const filtered = needle ? projects.filter((p) => p.name.toLowerCase().includes(needle)) : projects

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setFilter('')
          onClose()
        }
      }}
    >
      <DialogContent
        aria-describedby={undefined}
        className="w-[400px] max-w-[90vw] max-h-[60vh] flex flex-col p-0"
      >
        <div className="px-5 pt-5 pb-3">
          <DialogTitle>Link to LeBoard project...</DialogTitle>
          <div className="relative mt-3">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              autoFocus
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search LeBoard projects"
              className="h-8 pl-8 text-sm"
            />
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto border-t">
          {filtered.length > 0 ? (
            <div className="divide-y divide-border/50">
              {filtered.map((p) => (
                <button
                  key={p.id}
                  className="flex items-center gap-3 w-full px-5 py-2.5 text-sm hover:bg-accent/50 transition-colors cursor-pointer text-left disabled:opacity-50"
                  disabled={busy}
                  onClick={() => onPick(p)}
                >
                  <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{p.name}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              {projects.length === 0 ? 'LeBoard has no projects' : 'No matches'}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
