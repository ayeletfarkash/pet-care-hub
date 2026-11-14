import { requireUser } from "@/server/auth/session";
import { listUserGroups } from "@/server/services/groups";
import { INSIGHT_CATEGORIES, insightsFor, type InsightCategory } from "@/server/services/insights";
import { getT } from "@/i18n/server";
import { SelectField } from "@/components/ui/fields";
import { Button, LinkButton } from "@/components/ui/buttons";
import { InsightCard } from "@/components/insight-list";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.insights.title };
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function InsightsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const category = (INSIGHT_CATEGORIES as readonly string[]).includes(one(sp.category)) ? (one(sp.category) as InsightCategory) : undefined;
  const group = one(sp.group).slice(0, 64) || undefined; // only narrows the user's own groups (see insightsFor)
  const [{ t, locale }, groups, insights] = await Promise.all([getT(), listUserGroups(user.id), insightsFor(user.id, { group, category })]);
  const k = t.insights;
  const shown = groups.filter((g) => insights.some((i) => i.groupId === g.groupId));

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-3xl font-bold">{k.title}</h1>
      <p className="mb-6 mt-1 text-muted">{k.intro}</p>
      <form method="get" action="/insights" className="card mb-6 flex flex-wrap items-end gap-x-4 rounded-xl border-2 border-divider bg-surface p-5">
        <fieldset className="contents">
        <legend className="sr-only">{k.filters}</legend>
        <SelectField name="group" label={k.group} defaultValue={group ?? ""} className="mb-4 min-w-48"
          options={[{ value: "", label: k.anyGroup }, ...groups.map((g) => ({ value: g.groupId, label: g.petName }))]} />
        <SelectField name="category" label={k.category} defaultValue={category ?? ""} className="mb-4 min-w-48"
          options={[{ value: "", label: k.anyCategory }, ...INSIGHT_CATEGORIES.map((c) => ({ value: c, label: k.categories[c] }))]} />
        </fieldset>
        <Button type="submit" className="mb-4">{k.submit}</Button>
      </form>

      {shown.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-line bg-surface p-6">
          <p>{group || category ? k.emptyFiltered : k.empty}</p>
          {(group || category) && <LinkButton variant="secondary" href="/insights" className="mt-3">{k.clear}</LinkButton>}
        </div>
      ) : shown.map((g) => (
        <section key={g.groupId} aria-labelledby={`pet-${g.groupId}`} className="mb-8">
          <h2 id={`pet-${g.groupId}`} className="mb-3 text-2xl font-bold">{g.petName}</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {insights.filter((i) => i.groupId === g.groupId).map((i) => <InsightCard key={i.kind} t={t} locale={locale} insight={i} />)}
          </div>
        </section>
      ))}
    </div>
  );
}
