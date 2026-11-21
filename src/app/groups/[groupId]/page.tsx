import { fmt, formatDate, formatNumber, type Dict } from "@/i18n";
import { getT } from "@/i18n/server";
import { Notice } from "@/components/notice";
import { SpeciesIcon } from "@/components/species-icon";
import { ProfileTabs } from "@/components/profile-tabs";
import { LinkButton } from "@/components/ui/buttons";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ActionForm } from "@/components/forms/action-form";
import { TextField } from "@/components/ui/fields";
import { deleteGroupAction, leaveGroupAction } from "@/app/actions/groups";
import { loadGroup } from "./load";

export async function generateMetadata({ params }: { params: Promise<{ groupId: string }> }) {
  const { pet } = await loadGroup((await params).groupId);
  return { title: pet.name };
}

function yearsSince(iso: string) {
  const b = new Date(`${iso}T00:00:00Z`), now = new Date();
  let y = now.getUTCFullYear() - b.getUTCFullYear();
  if (now.getUTCMonth() < b.getUTCMonth() || (now.getUTCMonth() === b.getUTCMonth() && now.getUTCDate() < b.getUTCDate())) y--;
  return Math.max(0, y);
}

function Details({ t, rows }: { t: Dict; rows: [string, React.ReactNode][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[minmax(8rem,auto)_1fr]">
      {rows.map(([k, val]) => (
        <div key={k} className="contents">
          <dt className="font-semibold text-muted">{k}</dt>
          <dd>{val ?? <span className="text-muted">{t.common.notProvided}</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

export default async function GroupPage({
  params, searchParams,
}: { params: Promise<{ groupId: string }>; searchParams: Promise<{ notice?: string }> }) {
  const { groupId } = await params;
  const [{ pet, role }, { t, locale }, sp] = await Promise.all([loadGroup(groupId), getT(), searchParams]);
  const p = t.pet;
  const isAdmin = role === "admin";
  const ltr = (s: string | null) => (s ? <span className="ltr-value">{s}</span> : null);
  const age = pet.birthDate
    ? fmt(p.ageYears, { n: yearsSince(pet.birthDate) })
    : pet.estimatedAgeYears != null ? fmt(p.ageEstimated, { n: formatNumber(locale, pet.estimatedAgeYears) }) : null;

  return (
    <>
      <ProfileTabs t={t} groupId={groupId} pet={pet.name} current="profile" />
      <Notice t={t} notice={sp.notice} />
      <div className="mb-8 flex flex-wrap items-center gap-5">
        {pet.photoFile ? (
          // eslint-disable-next-line @next/next/no-img-element -- auth-protected route
          <img src={`/groups/${groupId}/photo`} alt={fmt(p.photoAlt, { pet: pet.name })} className="size-24 rounded-full object-cover" />
        ) : (
          <SpeciesIcon species={pet.species} size="lg" />
        )}
        <div className="flex-1">
          <h1 className="text-3xl font-bold">{pet.name}</h1>
          <p className="text-muted">
            {pet.species === "other" && pet.speciesOther ? pet.speciesOther : t.species[pet.species]}
            {pet.breed ? ` · ${pet.breed}` : ""}
          </p>
          <p className="mt-1 text-sm font-semibold">{fmt(t.group.yourRole, { role: t.roles[role] })}</p>
        </div>
        {isAdmin && <LinkButton href={`/groups/${groupId}/edit`}>{p.edit}</LinkButton>}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="basic-h" className="card rounded-xl border-2 border-divider bg-surface p-5 lg:col-span-2">
          <h2 id="basic-h" className="mb-4 text-xl font-bold">{p.basic}</h2>
          <Details t={t} rows={[
            [p.sex, t.sex[pet.sex]],
            [p.birthDate, pet.birthDate ? formatDate(locale, pet.birthDate) : null],
            [p.age, age],
            [p.weight, pet.weightKg != null ? fmt(p.weightValue, { n: formatNumber(locale, pet.weightKg) }) : null],
            [p.color, pet.color],
            [p.marks, pet.identifyingMarks],
          ]} />
        </section>
        <section aria-labelledby="vet-h" className="card rounded-xl border-2 border-divider bg-surface p-5">
          <h2 id="vet-h" className="mb-4 text-xl font-bold">{p.vet}</h2>
          <Details t={t} rows={[
            [p.vetName, pet.vetName],
            [p.vetClinic, pet.vetClinic],
            [p.vetPhone, pet.vetPhone ? <a href={`tel:${pet.vetPhone.replace(/[^\d+]/g, "")}`} className="ltr-value underline">{pet.vetPhone}</a> : null],
            [p.vetAddress, pet.vetAddress],
          ]} />
        </section>
        <section aria-labelledby="ins-h" className="card rounded-xl border-2 border-divider bg-surface p-5">
          <h2 id="ins-h" className="mb-4 text-xl font-bold">{p.insurance}</h2>
          <Details t={t} rows={[
            [p.insuranceProvider, pet.insuranceProvider],
            [p.insurancePolicy, ltr(pet.insurancePolicyNumber)],
            [p.insuranceExpiry, pet.insuranceExpiry ? formatDate(locale, pet.insuranceExpiry) : null],
            [p.insuranceContact, pet.insuranceContact],
          ]} />
        </section>
      </div>

      <section aria-labelledby="danger-h" className="mt-10 border-t-2 border-divider pt-6">
        <h2 id="danger-h" className="mb-3 text-xl font-bold">{t.group.danger}</h2>
        <div className="flex flex-wrap gap-3">
          <ConfirmDialog triggerLabel={t.group.leave} triggerVariant="secondary" cancelLabel={t.common.cancel}
            title={fmt(t.group.leaveTitle, { pet: pet.name })} body={t.group.leaveBody}>
            <ActionForm action={leaveGroupAction} fields={{ groupId }} label={t.group.leave} pendingLabel={t.common.saving} variant="danger" />
          </ConfirmDialog>
          {isAdmin && (
            <ConfirmDialog triggerLabel={t.group.delete} cancelLabel={t.common.cancel}
              title={fmt(t.group.deleteTitle, { pet: pet.name })} body={t.group.deleteBody}>
              <ActionForm action={deleteGroupAction} fields={{ groupId }} label={t.group.delete} pendingLabel={t.common.saving} variant="danger">
                <TextField name="confirmName" label={t.group.deleteConfirmLabel} hint={pet.name} required requiredLabel={t.common.required} />
              </ActionForm>
            </ConfirmDialog>
          )}
        </div>
      </section>
    </>
  );
}
