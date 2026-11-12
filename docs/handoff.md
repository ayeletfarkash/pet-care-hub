# Development Handoff

Keep this short. Newest entry on top; trim entries older than the current phase.

## Current state
- Phase: **Phase 1 implemented**, on branch `feature/phase-1-core` (uncommitted until approved).
- Stack: Next.js 16 + TS + Drizzle/SQLite + Tailwind 4. See [architecture.md](architecture.md).
- Tests: 24 Vitest + 12 Playwright (incl. axe WCAG 2.2 AA), all passing on 2026-11-12.

## Next steps
1. Review & commit Phase 1 → merge `feature/phase-1-core` into `dev` (needs approval).
2. Manual accessibility checks in [testing.md](testing.md) (NVDA, mobile, zoom/reflow, forced colors). Then update the accessibility statement.
3. Phase 2 planning (medical history, medications, appointments, tasks, reminders): architect review of the schema first.

## Open decisions (need the user)
- Email provider for invitations (currently dev-only console log).
- Google sign-in (needs Google OAuth credentials); Apple (needs paid developer account).
- Hosting target (SQLite single-process is fine for one instance; multi-instance → Postgres).
- Accessibility contact email for the statement (`ACCESSIBILITY_CONTACT_EMAIL`).
- Obsidian vault location (MCP server was unreachable).

## Log
### 2026-11-12: Phase 1 build
- Decisions: Drizzle + libsql instead of Prisma (Prisma's npm "latest" tag pointed at an RC; its stable driver needs a native build); `cacheComponents` off; in-house auth/i18n (no paid services, no extra deps).
- Lesson: local libsql + concurrent writes deadlocks the event loop. All writes go through the `writeTx()` queue (found by concurrency tests).
- Lesson: unlayered global CSS beats Tailwind utilities. Element defaults now live in `@layer base` (found by a manual browser check; axe missed it).
- Agents used: architect (schema review, ~64k tokens) · security-reviewer (no Critical/High; 3 rate-limit fixes) · ui-ux-specialist (6 Majors fixed: mobile toolbar, focus, RTL arrows, table button names, dialog initial focus, Hebrew copy) · qa-specialist (5 gaps → 5 new unit tests).
- Agent files load at session start; mid-session they were run as general-purpose agents told to follow `.claude/agents/<name>.md`.

### 2026-11-12: Claude Code setup
- Added `CLAUDE.md`, `.claude/settings.json` (model: sonnet), four agents in `.claude/agents/`.
- Decision: main session implements; agents are read-only advisors (QA may run tests).
