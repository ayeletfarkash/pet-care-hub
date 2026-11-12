import { migrate } from "drizzle-orm/libsql/migrator";
import { client, db } from "./index";

export async function runMigrations() {
  await client.execute("PRAGMA journal_mode = WAL"); // persistent per DB file
  await migrate(db, { migrationsFolder: "./drizzle" });
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("src/server/db/migrate.ts")) {
  runMigrations().then(() => console.log("Migrations applied"));
}
