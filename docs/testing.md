# Testing

## Layers
| Layer | Tool | Location | Covers |
|---|---|---|---|
| Schedule maths | Vitest | `src/server/schedule.test.ts` | dose expansion (daily/weekdays/interval), recurrences, DST, month-end, Feb 29, Israel "now", stock estimate (days left, run-out date, reorder) |
| Service / integration | Vitest + real SQLite | `src/server/services/*.test.ts` | Phase 3: inventory/order/routine permissions, cross-group ids, stock never below 0 and rounded, delivered order restocks once, routine log validation (invented/future/too old, missed → completed, extras), end-not-delete, responsibility release. Phase 2: every permission-matrix rule for medical/medications/events/tasks, cross-group ids, fabricated/duplicate/concurrent doses, recurring-task idempotency, transfer approval, cleanup on removal. Phase 1: auth, roles, last-admin rule (incl. concurrent demotion), cross-group isolation, invitations (single-use race, reusable, revoked, expired, email-bound, deleted group), soft delete/restore window, photo type sniffing |
| E2E: sign-in | Playwright | `e2e/auth.spec.ts` | password reset through a fake SMTP server, Google sign-up/login/linking with Google faked (`e2e/fake-google.mjs` replaces its token endpoint in the E2E server only), forged and cancelled callbacks |
| E2E | Playwright | `e2e/phase1.spec.ts`, `e2e/phase2.spec.ts`, `e2e/phase3.spec.ts` | Phase 1 acceptance flow across two users, RTL/LTR, per-user language and accessibility prefs, keyboard-only flows, validation announcements |
| Accessibility (automated) | axe-core via Playwright | `e2e/helpers.ts` → `expectNoA11yViolations` | WCAG 2.0/2.1/2.2 A+AA rules on every page, he + en, high contrast, open dialog |

## Running
```bash
npm test             # ~10 s
npm run test:e2e     # ~3 min: wipes data/e2e, builds, starts on :3100
```
E2E uses the **Microsoft Edge** already installed on Windows (`channel: msedge`). Elsewhere (e.g. CI): `npx playwright install chromium` and run with `PW_CHANNEL=chromium`.
Stop any running `next dev` first: both use `.next/`.

## Proportional policy (from CLAUDE.md)
Small change → the related test file only (`npx vitest run -t "<name>"`, `npx playwright test -g "<name>"`). New module → service tests for every permission rule + one E2E flow + axe scan of new pages.

## Manual accessibility checks (not automatable, still open)
- [ ] NVDA + Chrome/Edge (Hebrew and English): register, create pet, members table, dialogs, toolbar
- [ ] VoiceOver iOS / TalkBack Android on a real phone
- [ ] 200% / 400% zoom and reflow at 320 px width
- [ ] Windows High Contrast (forced colors) mode
Update the accessibility statement (`src/content/accessibility-statement.ts`) when these are done.
