import Link from "next/link";
import type { Insight } from "@/server/services/insights";
import type { Locale } from "@/server/db/schema";
import { fmt, formatDate, formatLocalDateTime, type Dict } from "@/i18n";

/** One insight: a counted headline plus the first few items as links (text, not charts: PRD §18.7). */
export function InsightCard({ t, locale, insight, headingLevel = 3, limit = Infinity }: { t: Dict; locale: Locale; insight: Insight; headingLevel?: 3 | 4; limit?: number }) {
  const k = t.insights, H = `h${headingLevel}` as const;
  const id = `ins-${insight.groupId}-${insight.kind}`;
  const hint = k.kindHints[insight.kind as keyof typeof k.kindHints];
  const when = (at?: string | null) => !at ? null : at.length > 10 ? formatLocalDateTime(locale, at) : formatDate(locale, at);
  return (
    <section aria-labelledby={id} className="card rounded-xl border-2 border-divider bg-surface p-4">
      <H id={id} className="font-bold">{fmt(k.kinds[insight.kind], { count: insight.items.length })}</H>
      {hint && <p className="text-sm text-muted">{hint}</p>}
      <ul className="mt-2 space-y-1">
        {insight.items.slice(0, limit).map((i) => (
          <li key={i.id}>
            <Link href={i.href}>{i.title}</Link>
            {when(i.at) && <span className="text-sm text-muted"><span aria-hidden="true"> · </span><span className="ltr-value">{when(i.at)}</span></span>}
          </li>
        ))}
      </ul>
      {insight.items.length > limit && <p className="mt-1 text-sm text-muted">{fmt(k.more, { n: insight.items.length - limit })}</p>}
    </section>
  );
}
