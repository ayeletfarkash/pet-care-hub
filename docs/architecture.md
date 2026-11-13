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

## Deferred (later phases / decisions needed)
Per-group storage quota for uploads (only a per-user upload rate limit today) · `<bdi>` isolation of mixed Hebrew/English user text · progressive "add dose time" control (6 fixed time inputs today) · Email verification (email-bound invites only prove the typed address) · removing a member does not revoke reusable links they hold (UI warns) · `TRUST_PROXY=1` needed behind a proxy for per-IP rate limits · Google/Apple sign-in (Apple needs a paid developer account) · real email delivery (provider not chosen; dev logs links) · 30-day purge job and account deletion · notification preferences (Phase 4) · CSP header · persistent rate limiting.
