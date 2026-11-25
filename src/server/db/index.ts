import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import * as schema from "./schema";

const url = process.env.DATABASE_URL ?? "file:./data/app.db";
if (url.startsWith("file:")) mkdirSync(dirname(url.slice(5)), { recursive: true });

// Reuse one client across dev hot reloads.
const g = globalThis as unknown as { __pchClient?: ReturnType<typeof createClient> };
const client = g.__pchClient ?? createClient({ url, timeout: 5000 });
if (process.env.NODE_ENV !== "production") g.__pchClient = client;

export const db = drizzle(client, { schema });
export type DB = typeof db;
// Transactions on local libsql open with BEGIN IMMEDIATE (write lock up front), which the
// last-member and invite-consume checks rely on.
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export type Executor = DB | Tx;
export { client };

// Local libsql runs SQLite synchronously on the Node thread: if a second connection waits for the
// write lock, it blocks the event loop and the lock holder can never finish (deadlock until
// busy timeout). So every write goes through one in-process queue. Reads stay concurrent (WAL).
// shortcut: single-process only; with >1 server process move to Postgres (SELECT ... FOR UPDATE).
let writeChain: Promise<unknown> = Promise.resolve();
let writes = 0;
/** Number of committed write transactions in this process (lets the reminder sweep skip when nothing changed). */
export const writeCount = () => writes;
export function writeTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const run = writeChain.then(() => db.transaction(fn)).then((r) => { writes++; return r; });
  writeChain = run.catch(() => {});
  return run;
}
