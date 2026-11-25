// Fresh E2E database on each run, then a production build (dev-mode compile times cause flaky timeouts).
import { rmSync } from "node:fs";
import { execSync, spawn } from "node:child_process";

rmSync("./data/e2e", { recursive: true, force: true });
execSync("npx tsx src/server/db/migrate.ts", { stdio: "inherit" });
execSync("npx next build", { stdio: "inherit" });
const port = process.argv[2] ?? "3100";
const child = spawn("npx", ["next", "start", "-p", port], {
  stdio: "inherit", shell: true,
  env: { ...process.env, NODE_OPTIONS: "--import ./e2e/fake-google.mjs" },
});
process.on("SIGTERM", () => child.kill());
process.on("SIGINT", () => child.kill());
