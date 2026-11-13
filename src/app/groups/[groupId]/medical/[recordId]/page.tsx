import { notFound } from "next/navigation";
import { getMedicalRecord } from "@/server/services/medical";
import { AppError } from "@/server/errors";
import { fmt, formatDate } from "@/i18n";
import { getT } from "@/i18n/server";
import { BackLink } from "@/components/back-link";
import { Notice } from "@/components/notice";
import { Badge } from "@/components/care";
import { LinkButton } from "@/components/ui/buttons";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ActionForm } from "@/components/forms/action-form";
import { DocumentsForm } from "@/components/forms/care-forms";
import { addDocumentsAction, deleteDocumentAction, deleteMedicalAction } from "@/app/actions/medical";
import { loadGroup } from "../../load";

async function load(userId: string, groupId: string, recordId: string) {
  try { return await getMedicalRecord(userId, groupId, recordId); } catch (e) { if (e instanceof AppError && e.code === "not_found") notFound(); throw e; }
}

export default async function MedicalRecordPage({ params, searchParams }: { params: Promise<{ groupId: string; recordId: string }>; searchParams: Promise<{ notice?: string }> }) {
  const { groupId, recordId } = await params;
  const [{ user }, { t, locale }, sp] = await Promise.all([loadGroup(groupId), getT(), searchParams]);
  const { record: r, attachments, role } = await load(user.id, groupId, recordId);
  const m = t.medical, isAdmin = role === "admin";
  const row = (label: string, value: string | null) => value && (
    <div className="contents"><dt className="font-semibold text-muted">{label}</dt><dd className="whitespace-pre-wrap">{value}</dd></div>
  );
  return (
    <div className="mx-auto max-w-3xl">
      <Notice t={t} notice={sp.notice} />
      <BackLink href={`/groups/${groupId}/medical`} label={m.title} />
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">{r.title}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2"><Badge>{m.types[r.type]}</Badge><time dateTime={r.date}>{formatDate(locale, r.date)}</time></p>
        </div>
        {isAdmin && <LinkButton variant="secondary" href={`/groups/${groupId}/medical/${recordId}/edit`}>{t.ui.edit}</LinkButton>}
      </div>
      <dl className="card mb-6 grid gap-x-6 gap-y-3 rounded-xl border-2 border-divider bg-surface p-5 sm:grid-cols-[minmax(8rem,auto)_1fr]">
        {row(m.provider, r.provider)}
        {row(m.description, r.description)}
        {row(m.details, r.details)}
        {row(t.ui.notes, r.notes)}
      </dl>

      <section aria-labelledby="docs-h" className="card mb-6 rounded-xl border-2 border-divider bg-surface p-5">
        <h2 id="docs-h" className="mb-3 text-xl font-bold">{m.documents}</h2>
        {attachments.length === 0 ? <p className="mb-4 text-muted">{m.noDocuments}</p> : (
          <ul className="mb-4 space-y-2">
            {attachments.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2">
                <a href={`/groups/${groupId}/attachments/${a.id}`} className="inline-flex min-h-11 items-center gap-2 underline" aria-label={fmt(m.download, { name: a.displayName })}>
                  <span aria-hidden="true">{a.mime === "application/pdf" ? "📄" : "🖼️"}</span>
                  <span className="ltr-value">{a.displayName}</span>
                  <span className="text-sm text-muted">({Math.ceil(a.size / 1024)} KB)</span>
                </a>
                {isAdmin && (
                  <ConfirmDialog triggerLabel={m.deleteDocument} triggerAriaLabel={`${m.deleteDocument}: ${a.displayName}`} cancelLabel={t.common.cancel}
                    title={fmt(m.deleteDocumentTitle, { name: a.displayName })} body={m.deleteDocumentBody}>
                    <ActionForm action={deleteDocumentAction} fields={{ groupId, attachmentId: a.id }} label={m.deleteDocument} pendingLabel={t.common.saving} variant="danger" />
                  </ConfirmDialog>
                )}
              </li>
            ))}
          </ul>
        )}
        <h3 className="mb-2 text-lg font-bold">{m.addDocuments}</h3>
        <DocumentsForm t={t} action={addDocumentsAction} hidden={{ groupId, recordId }} />
      </section>

      {isAdmin && (
        <ConfirmDialog triggerLabel={m.deleteRecord} cancelLabel={t.common.cancel} title={m.deleteTitle} body={m.deleteBody}>
          <ActionForm action={deleteMedicalAction} fields={{ groupId, recordId }} label={m.deleteRecord} pendingLabel={t.common.saving} variant="danger" />
        </ConfirmDialog>
      )}
    </div>
  );
}
