import { defineConfig } from "@playwright/test";

const PORT = 3100;
// Isolated DB + uploads for E2E; wiped on every run by e2e/server.mjs.
const env = { DATABASE_URL: "file:./data/e2e/app.db", UPLOAD_DIR: "./data/e2e/uploads", NEXT_TELEMETRY_DISABLED: "1" };

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
