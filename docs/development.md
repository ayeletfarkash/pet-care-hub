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
| `APP_URL` | `http://localhost:3000` (invitation links: request Host header) | **set in production**; used in invitation and password reset links and the Google redirect URI |
| `SMTP_URL` | empty | sends password reset emails, e.g. `smtps://you%40gmail.com:app-password@smtp.gmail.com`. Empty: dev logs the link to the console, production disables reset. Secret |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | empty | "Continue with Google"; the button is hidden until both are set. Secret |
| `ACCESSIBILITY_CONTACT_EMAIL` | empty | shown on the accessibility statement |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | empty | Web Push keys (`npx web-push generate-vapid-keys`); without them push is off and the inbox is the only channel. Private key is a secret |
| `VAPID_SUBJECT` | `mailto:admin@localhost` | contact sent to push services; set a real `mailto:` in production |
| `INVITE_LINK_SECRET` | dev-only fallback | **required in production**; encrypts stored invitation tokens so members can copy/share active links. Changing it makes existing links un-shareable (they still work) |
| `DISABLE_JOBS` | empty | `1` stops the in-process reminder timer |

## Password reset emails (Gmail)
1. Turn on 2-Step Verification on the sending Google account, then create an app password at <https://myaccount.google.com/apppasswords>.
2. In `.env.local`: `SMTP_URL=smtps://you%40gmail.com:apppassword@smtp.gmail.com` (`@` in the address is `%40`; app password without spaces). Restart the server.

## Google sign-in
1. <https://console.cloud.google.com/> → create a project → APIs & Services → OAuth consent screen: External, app name, your email. Scopes: none beyond the default `openid email profile`. Publish it, or add yourself as a test user.
2. Credentials → Create credentials → OAuth client ID → Web application. Authorized redirect URI: `http://localhost:3000/auth/google/callback` (add `https://<your domain>/auth/google/callback` for production; it must match `APP_URL`).
3. Put the client ID and secret in `.env.local` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Restart the server. Open the app through the same address as `APP_URL` (`localhost`, not `127.0.0.1`).

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
