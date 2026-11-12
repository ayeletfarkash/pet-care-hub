# Development Handoff

Keep this short. Newest entry on top; trim entries older than the current phase.

## Current state
- Phase: pre-Phase 1 (no code yet).
- Stack: not chosen.
- Git: local repo, `main` (baseline) + `dev` (current). No remote.

## Next steps
1. Architect agent: propose tech stack + Phase 1 schema (PRD §21, §24 Phase 1) on a `feature/*` branch off `dev`.
2. Create `docs/architecture.md`, `docs/development.md`, `docs/testing.md` once decisions exist.

## Open decisions
- Tech stack, database, auth provider, hosting, test tooling.
- Obsidian vault location (MCP server was unreachable during setup).

## Log
### 2026-11-12 — Claude Code setup
- Added `CLAUDE.md`, `.claude/settings.json` (model: sonnet), four agents in `.claude/agents/`.
- Decision: main session implements; agents are read-only advisors (QA may run tests).
- Decision: project `CLAUDE.md` overrides user-level workflow (no automatic Opus).
