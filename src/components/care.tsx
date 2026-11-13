import Link from "next/link";
import { fmt, formatLocalDateTime, formatLocalTime, formatNumber, type Dict } from "@/i18n";
import type { Locale } from "@/server/db/schema";
import type { Dose } from "@/server/services/medications";
import type { Activity } from "@/server/services/routines";
import { markDoseAction } from "@/app/actions/medications";
import { logActivityAction } from "@/app/actions/routines";
import { ActionForm } from "./forms/action-form";

type Tone = "neutral" | "success" | "danger" | "info";
const tones: Record<Tone, string> = {
  neutral: "border-line text-fg",
  success: "border-success text-success",
  danger: "border-danger text-danger",
  info: "border-line bg-accent text-fg",
};
const icons: Record<Tone, string> = { neutral: "•", success: "✓", danger: "!", info: "⏰" };

/** Status pill: always text + icon, never colour alone (WCAG 1.4.1). */
export function Badge({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 text-sm font-semibold ${tones[tone]}`}>
      <span aria-hidden="true">{icons[tone]}</span>
      {children}
    </span>
  );
}

export const taskTone = { new: "info", in_progress: "info", completed: "success", cancelled: "neutral" } as const satisfies Record<string, Tone>;
export const doseTone: Record<Dose["status"], Tone> = { given: "success", missed: "danger", due: "info", upcoming: "neutral" };

/** One scheduled dose with its status and, when relevant, a "Mark as given" button. */
export function DoseItem({ t, locale, dose, showDate, petName }: { t: Dict; locale: Locale; dose: Dose; showDate?: boolean; petName?: string }) {
  const m = t.meds;
  const when = showDate ? formatLocalDateTime(locale, dose.scheduledFor) : formatLocalTime(locale, dose.scheduledFor);
  return (
    <li className="card flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-divider bg-surface p-3">
      <div className="min-w-0">
        <p className="font-bold">
          <span className="ltr-value">{when}</span> · {dose.name}
          {petName && <span className="font-normal text-muted"> · {petName}</span>}
        </p>
        <p className="text-sm">{dose.dosage}</p>
        <p className="mt-1"><Badge tone={doseTone[dose.status]}>{m.status[dose.status]}</Badge></p>
        {dose.given && (
          <p className="mt-1 text-sm text-muted">
            {fmt(m.givenBy, { time: formatLocalTime(locale, dose.given.at), name: dose.given.byName ?? t.ui.formerMember })}
          </p>
        )}
      </div>
      {dose.status !== "given" && dose.status !== "upcoming" && (
        <ActionForm action={markDoseAction} fields={{ groupId: dose.groupId, planId: dose.planId, scheduledFor: dose.scheduledFor }}
          label={m.markGiven} ariaLabel={fmt(m.markGivenLabel, { name: dose.name, time: when }) + (petName ? `, ${petName}` : "")} pendingLabel={t.common.saving} variant="primary" />
      )}
    </li>
  );
}

export function SectionHeader({ id, title, action, as: H = "h2" }: { id: string; title: string; action?: { href: string; label: string }; as?: "h1" | "h2" }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <H id={id} className={H === "h1" ? "text-3xl font-bold" : "text-2xl font-bold"}>{title}</H>
      {action && (
        <Link href={action.href} className="inline-flex min-h-11 items-center gap-2 rounded-lg border-2 border-primary bg-primary px-4 font-semibold text-on-primary no-underline hover:bg-primary-hover hover:no-underline">
          <span aria-hidden="true">＋</span>{action.label}
        </Link>
      )}
    </div>
  );
}

export const Empty = ({ children }: { children: React.ReactNode }) => (
  <p className="rounded-xl border-2 border-dashed border-line bg-surface p-5">{children}</p>
);

// ─────────── Phase 3 ───────────
/** "2.5 kg" in the user's number format. */
/** Prices are stored in shekels (PRD §9.5: no other currencies). */
export const priceText = (locale: Locale, n: number) => new Intl.NumberFormat(locale === "he" ? "he-IL" : "en-IL", { style: "currency", currency: "ILS" }).format(n);
export const qtyText = (locale: Locale, q: number, unit: string | null) => `${formatNumber(locale, q)}${unit ? ` ${unit}` : ""}`;

export function StockBadge({ t, item }: { t: Dict; item: { depleted: boolean; needsReorder: boolean } }) {
  const k = t.inventory;
  return item.depleted ? <Badge tone="danger">{k.depleted}</Badge> : item.needsReorder ? <Badge tone="danger">{k.reorder}</Badge> : <Badge tone="success">{k.ok}</Badge>;
}

export const activityTone: Record<Activity["status"], Tone> = { completed: "success", missed: "danger", not_logged: "danger", due: "info", upcoming: "neutral" };

/** One scheduled routine activity with its status and "done" / "missed" buttons while it can be logged. */
export function ActivityItem({ t, locale, a, showDate, petName }: { t: Dict; locale: Locale; a: Activity; showDate?: boolean; petName?: string }) {
  const r = t.routines;
  const when = showDate ? formatLocalDateTime(locale, a.scheduledFor) : formatLocalTime(locale, a.scheduledFor);
  const fields = { groupId: a.groupId, routineId: a.routineId, scheduledFor: a.scheduledFor };
  const ctx = petName ? `, ${petName}` : "";
  return (
    <li className="card flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-divider bg-surface p-3">
      <div className="min-w-0">
        <p className="font-bold">
          <span className="ltr-value">{when}</span> · {a.name}
          {petName && <span className="font-normal text-muted"> · {petName}</span>}
        </p>
        <p className="mt-1"><Badge tone={activityTone[a.status]}>{r.status[a.status]}</Badge></p>
        {a.log && <p className="mt-1 text-sm text-muted">{fmt(r.loggedBy, { name: a.log.byName ?? t.ui.formerMember, time: formatLocalDateTime(locale, a.log.at) })}</p>}
      </div>
      {a.status !== "completed" && a.status !== "upcoming" && (
        <div className="flex flex-wrap gap-2">
          <ActionForm action={logActivityAction} fields={{ ...fields, status: "completed" }} label={r.markDone}
            ariaLabel={fmt(r.markDoneLabel, { name: a.name, time: when }) + ctx} pendingLabel={t.common.saving} variant="primary" />
          {a.status !== "missed" && (
            <ActionForm action={logActivityAction} fields={{ ...fields, status: "missed" }} label={r.markMissed}
              ariaLabel={fmt(r.markMissedLabel, { name: a.name, time: when }) + ctx} pendingLabel={t.common.saving} variant="secondary" />
          )}
        </div>
      )}
    </li>
  );
}
export const orderTone = { ordered: "info", processing: "info", shipped: "info", delivered: "success", cancelled: "neutral" } as const satisfies Record<string, Tone>;
