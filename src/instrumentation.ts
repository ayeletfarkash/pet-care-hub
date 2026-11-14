// Starts the background reminder sweep once per server process (PRD §21.5).
// shortcut: in-process timer, single server only; serverless/multi-instance hosting needs an external cron.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.DISABLE_JOBS === "1") return;
  const g = globalThis as unknown as { __pchJobs?: boolean };
  if (g.__pchJobs) return; // dev hot reload re-runs this file
  g.__pchJobs = true;
  const { runSweep } = await import("./server/services/reminders");
  const tick = () => runSweep().catch((e) => console.error("reminder sweep failed", e));
  setInterval(tick, 60_000).unref();
  void tick();
}
