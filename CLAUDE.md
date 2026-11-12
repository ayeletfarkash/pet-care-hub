# Pet Care Hub — Claude Code Rules

Product spec: [PRD.md](PRD.md) (source of truth; §27 has the PRD's own dev guidelines).
Session continuity: [docs/handoff.md](docs/handoff.md) — read at session start, update at session end.

**These project rules override the user-level `~/.claude/CLAUDE.md` for this project** (notably: no automatic Opus, security review is proportional, not mandatory on every change).

## Project status
Phase 1 (Core Foundation) implemented. Stack: Next.js 16 + TypeScript + Drizzle/SQLite + Tailwind 4; Vitest + Playwright/axe.
- Architecture & decisions: [docs/architecture.md](docs/architecture.md)
- Setup, env vars, conventions: [docs/development.md](docs/development.md)
- Test layers & commands: [docs/testing.md](docs/testing.md)
- Next.js 16 differs from older versions: read `AGENTS.md` / `node_modules/next/dist/docs/` before using unfamiliar APIs.

Hard rules from the architecture: group-scoped services start with `requireMembership`; all DB writes go through `writeTx`; UI strings live in `src/i18n`.

## Model policy (Claude Pro)
- Default: **Sonnet** for planning, implementation, debugging, review and orchestration (set in `.claude/settings.json`).
- Opus only for a hard architectural/reasoning problem, and only after asking the user. Never switch automatically.
- All agents use `model: sonnet`.

## Workflow
1. **Plan** — read the relevant PRD section, inspect only affected code, list affected components/entities/APIs, write a short plan. Consult `architect` only for significant technical decisions.
2. **Implement** — the main session implements. Smallest change that meets the requirement; no drive-by refactors. Build phase by phase (PRD §24); don't start a phase before the previous one's acceptance criteria are checked.
3. **Verify** — proportional (see below). Main session reviews every agent finding before acting on it.

## Agents (`.claude/agents/`)
| Agent | Use when | Access |
|---|---|---|
| `architect` | Stack/schema choices, new module, cross-module change, API design | Read-only |
| `ui-ux-specialist` | New screen/flow, significant UI change, RTL/a11y review (PRD §17–19) | Read-only |
| `qa-specialist` | Significant feature, missing coverage, regression risk; may run tests | Read + Bash (tests only) |
| `security-reviewer` | Auth, roles/permissions, group isolation, invitations, file access, deletion | Read-only |

Invoke by name: *"Use the architect agent to …"* or `@architect …`. Agent files load at session start; if one isn't available yet, run a general-purpose Sonnet agent told to read and follow `.claude/agents/<name>.md`.

### Orchestration rules
- Main session = orchestrator and sole implementer. Agents advise; they don't edit app code.
- Delegate only when a specialist view adds real value. Ordinary task → no agent or one agent.
- Max **two agents in parallel**, only when their tasks are independent and don't read the same files.
- Give each agent: the goal, the PRD section(s), the exact files/dirs, and what to return. No "look at everything".
- Agents return concise structured findings; main session synthesizes and decides.
- Don't create new agents automatically — suggest one only if a responsibility keeps recurring.
- Agent Teams: **not enabled**. Suggest an optional experiment when a task fits; before enabling, explain cost, check version support, explain config, get approval.

### Learning notes (AI Developers course)
When delegating, state briefly: why this agent, what context it gets, what it returns, how the findings are used. Keep it to 2–4 lines in routine work. For an interesting multi-agent case, offer one optional experiment.

## Verification (proportional)
- Small change → targeted tests only.
- Significant change → unit + integration tests.
- Important user flow → E2E.
- Sensitive functionality (PRD §22, §27.3 priority areas) → `security-reviewer`.
- Significant UI → `ui-ux-specialist` (accessibility is a release criterion, PRD §18).
- Never claim tests passed unless they ran in this session. Don't run the full suite when a targeted run suffices.

## Git
- Branches: `main` (stable), `dev` (integration), `feature/*`, `bugfix/*`. Never develop on `main`.
- Check `git status` before committing; never include unrelated changes or overwrite user work.
- Ask first: pushes, merges, force/destructive ops, schema migrations on real data.

## Usage efficiency
Don't re-read unchanged files · no duplicate analysis between main session and agents · short agent prompts and short reports · one related topic per session · update `docs/handoff.md` instead of re-explaining context.

## Security basics
Never print, commit or move secrets. Authorization is enforced server-side on every group-scoped request (PRD §21.2, §22.1).
