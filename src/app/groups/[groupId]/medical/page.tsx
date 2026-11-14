import Link from "next/link";
import { listMedicalRecords } from "@/server/services/medical";
import { fmt, formatDate } from "@/i18n";
import { getT } from "@/i18n/server";
import { Notice } from "@/components/notice";
import { Badge, Empty, SectionHeader } from "@/components/care";
import { loadGroup } from "../load";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.medical.title };
}

export default async function MedicalPage({ params, searchParams }: { params: Promise<{ groupId: string }>; searchParams: Promise<{ notice?: string }> }) {
  const { groupId } = await params;
  const [{ user, pet }, { t, locale }, sp] = await Promise.all([loadGroup(groupId), getT(), searchParams]);
  const records = await listMedicalRecords(user.id, groupId);
  const m = t.medical;
  return (
    <>
      <Notice t={t} notice={sp.notice} />
      <SectionHeader as="h1" id="medical-h" title={m.title} action={{ href: `/groups/${groupId}/medical/new`, label: m.add }} />
      <p className="mb-6 text-muted">{fmt(m.intro, { pet: pet.name })}</p>
      {records.length === 0 ? <Empty>{m.empty}</Empty> : (
        <ol className="space-y-3" aria-labelledby="medical-h">
          {records.map((r) => (
            <li key={r.id} className="card rounded-xl border-2 border-divider bg-surface p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-bold">
                  <Link href={`/groups/${groupId}/medical/${r.id}`} aria-label={fmt(m.viewRecord, { title: r.title })} className="text-fg">{r.title}</Link>
                </h2>
                <time dateTime={r.date} className="text-sm text-muted">{formatDate(locale, r.date)}</time>
              </div>
              <p className="mt-1 flex flex-wrap gap-2">
                <Badge>{m.types[r.type]}</Badge>
                {r.attachments.length > 0 && <Badge tone="info">{m.documents}: {r.attachments.length}</Badge>}
              </p>
              {r.provider && <p className="mt-1 text-sm">{m.provider}: {r.provider}</p>}
              {r.description && <p className="mt-1 line-clamp-2">{r.description}</p>}
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
