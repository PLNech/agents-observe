# Agents Observe

Real-time observability dashboard for Claude Code agents. Captures every hook event and streams it to a live dashboard.

## Install as Plugin

```bash
claude plugin marketplace add simple10/agents-observe
claude plugin install agents-observe
```

Restart Claude Code. The server auto-starts as a Docker container and the dashboard is at **http://localhost:4981**.

### Skills

| Command | Description |
|---------|-------------|
| `/observe view` | Open the current session in the dashboard |
| `/observe stats` | Open the current session's stats modal |
| `/observe` | Open the dashboard |
| `/observe status` | Server health and config |
| `/observe start` | Start the server |
| `/observe stop` | Stop the server |
| `/observe restart` | Restart the server |
| `/observe logs` | Show recent container logs |
| `/observe debug` | Diagnose server issues |

## Clone & Run

Requires [just](https://github.com/casey/just), [Node.js](https://nodejs.org/), and [Docker](https://www.docker.com/).

```bash
git clone https://github.com/simple10/agents-observe.git
cd agents-observe
just install   # install dependencies
just start     # start server via Docker
```

Dashboard: http://localhost:4981

For dev mode with hot reload: `just dev` (client at http://localhost:5174, API at http://localhost:4981).

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Server not running | Run `/observe start` or restart Claude Code |
| Docker not running | Start Docker Desktop, then `/observe start` |
| Port conflict | Set `AGENTS_OBSERVE_SERVER_PORT=<port>` in `.env` |
| Need diagnostics | Run `/observe debug` |
| Database issues | Run `just db-reset` |

## Development

**Before developing features or modifying code, read [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).** It covers architecture, project structure, commands (`just dev`, `just test`, etc.), environment variables, worktree setup, code style, and testing.

Key points:
- Use `just dev` for hot-reload development
- **Run `just check` before every commit** — runs all tests + formatting
- Use `just` commands for all dev tasks (not `npm` directly) — see `just --list`
- Worktrees need a `.env` with unique ports (see DEVELOPMENT.md § Worktrees)
- All env vars are centralized in `hooks/scripts/lib/config.mjs` — never read `process.env` elsewhere
- TypeScript throughout, kebab-case file names

## Commit Convention

Use [Conventional Commits](https://www.conventionalcommits.org/) for all commit messages. The release script uses `git log` to generate CHANGELOG.md entries via Claude, and consistent prefixes help it categorize changes accurately.

**Format:** `<type>: <description>`

| Prefix | Use for |
|--------|---------|
| `feat:` | New features or capabilities |
| `fix:` | Bug fixes |
| `docs:` | Documentation changes |
| `style:` | CSS, formatting, visual changes (no logic change) |
| `refactor:` | Code restructuring (no behavior change) |
| `test:` | Adding or updating tests |
| `chore:` | Build scripts, tooling, dependencies, config |
| `release:` | Version bumps (used by `scripts/release.sh`) |

**Examples:**
```
feat: add X button to clear search query
fix: timeline dots animating at different speeds
style: add cursor-pointer to clickable sidebar elements
refactor: replace per-dot transitions with container animation
chore: update release script with changelog generation
docs: document fresh install test harness usage
```

Breaking changes: add `!` after the type (e.g., `feat!: rename config namespace`).

## PLNech fork conventions

- **TODO.md is the demand tracker.** The moment the owner asks for anything —
  bug, feature, question, "we should" — it lands in `TODO.md` as a checkbox the
  same turn. Aim for inbox zero: close items (tick + one-line learning) as soon
  as they ship; move stale ones to Parked instead of letting them rot. Working
  sessions start by reading TODO.md, not by re-deriving state.
- This fork runs **offline and local**: systemd user unit, loopback-only,
  `AGENTS_OBSERVE_OFFLINE=1`. Server-side facts (runbook, gotchas, layout of
  the sidecar layer) live in `~/Work/Perso/SRE/runbooks/agents-observe.md`.
- Observability DB discipline: query `observe.db` counts only, never `payload`
  values. Our derived layer is `stats.db` (numbers + FTS corpus + turn labels) —
  rebuildable with `--all` except turn labels.
- Label provenance: `turn_labels` keys on (turn, axis, **model**); the model id
  recorded is what the serving API reports, plus endpoint lane. Never overwrite
  another model's labels.
