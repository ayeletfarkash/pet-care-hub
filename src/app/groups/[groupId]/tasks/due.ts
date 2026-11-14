import { fmt, formatDate, formatLocalDateTime, type Dict } from "@/i18n";
import type { Locale } from "@/server/db/schema";

/** "Due 12 Nov 2026, 18:00", or date only when no time was set (stored as 23:59). */
export const dueText = (t: Dict, locale: Locale, dueAt: string | null) =>
  !dueAt ? t.tasks.noDue
  : fmt(t.tasks.due, { date: dueAt.endsWith("T23:59") ? formatDate(locale, dueAt.slice(0, 10)) : formatLocalDateTime(locale, dueAt) });
