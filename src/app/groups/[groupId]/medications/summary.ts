import { fmt, formatList, type Dict } from "@/i18n";
import type { Locale } from "@/server/db/schema";

type PlanLike = { scheduleType: "daily" | "weekdays" | "interval"; times: string[]; weekdays: number[]; intervalDays: number | null };

/** "Every day at 08:00 and 20:00" / "Sunday and Wednesday at 08:00" / "Every 3 days at 09:00". */
export function planSummary(t: Dict, locale: Locale, p: PlanLike) {
  const times = formatList(locale, p.times);
  if (p.scheduleType === "weekdays") return fmt(t.meds.summaryWeekdays, { days: formatList(locale, p.weekdays.map((d) => t.weekdays.long[d])), times });
  if (p.scheduleType === "interval") return fmt(t.meds.summaryInterval, { n: p.intervalDays ?? 1, times });
  return fmt(t.meds.summaryDaily, { times });
}
