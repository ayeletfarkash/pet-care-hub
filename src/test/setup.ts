import { mkdirSync } from "node:fs";
import { beforeAll } from "vitest";

// One throwaway SQLite file per test file, set before the db module is imported.
mkdirSync("./data/test", { recursive: true });
process.env.DATABASE_URL = `file:./data/test/${process.pid}-${crypto.randomUUID()}.db`;
process.env.UPLOAD_DIR = "./data/test/uploads";

beforeAll(async () => {
  const { runMigrations } = await import("../server/db/migrate");
  await runMigrations();
});
