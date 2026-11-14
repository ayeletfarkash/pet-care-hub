# Architecture

Product spec: [../PRD.md](../PRD.md). This file records the technical decisions behind it.

## Stack
| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 16 App Router, React 19, TypeScript | One codebase for UI and server; Server Actions for mutations |
| Database | SQLite (local file) via `@libsql/client` + Drizzle ORM | Free, zero setup, prebuilt binaries on Windows. Postgres later = new Drizzle dialect + migrations |
| Validation | zod (at every trust boundary) | |
| Auth | In-house: `node:crypto` scrypt hashes, random 256-bit session token in httpOnly cookie, SHA-256 of token in DB | No paid provider, no extra dependency |
| i18n | In-house dictionaries `src/i18n/{en,he}.ts` | Two languages; `he` is type-checked against `en` |
| Styling | Tailwind CSS 4 with CSS-variable tokens | High-contrast theme = swap the variables |
| Tests | Vitest (services) · Playwright + axe-core (E2E, WCAG) | |

`cacheComponents` is **off**: every page depends on the session, language and accessibility cookies.

## Layout
```
src/
  server/                # backend only – never imported by client components
    db/                  # schema.ts, client + writeTx(), migrate.ts
    auth/                # password hashing, session cookies
    services/            # business logic; each function takes the acting userId
    permissions.ts       # requireMembership() – the single authorization gate
    validation.ts        # zod schemas (error messages are i18n keys)
  app/
    actions/             # "use server" – thin: parse form → call service → map errors
    …pages               # Server Components read via services
  components/            # UI (ui/ = design system primitives, forms/ = client forms)
  i18n/                  # dictionaries, formatting (he-IL / en-IL, Asia/Jerusalem)
drizzle/                 # generated SQL migrations
```
Rule: **UI → actions → services → db**. Services have no Next.js imports, so Vitest tests them directly.

## Data model (Phase 1)
- `users` (email unique, lower-cased; `locale`; `deleted_at` reserved for PRD §4.8)
- `sessions` (token hash, expiry; expired rows purged lazily at login)
- `groups` (soft delete: `deleted_at`, restorable 30 days) ⟷ `pets` (1:1, `group_id UNIQUE`; vet + insurance columns merged in, since they are strictly 1:1)
- `memberships` (unique `(group_id, user_id)`, role `admin|caregiver`)
- `invitations` (token hash, role, optional bound email, reusable flag, use count, expiry, revoked_at)
- `accessibility_preferences` (per user)
- `audit_logs` (group-scoped; invites, joins, removals, role changes, pet edits; never stores tokens)

## Authorization
- Every group-scoped service call starts with `requireMembership(executor, userId, groupId, minRole?)`.
- Non-member and missing/deleted group both return `not_found` (no group-ID probing). Pages render 404.
- Server Actions re-check everything; page-level checks are UX only.
- Last-admin rule: checked and written inside one transaction (role change, removal, leave).

## Concurrency
Local libsql runs SQLite synchronously on the Node thread. Two connections contending for the write lock would block the event loop (deadlock until busy timeout). So **all writes go through `writeTx()`**: an in-process queue + `BEGIN IMMEDIATE`. Reads remain concurrent (WAL mode).
Limitation: single server process only. Multi-instance hosting → move to Postgres and use row locks.

## Invitations
`/invite/<token>` (GET) stores the token in a 24 h httpOnly cookie and redirects to `/join` (removes the token from the URL; visiting never joins by itself). Logged-in users confirm on `/join`; new users register and are joined automatically. Consumption is a single conditional `UPDATE … WHERE usable` checked by rows-affected, in the same transaction as the membership insert.

## Files
Pet photos: magic-byte check (JPEG/PNG/WebP), 5 MB cap, generated filename under `UPLOAD_DIR` (outside `public/`), served by `/groups/<id>/photo` after a membership check with `nosniff` + `private, no-store`.

## Phase 2: daily care
| Module | Tables | Notes |
|---|---|---|
| Medical | `medical_records`, `attachments` | Both roles add records/documents; Admins edit/delete. Files: magic-byte check (PDF/JPG/PNG/WebP), 10 MB, removed from disk with their rows; served by `/groups/<id>/attachments/<aid>` |
| Medications | `medication_plans`, `medication_administrations` | **Doses are computed** from the plan (`schedule.ts`), never stored. An administration row (unique per plan + scheduled time) is the only proof a dose was given. A dose may be confirmed ≤ 60 min early; Caregivers can record doses up to 48 h back, older ones need an Admin. Plans with history can be ended, not deleted |
| Events | `events`, `event_occurrence_status` | Occurrences computed from a recurrence rule; completed/cancelled stored per occurrence and validated against the rule |
| Tasks | `tasks`, `task_assignees`, `task_comments`, `task_history`, `task_transfer_requests` | Overdue is computed. Recurring tasks need a due date; completing one inserts the next instance (`UNIQUE(series_id, due_at)` makes it idempotent); cancelling ends the series. One pending transfer per task (partial unique index) |
| Reminders | none | "Today" on the dashboard is computed per request: my doses, my tasks, next 7 days, approvals. No notification table or jobs until Phase 4 |

Rules added in Phase 2:
- **Times** are wall-clock strings in Israel time (`YYYY-MM-DDTHH:mm`); all maths in `src/server/schedule.ts` (unit-tested incl. DST, month-end clamping, Feb 29).
- Every Phase 2 table has `group_id`; child rows are always read/written with a `group_id` filter. User references (assignee, responsible person) must be current members (`requireMembersOf`).
- Leaving/removal (`members.ts → releaseResponsibilities`) unassigns open tasks, plan responsibility and event assignments in that group, in the same transaction.
- "Created/given by" columns are `ON DELETE SET NULL` and render as "former member".
- Success messages from controls that disappear after acting go to one app-wide live region (`components/live-region.tsx`).

- After a one-button action removes its own button (complete, mark given), focus moves to the next item or the section heading (`forms/action-form.tsx`).
- Completed tasks can be reopened by either role (undo a mis-tap); cancelling stays Admin-only.

Deliberately not in Phase 2: notification recipients, reminder offsets, participants (Phase 4); medication inventory (Phase 3); automatic task creation (Phase 4); plan versioning (editing a plan's times re-computes past doses; existing administrations stay in history).

## Phase 3: inventory and routines
| Module | Tables | Notes |
|---|---|---|
| Inventory | `inventory_items`, `inventory_movements` | Both roles change quantities (use, purchase, counted quantity, ran out); Admins add/edit/delete products. Every change writes a movement (delta + quantity after), so purchase/use history is complete. Quantities never go below 0 and are rounded to 3 decimals. Optional link to a medication plan (PRD §6.5) |
| Stock estimate | none | Computed (`stockStatus` in `schedule.ts`): days left = quantity ÷ estimated daily use; reorder when at/below the user's threshold, at 0, or ≤ 7 days left (`REORDER_LEAD_DAYS`) |
| Orders | `orders` | Both roles create orders and change status; Admins edit details/delete. URLs must parse as absolute http(s) and render with `rel="noopener noreferrer nofollow"`. Marking delivered can add the order quantity to the linked item, at most once (partial `UNIQUE(order_id)` on movements); changing the status back never removes stock |
| Routines | `routines`, `routine_logs` | Same schedule columns and maths as medication plans (shared `scheduleShape` / `ScheduleFields`). Activities are computed; a log row records completed or missed. Re-logging the same activity updates it (missed → completed). Extra activities have no scheduled time and are always "completed". Caregivers log ≤ 48 h back; Admins remove logs. Routines with logs are ended, not deleted |

Rules added in Phase 3:
- The pet is implicit (one pet per group), so no `pet_id` columns.
- Linked ids (item, plan) are checked to be in the same group (`invalid_reference`).
- Dashboard "Today" adds my routine activities and items running low.
- Leaving/removal also releases routine responsibility.

Deliberately not in Phase 3: reminder recipients for routines (Phase 4 notifications) · automatic reorder tasks (Phase 4) · deducting stock automatically when a dose is given · currency other than ₪.

## Phase 4: coordination (built in slices)
### Slice 1: notification core
| Piece | Where | Notes |
|---|---|---|
| Tables | `notification_preferences`, `reminder_rules`, `reminder_rule_recipients`, `notifications` | Preferences store only disabled categories (missing row = on). One rule per source (task/event/plan/routine): lead time (0/15/60/1440 min) + recipients (responsible · all · selected). No rule = responsible person, default lead (events 1 h, others 0) |
| Sweep | `services/reminders.ts` | Recomputes the existing doses/occurrences/tasks/activities/low stock; inserts one notification per recipient for reminders whose time fell in the last 6 h. `UNIQUE(user, source_type, source_id, kind, occurrence_key)` + `ON CONFLICT DO NOTHING` makes every run idempotent, so no "last run" state is kept. Purges rows older than 90 days |
| Scheduling | `src/instrumentation.ts` + root layout | 60 s `setInterval` per server process (`DISABLE_JOBS=1` turns it off), plus a page-load sweep when anything was written since the last one (`writeCount()` in `db/index.ts`), so new items remind at once and the header count matches the inbox. Overlapping runs are coalesced |
| Inbox | `/notifications`, header link with unread count | Stored as i18n key + params (each reader sees their language); links are built from source type/id, never stored. Task notifications offer "Mark task as completed" (reuses `taskStatusAction`) |

Rules added in slice 1:
- Recipients are filtered at creation: current members only, and only if the category is on in their preferences. Unassigned sources remind every member.
- Low stock reminds every member once per restock cycle (cycle = number of purchase movements).
- The sweep is a system job: group ids come from the database, so it has no `requireMembership` (documented exception).
- Setting a rule needs the role that can create the source: Admin for plans/routines, any member for tasks/events. Selected recipients must be members.
- Leaving/removal deletes the user's notifications and rule-recipient rows in that group.
- Reminders whose time is more than 6 h past are dropped (no flood after downtime, and none for back-dated items).

### Slice 2: snooze + Web Push
| Piece | Where | Notes |
|---|---|---|
| Snooze | `snoozeNotification` in `services/notifications.ts`, inbox | Marks the notification read and inserts a `kind = snooze` row with a later `deliver_at` (15 min, 1 h, tomorrow 08:00, custom ≤ 30 days). Never writes to tasks/plans/schedules (PRD §12.5). One pending snooze per occurrence (a new one replaces it) |
| Push | `services/push.ts`, `push_subscriptions`, `notifications.pushed_at` | `web-push@3.6.7` (pinned; 4.0.0 was days old). Runs after every sweep, not awaited by pages. Pushes unread notifications delivered in the last 30 min, once each (claimed via `pushed_at` before sending), 20 at a time with a 10 s timeout; 404/410 deletes the subscription. Payload names the pet only (lock screens) |
| Subscriptions | profile → "Phone notifications" | Permission asked only after a button press. Endpoints must be https on known push services (FCM, Mozilla, Apple, WNS); no port or credentials (SSRF guard). Max 10 per user; an endpoint moves to whoever registers it last |
| PWA | `public/sw.js`, `app/manifest.ts`, `/pwa-icon/<180|192|512>` | Service worker shows the push and always opens `/notifications` (URL never taken from the payload). Icons drawn with `next/og` shapes, no fonts fetched |

Push is off unless `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` are set; the inbox is always the fallback (PRD §12.3).

### Slice 3: automatic tasks
| Piece | Where | Notes |
|---|---|---|
| Generator | `services/auto-tasks.ts`, run first in every sweep | Tasks get `source_type`/`source_id`/`source_key`; partial `UNIQUE(group_id, source_key)` + `ON CONFLICT DO NOTHING` = created at most once, and a completed/cancelled task is never recreated |
| Low stock | key `reorder:<item>:<restock cycle>` | Unassigned "Reorder X" task (user decision). Skipped while an order for the item is ordered/processing/shipped or a reorder task is open. A new purchase starts a new cycle |
| Appointments | opt-in `events.auto_prep` / `auto_followup` (checkboxes on the event form) | Prep task appears up to 1 day before (due at the appointment); follow-up within 1 day after (due end of next day). Assigned to the event's responsible person if still a member. Cancelled occurrences get none |
| Doses | none | Already computed, shown in Today and reminded; dose tasks would duplicate them |

Task text is stored, so it is written in the language of the group's first Admin. History shows "Created automatically · Automatic" (actor null).

### Slice 4: global search
| Piece | Where | Notes |
|---|---|---|
| Service | `services/search.ts` | Scope = `listUserGroups(userId)` (current, non-deleted groups), computed server-side; the group filter can only narrow it. Every query has `group_id IN (scope)`. `LIKE %q% ESCAPE` with `\ % _` escaped; min 2 chars, max 100; 20 results per type; 60 searches/min per user. Both roles read everything in their groups, so no per-type role filter |
| Types | pets, tasks, events, medical, medications, products, orders | Filters: type, pet/group, status (open = open task / upcoming or recurring event / active plan / order in progress), responsible person (tasks, events, plans), date range (due/start/record/order date). A filter drops types it can't apply to |
| Page | `/search` (GET form in `<search>`, header link) | Filters live in the URL. The result summary is an `<h2>` that receives focus on load (a live region isn't announced after a full page load) |

Known limit: recurring events match on their first date only for the date filter.

## Deferred (later phases / decisions needed)
Per-group storage quota for uploads (only a per-user upload rate limit today) · `<bdi>` isolation of mixed Hebrew/English user text · progressive "add dose time" control (6 fixed time inputs today) · Email verification (email-bound invites only prove the typed address) · removing a member does not revoke reusable links they hold (UI warns) · `TRUST_PROXY=1` needed behind a proxy for per-IP rate limits · Google/Apple sign-in (Apple needs a paid developer account) · real email delivery (provider not chosen; dev logs links) · 30-day purge job and account deletion · CSP header · persistent rate limiting.
