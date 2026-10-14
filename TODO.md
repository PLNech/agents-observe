# TODO — agents-observe (PLNech fork)

Rule: **every owner demand lands here the moment it's asked** — bug, feature,
question, "we should". Tick with a one-line learning when shipped; move stale
items to Parked rather than letting them rot. Aim: inbox zero.

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
