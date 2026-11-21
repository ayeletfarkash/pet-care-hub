# Development Handoff

Keep this short. Newest entry on top; trim entries older than the current phase.

## Current state
- Phases 1–4 merged into `dev` (not pushed).
- Stack: Next.js 16 + TS + Drizzle/SQLite + Tailwind 4. See [architecture.md](architecture.md).
- Tests: 87 Vitest + 26 Playwright (incl. axe WCAG 2.2 AA, he + en), all passing on 2026-11-21.
- Local dev DB migrated through 0006 (backups: `data/app.db.bak-pre-phase3`, `-pre-phase4`, `-pre-phase4-push`, `-pre-phase4-auto`).
- `.env.local` (git-ignored) holds generated dev VAPID keys, so push works on localhost.

## Next steps
1. Click through inventory/orders/routines with real data.
2. Manual accessibility checks in [testing.md](testing.md) (NVDA, mobile, zoom/reflow, forced colors), now also for inventory/orders/routines.
3. Try push on a real phone (needs HTTPS hosting or a tunnel; iOS needs the PWA added to the home screen).
4. Manual checks: screen reader on Notifications/Search/Insights, header at 320 px / 200% text / Hebrew.
5. Phase 5 (future expansion) only after the Phase 4 acceptance criteria are confirmed in the browser.

## Open decisions (need the user)
- Email provider for invitations (currently dev-only console log).
- Google sign-in (needs Google OAuth credentials); Apple (needs paid developer account).
- Hosting target (SQLite single-process is fine for one instance; multi-instance → Postgres).
- Accessibility contact email for the statement (`ACCESSIBILITY_CONTACT_EMAIL`).
- Obsidian vault location (MCP server was unreachable).

## Log
### 2026-11-21: Profile, invitations and form improvements (branch `feature/phase2-ui-improvements`)
- Decision (user): invitation tokens are now also stored AES-256-GCM encrypted (`invitations.token_enc`, migration 0007, key from `INVITE_LINK_SECRET`, required in production) so every active invitation gets Copy / WhatsApp / email actions. Lookups still use the hash. Older invitations show "Link not available".
- Invite UI: one compact form (role, expiry, reusable). The email-invite form is gone; the server's email-bound invite path and console mailer remain for a future email provider.
- Profile: photo saves on file select (pencil = choose/replace, trash = remove; focus returns to the pencil). Estimated age = years + months (0–11), still stored as fractional years. Identifying characteristics removed from form/view and validation; the DB column and old data are kept.
- Medication form shows 3 time fields, routines 1, with "Add time" up to 6. End-date and times hints removed.
- Dev DB needs `npm run db:migrate` (0007) before `npm run dev`.
- Agents used: security-reviewer (no Critical/High; Medium fixed: secret fails closed outside development/test; Lows accepted: no AAD/length checks, link sent to wa.me/mailto is a user-initiated share, token in the auth-gated dynamic admin page).
### 2026-11-14: Navigation and page structure (branch `feature/navigation-profile`, not committed)
- Decisions (user): Profile section lives inside each pet (tabs "Pet profile" / "Group members"); the pet section tabs (not the header links) move to a bottom bar.
- Design: bottom bar is `position: fixed`, rendered after the content (focus order = visual order), scrolls sideways on phones and scrolls the current item into view; `body/html:has([data-bottom-bar])` add bottom padding + scroll-padding so the footer and focused controls stay clear (WCAG 2.4.11). Profile tabs are links with `aria-current`, not an ARIA tablist (separate URLs).
- Medical History: pages, server actions and form removed; `medical_records`/`attachments` data, `services/medical.ts`, its unit tests and the auth-checked download route kept; removed from search types. Insights "medical" category is unaffected (it covers doses/treatment events).
- Known, pre-existing: members page overflows horizontally at 375 px (tables/invite section), not caused by the new nav.
### 2026-11-14: Phase 4 slice 5 (insights + dashboard) — Phase 4 complete
- Decisions: insights computed on read; "keeps slipping" = 3 of last 5 instances in 4 weeks; dashboard shows only actionable kinds; no Insights header link (reflow).
- Agents used: ui-ux-specialist (Majors fixed: header crowding, glance link names include the pet, unused intro shown; fieldset/legend, "Apply filters", filtered empty state, full lists on the insights page, Hebrew labels).
- Phase 4 acceptance: preferences, recipients, snooze, search isolation, rule-based insights, duplicate-free auto tasks are covered by tests; assistive-technology behaviour still needs a manual screen-reader pass.
### 2026-11-14: Phase 4 slice 4 (global search)
- Decisions: LIKE over FTS (small data, Hebrew gains nothing from FTS5 tokenising); scope always from current memberships; generic open/closed status filter; GET form so filters are shareable URLs.
- Lesson: after a full-page GET, a server-rendered `role="status"` is not announced; focus a summary heading instead (`components/focus-on-load.tsx`).
- Agents used: security-reviewer (no Critical/High/Medium; rate limit added; assignee/group params only narrow scope, accepted) · ui-ux-specialist (Majors fixed: focused results heading, heading order; link descriptions, hidden separators, Hebrew wording; collapsible filters skipped).
### 2026-11-14: Phase 4 slice 3 (automatic tasks)
- Decisions: generator runs inside the sweep; idempotent via partial unique `source_key`; reorder tasks unassigned, skipped while an order is open; appointment tasks opt-in per event; no dose tasks.
- Lesson: Next 16 streams `<title>` after the body, so axe could intermittently report `document-title`. `expectNoA11yViolations` now waits for a non-empty title (found by repeating the test 5×).
- Agents used: security-reviewer (no Critical/High/Medium; 2 Lows fixed: assignee membership re-check, group filter on open-task check; conflict-target note accepted).
### 2026-11-14: Phase 4 slice 2 (snooze + Web Push)
- Decisions: `web-push` pinned to 3.6.7 (4.0.0 released 8 days earlier); push endpoints allowlisted to real push services (SSRF); payloads name the pet only; snooze never touches schedules and keeps one pending snooze per occurrence.
- Lesson: Next loads `.env.local` in the E2E production server too; tests that depend on env set it explicitly in `playwright.config.ts` (dummy VAPID keys, `DISABLE_JOBS=1`).
- Agents used: security-reviewer (no Critical/High; 2 Medium fixed: snooze row growth, unbounded push fan-out; Low fixed: userinfo in endpoint; takeover/lock-screen Lows accepted) · ui-ux-specialist (Majors fixed: unique Snooze button names, single push toggle keeps focus, "Checking…" status; focus-after-snooze rejected: status message is shown and the form stays; Hebrew labels, hints, bidi time fixed).
### 2026-11-14: Phase 4 slice 1 (notification core)
- Decisions (user): deliver Phase 4 in slices; add `web-push` for push; low stock notifies all members, reorder task unassigned; appointment prep/follow-up tasks opt-in per event.
- Decisions (design): reminders derived by an idempotent sweep (unique index, 6 h lookback, no "last run" state); notifications store i18n key + params; one reminder rule per source; preferences store only disabled categories; unassigned sources remind everyone.
- Lesson: layout and page render in parallel, so a sweep inside a page can't update the header count. The sweep runs in the layout instead, only after a write and at most every 5 s (security review: page loads must not each trigger a whole-DB sweep).
- Lesson: Playwright `getByRole({ name })` is a substring match; a second "Save notification preferences" button broke old `name: "Save"` lookups. Use `exact: true`.
- Lesson: working tree files are CRLF (autocrlf); multi-line string edits via scripts must strip `
` first.
- Agents used: architect (design, 9 decisions) · security-reviewer (no Critical/High; Medium sweep cost fixed with the 5 s floor; 3 Lows accepted) · ui-ux-specialist (Major fixed: recipient checkboxes only in "selected" mode; Major rejected: ActionForm already restores focus; Hebrew wording fixed).
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
