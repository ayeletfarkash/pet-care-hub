# Development Handoff

Keep this short. Newest entry on top; trim entries older than the current phase.

## Current state
- Phases 1–2 in `dev`. **Phase 3 implemented** and committed on `feature/phase-3-inventory-routines` (not merged).
- Stack: Next.js 16 + TS + Drizzle/SQLite + Tailwind 4. See [architecture.md](architecture.md).
- Tests: 65 Vitest + 19 Playwright (incl. axe WCAG 2.2 AA, he + en), all passing on 2026-11-13.
- Local dev DB needs `npm run db:migrate` for the Phase 3 tables (adds tables only).

## Next steps
1. Migrate the local dev DB, click through inventory/orders/routines, then merge Phase 3 into `dev` (needs approval).
2. Manual accessibility checks in [testing.md](testing.md) (NVDA, mobile, zoom/reflow, forced colors), now also for inventory/orders/routines.
3. Phase 4 (notifications, automatic tasks, search, insights): architect review first, in a fresh session.

## Open decisions (need the user)
- Email provider for invitations (currently dev-only console log).
- Google sign-in (needs Google OAuth credentials); Apple (needs paid developer account).
- Hosting target (SQLite single-process is fine for one instance; multi-instance → Postgres).
- Accessibility contact email for the statement (`ACCESSIBILITY_CONTACT_EMAIL`).
- Obsidian vault location (MCP server was unreachable).

## Log
### 2026-11-13: Phase 3 build
- Decisions: routines reuse the medication schedule rules and maths; stock estimate computed (days left = quantity ÷ daily use; reorder at threshold, 0, or ≤ 7 days); every stock change is a movement row; a delivered order restocks at most once (partial unique index). No pet_id columns (one pet per group).
- Lesson: same-millisecond rows need a tiebreaker (`rowid`) when history is ordered by `created_at`.
- Lesson: axe can sample mid colour-transition; `expectNoA11yViolations` now waits for `document.getAnimations()` to be empty.
- Lesson: a long-running `next dev` can keep a stale export list for a "use client" file; new exports render as undefined (500) until the file is touched or the server restarted. Production build is unaffected.
- Lesson: the E2E suite outgrew the 20/hour register limit; `REGISTER_RATE_LIMIT` is raised only in the Playwright server env.
- Agents used: architect (10 findings; rejected pet_id and race items, accepted same-group checks, missed→completed update, URL parsing, rounding) · security-reviewer (no Critical/High; Medium rejected as PRD-allowed; 3 Lows fixed: stock cap, URLs with credentials, group filter) · ui-ux-specialist (no blockers; 5 fixed: labelled end date, "Enough" badge, ₪ currency format, visible new-tab cue, Hebrew wording).

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
