import { defineConfig } from "@playwright/test";

const PORT = 3100;
// Isolated DB + uploads for E2E; wiped on every run by e2e/server.mjs.
const env = { DATABASE_URL: "file:./data/e2e/app.db", UPLOAD_DIR: "./data/e2e/uploads", NEXT_TELEMETRY_DISABLED: "1", REGISTER_RATE_LIMIT: "200",
  // Fixed dummy keys (override .env.local) so the push section renders the same everywhere; tests never subscribe.
  VAPID_PUBLIC_KEY: "e2e-dummy-public-key", VAPID_PRIVATE_KEY: "e2e-dummy-private-key", DISABLE_JOBS: "1",
  INVITE_LINK_SECRET: "e2e-invite-link-secret",
  // Fake SMTP server in auth.spec.ts; Google's token endpoint is faked by e2e/fake-google.mjs.
  APP_URL: `http://localhost:${PORT}`, SMTP_URL: "smtp://app%40example.test:x@127.0.0.1:3125",
  GOOGLE_CLIENT_ID: "e2e-client", GOOGLE_CLIENT_SECRET: "e2e-secret" };

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Uses the Edge already installed on Windows instead of downloading Playwright's Chromium.
    // Override with PW_CHANNEL=chromium after `npx playwright install chromium` (e.g. in CI).
    channel: process.env.PW_CHANNEL ?? "msedge",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `node e2e/server.mjs ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    timeout: 180_000,
    reuseExistingServer: false,
    env,
  },
});
