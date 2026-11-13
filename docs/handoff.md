# Development Handoff

Keep this short. Newest entry on top; trim entries older than the current phase.

## Current state
- Phase 1 merged into `dev`. **Phase 2 implemented** on `feature/phase-2-daily-care` (uncommitted until approved).
- Stack: Next.js 16 + TS + Drizzle/SQLite + Tailwind 4. See [architecture.md](architecture.md).
- Tests: 52 Vitest + 16 Playwright (incl. axe WCAG 2.2 AA), all passing on 2026-11-13.

## Next steps
1. Review & commit Phase 2 → merge into `dev` (needs approval).
2. Manual accessibility checks in [testing.md](testing.md) (NVDA, mobile, zoom/reflow, forced colors), now also for medications/calendar/tasks.
3. Phase 3 (inventory, orders, routines): architect review of the schema first, in a fresh session.

## Open decisions (need the user)
- Email provider for invitations (currently dev-only console log).
- Google sign-in (needs Google OAuth credentials); Apple (needs paid developer account).
- Hosting target (SQLite single-process is fine for one instance; multi-instance → Postgres).
- Accessibility contact email for the statement (`ACCESSIBILITY_CONTACT_EMAIL`).
- Obsidian vault location (MCP server was unreachable).

## Log
### 2026-11-13: Phase 2 build
- Decisions: doses and event occurrences are computed from rules, never stored; only confirmations/statuses are rows. Wall-clock Israel time strings. Reminders = computed "Today" dashboard (no jobs until Phase 4). Calendar = month agenda list.
- Lesson: E2E helper must wait for a server action to finish before navigating, or the action is cancelled.
- Lesson: when an action removes its own button, both the success message and focus need a home outside it (app-wide live region + focus fallback).
- Agents used: architect (14 findings, 5 High → cross-group checks, dose validation, history kept, idempotent recurring tasks) · security-reviewer (no Critical/High; 4 Low fixed: caregiver 48 h backfill limit, occurrence validation, bidi-safe file names, upload rate limit) · ui-ux-specialist (5 Major fixed: focus after actions, pet name in dose labels, task reopen, calendar landmarks, wrapping section nav).

### 2026-11-12: Phase 1 build
- Decisions: Drizzle + libsql instead of Prisma (Prisma's npm "latest" tag pointed at an RC; its stable driver needs a native build); `cacheComponents` off; in-house auth/i18n (no paid services, no extra deps).
- Lesson: local libsql + concurrent writes deadlocks the event loop. All writes go through the `writeTx()` queue (found by concurrency tests).
- Lesson: unlayered global CSS beats Tailwind utilities. Element defaults now live in `@layer base` (found by a manual browser check; axe missed it).
- Agents used: architect (schema review, ~64k tokens) · security-reviewer (no Critical/High; 3 rate-limit fixes) · ui-ux-specialist (6 Majors fixed: mobile toolbar, focus, RTL arrows, table button names, dialog initial focus, Hebrew copy) · qa-specialist (5 gaps → 5 new unit tests).
- Agent files load at session start; mid-session they were run as general-purpose agents told to follow `.claude/agents/<name>.md`.

### 2026-11-12: Claude Code setup
- Added `CLAUDE.md`, `.claude/settings.json` (model: sonnet), four agents in `.claude/agents/`.
- Decision: main session implements; agents are read-only advisors (QA may run tests).
