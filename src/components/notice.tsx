import { fmt, type Dict } from "@/i18n";

/** Success/info banner after a redirect (?notice=...). Only known keys render. */
export function Notice({ t, notice, reason }: { t: Dict; notice?: string; reason?: string }) {
  const messages: Record<string, string> = {
    saved: t.common.saved,
    joined: t.join.joined,
    left: t.group.left,
    group_deleted: t.group.deleted,
    group_restored: t.dashboard.restored,
    deleted: t.medical.deleted,
    join_failed: fmt(t.join.joinFailed, { reason: t.errors[reason as keyof Dict["errors"]] ?? t.errors.generic }),
  };
  const msg = notice ? messages[notice] : undefined;
  if (!msg) return null;
  const isError = notice === "join_failed";
  return (
    <div
      role={isError ? "alert" : "status"}
      className={`mb-6 rounded-lg border-2 p-3 font-semibold ${isError ? "border-danger bg-danger-bg text-danger" : "border-success bg-success-bg text-success"}`}
    >
      <span aria-hidden="true">{isError ? "⚠ " : "✓ "}</span>
      {msg}
    </div>
  );
}
