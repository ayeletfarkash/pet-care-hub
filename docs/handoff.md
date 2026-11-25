# Development Handoff

Keep this short. Newest entry on top; trim entries older than the current phase.

## Current state
- Phases 1–4, the calendar/completion UI and the removal of roles are merged into `dev` (not pushed).
- Stack: Next.js 16 + TS + Drizzle/SQLite + Tailwind 4. See [architecture.md](architecture.md).
- Tests: 95 Vitest + 28 Playwright (incl. axe WCAG 2.2 AA, he + en), all passing on 2026-11-25.
- Local dev DB migrated through 0009 (latest backup: `data/app.db.bak-pre-google-signin`; older `-pre-tasks-delete`, `-pre-phase3`, `-pre-phase4*`, `-pre-invite-enc`).
- `.env.local` (git-ignored) holds generated dev VAPID keys, so push works on localhost.

- Branch `feature/google-signin-password-reset` (not merged): password reset + Google sign-in. 106 Vitest + 32 Playwright passing on 2026-11-25.. Not yet tried with real Gmail or Google credentials ([setup](development.md)).

## Next steps
0. Add `SMTP_URL` and `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` to `.env.local`, then try a real reset email and a real Google sign-in.
1. Click through inventory/orders/routines with real data.
2. Manual accessibility checks in [testing.md](testing.md) (NVDA, mobile, zoom/reflow, forced colors), now also for inventory/orders/routines.
3. Try push on a real phone (needs HTTPS hosting or a tunnel; iOS needs the PWA added to the home screen).
4. Manual checks: screen reader on Notifications/Search/Insights, header at 320 px / 200% text / Hebrew.
5. Phase 5 (future expansion) only after the Phase 4 acceptance criteria are confirmed in the browser.

## Open decisions (need the user)
- Apple sign-in (needs paid developer account).
- Hosting target (SQLite single-process is fine for one instance; multi-instance → Postgres).
- Accessibility contact email for the statement (`ACCESSIBILITY_CONTACT_EMAIL`).
- Obsidian vault location (MCP server was unreachable).

## Log
### 2026-11-25: Password reset and Google sign-in (branch `feature/google-signin-password-reset`)
- Decisions (user): reset emails through Gmail SMTP (`nodemailer`, pinned to 10.4.1 because 10.6.1 was 5 days old; no dependencies). Google sign-in is written by hand (no auth library).
- Decisions (design): linking Google to an existing account removes the old password and logs out every device, because sign-up never verifies emails; only Gmail/Workspace addresses may link. A reset also deletes push subscriptions. Emailed links use `APP_URL`, never the Host header.
- Not done (not requested): Apple sign-in, email verification, change-password screen, sending invitations by email.
- Lesson: logging in clears the visitor language cookie, so E2E pages are Hebrew again after logout.
- Agents used: security-reviewer (no Critical/High; Medium accepted: reset limits are per email and, without `TRUST_PROXY=1`, global, as for login; Lows accepted: reset-cookie fixation, small timing difference, notice keys) · ui-ux-specialist (no Blockers; fixed: forgot-link target size, wording of the logout warning; rejected: alert on page load (same as /join), resend form).
### 2026-11-25: Roles removed (branch `feature/remove-roles`, on top of `feature/phase4-calendar`)
- Decision (user): no roles or per-member permissions; every member of a group can do everything, including inviting/removing members and deleting the group. Group isolation (`requireMembership`) is unchanged and still the only gate.
- Consequences: last-Admin rule → last member can't leave (`last_member`); handovers apply at once (`transferTask`; approval flow and dashboard approvals removed); no 48 h back-recording limit; any member can restore a deleted group; anyone can correct dose/routine records in the history (checkboxes stay locked).
- No migration: `memberships.role`, `invitations.role` and `task_transfer_requests` stay in the DB, unused. Reverting the branch restores roles; members who joined meanwhile would be admins.
- Existing Caregivers and open invitation links get full rights when this ships: review members and revoke links first.
- Agents used: security-reviewer (no Critical/High; isolation and last-member guard intact). Deleting a dose, routine log, task or event now writes an `audit_logs` row (who, which record; no notes; user decision). No screen shows it, and earlier deletions were not logged. Accepted: any member can remove others or delete the group (restorable 30 days); rejoin through a reusable link (the remove dialog says to revoke it).
- PRD §3 and §26 rewritten; elsewhere PRD "Admin/Caregiver" reads as "any member".
### 2026-11-25: Calendar view and completion checkboxes (branch `feature/phase4-calendar`)
- Decisions (user): recorded doses and routine logs are locked once checked (unchecking would delete the record; Admins still correct them in the plan/routine history); the checkbox sits at the start of the row (right in Hebrew, left in English), like the task list.
- `CompletionCheckbox` (`on` / optional `off` fields) replaces `TaskCheckbox` and the complete/given/done buttons everywhere except the inbox. No `off` = locked. Server actions, services and schema for doses, routines and events are unchanged. "Report missed" and event "Cancel"/"Undo" stay buttons.
- Calendar: `?view=calendar` = server-rendered month table (`calendar/month-grid.tsx`, read-only); list is the default; `?day=YYYY-MM-DD` opens the list at that day, also when empty. Tasks in the calendar now come from `groupTasksDue` (open + completed). Dose checkbox names now include the date.
- Routines are not shown in the calendar (not requested).
- Lesson: Playwright treats `aria-disabled` as not enabled, so `click()` waits forever; use `press("Space")`.
- Lesson: string-compared date loops never end past 9999-12-31 ("+010000-…" sorts first). Count days when the range comes from a URL.
- The full E2E run takes 4–8 minutes; run it in the background, and do not edit specs while it runs (workers read them late).
- Agents used: ui-ux-specialist (no Blockers; 2 Majors fixed: kind marks on grid chips, visible + described locked state; picked day no longer colour-only; truncation and the 23:59 "no time" convention accepted). security-reviewer not used: no auth/permission/data-access rule changed; the one new read starts with `requireMembership` (tested).
### 2026-11-23: Tasks follow-up fixes (same branch)
- Repeating tasks: the next instance copies the reminder rule and recipients; a custom time moves by as much as the due date.
- A custom time that already fired can stay when other reminder settings change; a new past time is refused (`past_reminder`, checked in `setReminderRule`). It fires once: reopening a task does not repeat it.
- `SelectField` remounts when its default changes (`key`), because React's form reset dropped every select's choice after a failed submit, in all forms. Never pass it a `defaultValue` that follows the user's typing: it would remount and lose focus.
- `TaskCheckbox` is no longer a form and no longer remounts, so focus stays on it. Specific "completed"/"reopened" messages. Deleting from the list stays on the list and moves focus to the next row.
- Push/preferences notice is now the reminder select's hint (announced with the field), worded for any reminder kind; replaces `ReminderAvailability`.
- Watch: two E2E server actions stalled >10 s (create task, register). The register one coincides with Windows entering Modern Standby; the create-task one is unexplained (machine was low on memory) and did not recur in 24 repeats. Keep the laptop awake during E2E runs; investigate if it happens again.
- Agents used: ui-ux-specialist (no Blockers; 3 Majors fixed; `dir="ltr"` date field fixed; focus after delete fixed; rejected: aria-disabled checkbox finding (controlled, so it does not flip), wording-only notes).
### 2026-11-22: Tasks and completion interactions (branch `feature/phase2-ui-improvements`)
- Cancel removed from UI/actions/service; the done view lists completed only. The `cancelled` status stays in the enum so old rows still render (reachable by URL/search).
- Permanent delete (Admins, server-enforced) via trash icon + ConfirmDialog (`triggerIcon` prop), on the list and detail page. `deleteTask` removes dependents explicitly in one `writeTx` (assignees, comments, history, transfer requests, reminder rule + recipients, notifications; no reliance on FK cascades). Deleting a recurring task's open instance ends the series; earlier instances stay.
- Decision: a deleted automatic task is recorded in `dismissed_auto_tasks (group_id, source_key)` so the generator doesn't recreate it in the same cycle (migration 0008).
- Completion is a checkbox (`forms/task-checkbox.tsx`): check = complete, uncheck = reopen; history rows kept. The inbox's "Mark as completed" button is unchanged.
- Custom reminders: `reminder_rules.remind_at` (tasks only; overrides lead time; must be in the future). Add Task form has a Reminder choice (presets + custom); the task page's reminder card offers the same. Sweep fires it once (`occurrenceKey = custom:<time>`), also for undated tasks; preferences still apply. `ReminderAvailability` warns when push is unsupported/blocked or task reminders are off.
- Lesson: React resets a form after an action; a `<select>` goes back to its mount-time default even when controlled. Remount it with the echoed value (`key`) — see `reminder-fields.tsx`. (2026-11-23: fixed for all selects.)
- Local dev DB migrated to 0008 on 2026-11-22 (backup `data/app.db.bak-pre-tasks-delete`).
- Agents used: security-reviewer (no Critical/High/Medium; Low fixed: custom reminder capped at 1 year; Low accepted: deleted auto-task stays dismissed for that cycle key, group-scoped).
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
