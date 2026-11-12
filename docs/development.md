# Development

## Requirements
Node.js 24+ (tested on 26), npm 11. Windows, macOS or Linux. No external services.

## Setup
```bash
npm install
npm run db:migrate      # creates data/app.db
npm run dev             # http://localhost:3000
```
Optional overrides: copy `.env.example` to `.env.local`. Local data (`data/`: database + uploaded photos) is git-ignored.

npm 11 blocks dependency install scripts by default. esbuild's postinstall is blocked and **not needed** (its prebuilt binary is installed as an optional dependency). Leave it blocked.

## Environment variables
| Variable | Default | Notes |
|---|---|---|
| `DATABASE_URL` | `file:./data/app.db` | libsql URL |
| `UPLOAD_DIR` | `./data/uploads` | pet photos; must not be inside `public/` |
| `APP_URL` | from request Host header | **set in production**; used in invitation links |
| `ACCESSIBILITY_CONTACT_EMAIL` | empty | shown on the accessibility statement |

## Scripts
| Script | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run typecheck` / `lint` | tsc / eslint |
| `npm test` | Vitest service tests (temporary DB per file) |
| `npm run test:e2e` | Playwright: fresh DB, production build, Edge (see [testing.md](testing.md)) |
| `npm run db:generate` | create a migration after editing `src/server/db/schema.ts` |
| `npm run db:migrate` | apply migrations |

## Conventions
- New group-scoped feature: service function `(userId, groupId, …)` that starts with `requireMembership`, and writes only inside `writeTx`.
- Server Actions: `handleForm(fd, zodSchema, fn)`; throw `AppError(code)`; the code is also the i18n key under `errors.*`.
- UI text: add keys to `src/i18n/en.ts`, then `he.ts` (typecheck fails if missing).
- Use logical CSS (`ms-/me-/ps-/pe-/start/end`), never `left/right`, for RTL.
- Form fields: use `components/ui/fields.tsx` (labels, hints, errors, aria wiring). Give an `id` when a field name repeats on a page.
- Invitation emails: development only logs the link (`src/server/mailer.ts`). Production sends nothing until a provider is plugged in.
