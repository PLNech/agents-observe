# TODO — agents-observe (PLNech fork)

Rule: **every owner demand lands here the moment it's asked** — bug, feature,
question, "we should". Tick with a one-line learning when shipped; move stale
items to Parked rather than letting them rot. Aim: inbox zero.

## Now (added 2026-11-09 — owner session round 2)

- [x] **WS origin fix (Disconnected footer):** shipped 2026-11-09 (08bad35) —
  `*.localhost` hostnames count as loopback (RFC 6761); WS handshake via
  `agents.localhost` verified live (101, connection held). Learning: the
  origin check string-matched `localhost`, so ANY devname-style name broke
  the websocket while HTTP kept working.
- [x] **Constellation UX:** shipped 2026-11-09 (6b603d1, 4c0-ready) — scroll
  wheel zooms the camera around the pointer (reuses the viewH zoom scale,
  clamped to the slider's 380–3200 range; native non-passive listener, paused
  while a drill-in owns the camera); stars tinted by dominant tool category
  from /sessions/facets with a bottom-right legend (no facet row → classic
  heat ramp). Learning: React's onWheel is passive — wheel-zoom needs a native
  `{passive:false}` listener to block page scroll.
- [x] **Live thinking in the UI:** shipped 2026-11-09 — `ThinkingTailTracker`
  tail-reads thinking blocks from the transcript JSONL by byte offset (never
  a full re-parse), a 5s WS tick pushes new blocks to subscribed sessions
  only, and a muted collapsible card above the event stream shows the latest
  block + "earlier N". Learning: the obvious offset-after-last-newline
  accounting double-reads a buffered partial line — the offset must advance
  past bytes held in `pending` (offset = file size after each read).
- [x] **Leboard integration:** shipped 2026-11-09 (ab5456a, 813de4e, 143dbb0,
  16d3de2) — `GET /projects/leboard-suggestions` fuzzy-matches unlinked
  projects against LeBoard's `GET /api/projects` (loopback, no auth; dice
  coefficient on name/slug, confident ≥ 0.7), `PATCH /projects/:id/leboard`
  stores the mapping, and the project modal has a LeBoard link section
  (confirm / clear / searchable pick-from-list). Dry-run over the live DB:
  11 of 23 projects get a confident suggestion. Learning: LeBoard has no
  project ids — the name is the key, so the stored name snapshot keeps the
  UI stable across LeBoard-side renames. Inert until the next server restart.

## Now (added 2026-11-09 — owner: "maxout what we can show today")

- [ ] **Deterministic facet layer (runtime).** `GET /sessions/facets`: per-session
  tool-category mix (payload.tool_name → category map, pure SQL, no schema change),
  error/permission counts, harness/agent-classes, duration. Facet bar on the
  sessions-list theme: filter by category, harness, project, status, has-errors.
- [x] **NLP batch lane.** Shipped 2026-11-09 — `bin/agents-obs-nlp` (SRE,
  uv venv, spaCy sm + bge-m3 via ollama + sklearn): tags → observe.db
  `session_tags` (39 sessions, 414 tags), embeddings → stats.db (strategy c =
  slug+first-3-prompts won purity+silhouette, honest n=39 caveat), clusters
  k_best=4 → stats.db + observe.db serving mirror. Tags+cluster pills live in
  the facet bar (34cef61, ab0f005, 852f29a). Learning: the pre-slim backup DB
  never migrated to the Mac, so validation ran at n=39 — re-validate purity
  as sessions accumulate.
- [ ] **Runtime-vs-batch doctrine** (decided 2026-11-09): tool categories, error
  counts, durations, harness splits = query-time SQL (28k events, ms). spaCy,
  embeddings, clustering = batch (model load + full-corpus passes). Materialize
  rollups only when events > ~1M.

## Now (approved 2026-10-14)

- [ ] **Judge-validation harness + first round.** enablers-lane LLM grades ~50
  labeled turns per suspect axis, blind to jevos output; bal-acc on a sealed
  split; drop axes below ~0.75. Suspects first: `self_report_trust` (never
  fires, 301× no), `cache_buster` (4 hits — state-blind to sizes), `value_time`
  (87% "high", too generous).
- [ ] **stats.db v0.1** (15 min): `PRAGMA user_version=1`, WAL on, backup rule
  for `turn_labels` (judge labels are primary data, not rebuildable).
- [ ] **UI pass 1 (browser available — owner's Chromium):** search panel
  (needs `/api/search` route over the FTS corpus) + fleet status header
  (working/waiting/idle from `pending_notification_ts` + last-event recency).
- [ ] **Metrics-as-prose ablation** for `cache_buster`/`token_class`: state
  gains a prose sentence with the real byte counts ("the tool output is
  48,000 characters"). Tests the state-design hypothesis directly.

## Next

- [ ] UI pass 2: thinking bubbles + zoom, cost+cache panel (gw $ vs list $,
  per-lane cache%).
- [ ] TTC base rates (nearest-neighbor on finished sessions; blocked until
  `session_type` passes judge validation).
- [ ] Doctrine feeds, STUDY ONLY (cache-rate experiments, lane/model vs
  outcome, delegation patterns, error clustering). No doctrine change until
  the data is in.
- [ ] Codex `stopsSession` gap: 6/10 codex sessions never marked ended —
  adapter fix, upstream PR candidate.
- [ ] Perso profile (`~/.claude-perso`) shows 0 sessions in 9 days — probe.
- [ ] Day-14 review 2026-10-19 (SRE TODO.d/128): start from
  `bin/agents-observe-models --days 14` and `--by subagent`.

## Parked

- [ ] enablers-tools monorepo (SRE TODO.d/130) — moves enablers-cc,
  claudenablers, bench, token-refresh in with the tray; cache-rate fixes live
  there.
- [ ] Canary PRs simple10#30-32 — check reactions, rebase if upstream wakes.
- [ ] Owner: delete `~/.agents-observe/backup/observe-2026-10-14-pre-slim.db`
  (~500 MB, full prompts) by day 14 at latest.

## Done

- [x] 2026-10-14 — fork formalized (origin=PLNech, upstream=simple10); slim
  tool output (DB 498→152 MB); FTS corpus + search CLI (73.5k turns); error
  views; measured gateway pricing (gw $); session titles backfilled; first
  jevos batch: 400 turns → 7,464 labels, per-model traceability PK.
