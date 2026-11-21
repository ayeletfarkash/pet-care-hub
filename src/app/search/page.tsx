import Link from "next/link";
import { requireUser } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import { resultHref, SEARCH_LIMIT, searchAll, searchFilterOptions, type SearchResult } from "@/server/services/search";
import { SEARCH_MIN_CHARS, SEARCH_TYPES, searchSchema } from "@/server/validation";
import { fmt, formatDate, formatLocalDateTime, type Dict } from "@/i18n";
import { getT } from "@/i18n/server";
import { Badge } from "@/components/care";
import { SelectField, TextField } from "@/components/ui/fields";
import { Button, LinkButton } from "@/components/ui/buttons";
import { FocusOnLoad } from "@/components/focus-on-load";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.search.title };
}

/** A message with the user's query isolated for bidi (Hebrew UI, English query or vice versa). */
const withQuery = (template: string, q: string, vars: Record<string, string | number> = {}) => {
  const [before, after] = fmt(template, vars).split("{q}");
  return <>{before}<bdi>{q}</bdi>{after}</>;
};

function statusLabel(t: Dict, r: SearchResult) {
  if (!r.status) return null;
  if (r.type === "tasks") return t.tasks.statuses[r.status as keyof Dict["tasks"]["statuses"]];
  if (r.type === "orders") return t.orders.statuses[r.status as keyof Dict["orders"]["statuses"]];
  if (r.type === "medications") return r.status === "active" ? t.search.active : t.search.ended;
  return null;
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const raw = Object.fromEntries(Object.entries(await searchParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const f = searchSchema.parse(raw);
  const [{ t, locale }, options, found] = await Promise.all([
    getT(), searchFilterOptions(user.id),
    searchAll(user.id, f).catch((e) => { if (e instanceof AppError && e.code === "rate_limited") return { results: [], more: [] as string[], limited: true }; throw e; }),
  ]);
  const k = t.search, searched = f.q !== "";
  const petName = new Map(options.groups.map((g) => [g.id, g.name]));
  const byType = SEARCH_TYPES.map((type) => ({ type, items: found.results.filter((r) => r.type === type) })).filter((g) => g.items.length);
  const when = (r: SearchResult) => !r.date ? null : r.date.length > 10 ? formatLocalDateTime(locale, r.date) : formatDate(locale, r.date);

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-3xl font-bold">{k.title}</h1>
      <p className="mb-6 mt-1 text-muted">{k.intro}</p>

      <search>
        <form method="get" action="/search" className="card mb-6 rounded-xl border-2 border-divider bg-surface p-5">
          <TextField name="q" type="search" label={k.query} hint={k.queryHint} defaultValue={f.q} />
          <fieldset>
            <legend className="mb-2 font-bold">{k.filters}</legend>
            <div className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
              <SelectField name="type" label={k.type} defaultValue={f.type ?? ""}
                options={[{ value: "", label: k.anyType }, ...SEARCH_TYPES.map((x) => ({ value: x, label: k.types[x] }))]} />
              <SelectField name="group" label={k.group} defaultValue={f.group ?? ""}
                options={[{ value: "", label: k.anyGroup }, ...options.groups.map((g) => ({ value: g.id, label: g.name }))]} />
              <SelectField name="status" label={k.status} defaultValue={f.status ?? ""}
                options={[{ value: "", label: k.anyStatus }, { value: "open", label: k.open }, { value: "closed", label: k.closed }]} />
              <SelectField name="assignee" label={k.assignee} defaultValue={f.assignee ?? ""}
                options={[{ value: "", label: k.anyone }, ...options.people.map((p) => ({ value: p.id, label: p.name }))]} />
              <TextField name="from" type="date" label={k.from} defaultValue={f.from ?? ""} />
              <TextField name="to" type="date" label={k.to} defaultValue={f.to ?? ""} />
            </div>
          </fieldset>
          <div className="flex flex-wrap gap-3">
            <Button type="submit">{k.submit}</Button>
            <LinkButton variant="ghost" href="/search">{k.clear}</LinkButton>
          </div>
        </form>
      </search>

      {searched && (
        <>
          {/* A GET search reloads the page, so a live region isn't announced: focus the outcome instead. */}
          <h2 id="search-summary" tabIndex={-1} className="mb-4 text-xl font-bold">
            <span className="sr-only">{k.results}: </span>
            {"limited" in found ? t.errors.rate_limited
              : f.q.length < SEARCH_MIN_CHARS ? k.tooShort
              : found.results.length === 0 ? withQuery(k.none, f.q)
              : withQuery(k.count, f.q, { count: found.results.length })}
          </h2>
          <FocusOnLoad id="search-summary" />
        </>
      )}

      {byType.map(({ type, items }) => (
        <section key={type} aria-labelledby={`res-${type}`} className="mb-6">
          <h3 id={`res-${type}`} className="mb-2 text-lg font-bold">{k.types[type]} <span className="text-base font-normal text-muted">({items.length})</span></h3>
          <ul className="space-y-2">
            {items.map((r) => {
              const status = statusLabel(t, r), date = when(r);
              return (
                <li key={r.id} className="card rounded-xl border-2 border-divider bg-surface p-3">
                  <Link href={resultHref(r)} className="font-semibold" aria-describedby={`meta-${r.id}`}>{r.title}</Link>
                  <span id={`meta-${r.id}`} className="text-sm text-muted">
                    {r.type !== "pets" && <><span aria-hidden="true"> · </span>{petName.get(r.groupId)}</>}
                    {date && <><span aria-hidden="true"> · </span><span className="ltr-value">{date}</span></>}
                  </span>
                  {status && <> <Badge>{status}</Badge></>}
                </li>
              );
            })}
          </ul>
          {found.more.includes(type) && <p className="mt-2 text-sm text-muted">{fmt(k.more, { n: SEARCH_LIMIT })}</p>}
        </section>
      ))}
    </div>
  );
}
