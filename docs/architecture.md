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

## Deferred (later phases / decisions needed)
Email verification (email-bound invites only prove the typed address) · removing a member does not revoke reusable links they hold (UI warns) · `TRUST_PROXY=1` needed behind a proxy for per-IP rate limits · Google/Apple sign-in (Apple needs a paid developer account) · real email delivery (provider not chosen; dev logs links) · 30-day purge job and account deletion · notification preferences (Phase 4) · CSP header · persistent rate limiting.
