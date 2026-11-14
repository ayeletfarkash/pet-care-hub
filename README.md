# Pet Care Hub

A shared web app for coordinating a pet's care between family members, partners, pet sitters and other caregivers. Each pet has its own care group, and everyone in it sees the same medications, appointments, tasks, inventory and routines. The app works in Hebrew (right-to-left) and English, and accessibility (WCAG 2.2 AA) is a release requirement.

> Built as a course project for an AI development course, with [Claude Code](https://claude.com/claude-code). The full product spec is in [PRD.md](PRD.md).

## Features

| Area | What you can do |
|---|---|
| Groups and roles | Create a group per pet, invite people by link or email, Admin and Caregiver roles, leave or remove members, delete and restore a group within 30 days |
| Pet profile | Species, breed, weight, photo, vet and insurance details |
| Medical | Medical history with documents, medication plans with computed doses, "mark as given" with a full administration history |
| Calendar and tasks | Appointments and recurring events, tasks with assignees, comments, handover requests and recurring tasks |
| Inventory and orders | Stock levels with estimated days left, purchase and use history, orders that restock on delivery |
| Routines | Walks, feeding and other activities, logged as completed or missed |
| Notifications | A reminders inbox, personal preferences per category, a choice of who gets each reminder and how early, snooze, and optional phone push notifications (installable PWA) |
| Automatic tasks | A reorder task when stock runs low, and optional preparation and follow-up tasks for appointments, never created twice |
| Search and insights | Search across all your groups with filters, plus rule-based insights (overdue tasks, low stock, missed activities and more) on an "At a glance" dashboard |
| Accessibility | Built-in accessibility toolbar (text size, high contrast, link underlines, focus highlight, reduced motion), an accessibility statement page, and keyboard and screen-reader support |

Roadmap: Phases 1–4 of the [PRD](PRD.md) are implemented. Phase 5 (future expansion) is not started.

## Tech stack

Next.js 16 (App Router, Server Actions) · React 19 · TypeScript · SQLite via libsql and Drizzle ORM · Tailwind CSS 4 · zod · Vitest · Playwright with axe-core. Authentication and translations are built in, with no paid services.

## Getting started

Requirements: Node.js 24 or later and npm 11.

```bash
npm install
npm run db:migrate   # creates data/app.db
npm run dev          # http://localhost:3000
```

Optional settings go in `.env.local`. Copy [.env.example](.env.example) and see [docs/development.md](docs/development.md) for every variable. Phone push notifications need VAPID keys, which you can generate with `npx web-push generate-vapid-keys`. Without them, reminders still appear in the in-app inbox.

## Tests

```bash
npm test           # service and unit tests (Vitest, real SQLite)
npm run test:e2e   # end-to-end and automated accessibility checks (Playwright + axe)
```

The E2E tests use Microsoft Edge by default. To use Chromium instead, run `npx playwright install chromium` and set `PW_CHANNEL=chromium`. Details are in [docs/testing.md](docs/testing.md).

## Documentation

- [PRD.md](PRD.md): product requirements
- [docs/architecture.md](docs/architecture.md): technical decisions per phase
- [docs/development.md](docs/development.md): setup, environment variables and conventions
- [docs/testing.md](docs/testing.md): test layers and manual accessibility checks

## Limitations

- SQLite with an in-process job timer: run one server process. Hosting several instances needs Postgres and an external scheduler.
- Invitation emails are only logged during development until an email provider is chosen.
