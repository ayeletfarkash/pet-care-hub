"use client";

import { useActionState, useRef, useState } from "react";
import type { FormState } from "@/app/actions/form";
import { SPECIES, SEXES } from "@/server/db/schema";
import type { Dict } from "@/i18n";
import { SelectField, TextField } from "../ui/fields";
import { SubmitButton } from "../ui/buttons";
import { FormStatus } from "../ui/form-status";

type PetValues = Partial<Record<string, string | number | null>>;

export function PetForm({
  t, action, initial = {}, groupId, submitLabel,
}: {
  t: Dict;
  action: (s: FormState, fd: FormData) => Promise<FormState>;
  initial?: PetValues;
  groupId?: string;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, {} as FormState);
  const ref = useRef<HTMLFormElement>(null);
  const v: PetValues = state.values ?? initial;
  const e = state.fieldErrors ?? {};
  const [species, setSpecies] = useState(String(v.species ?? ""));
  const p = t.pet, req = t.common.required;
  const f = (name: string) => ({ name, defaultValue: v[name] ?? "", error: e[name] });
  // Saved age is fractional years; after a failed submit the raw years/months come back instead.
  const savedMonths = !state.values && initial.estimatedAgeYears != null ? Math.round(Number(initial.estimatedAgeYears) * 12) : null;
  const ageYears = savedMonths != null ? String(Math.floor(savedMonths / 12)) : String(v.estimatedAgeYears ?? "");
  const ageMonths = savedMonths != null ? String(savedMonths % 12) : String(v.estimatedAgeMonths ?? "0");

  return (
    <form ref={ref} action={formAction} noValidate>
      <FormStatus state={state} formRef={ref} />
      {groupId && <input type="hidden" name="groupId" value={groupId} />}
      <p className="mb-4 text-sm text-muted">{t.common.requiredLegend}</p>

      <fieldset className="card mb-6 rounded-xl border-2 border-divider bg-surface p-5">
        <legend className="px-1 text-xl font-bold">{p.basic}</legend>
        <TextField {...f("name")} label={p.name} required requiredLabel={req} />
        <div className="grid gap-x-4 sm:grid-cols-2">
          <div onChange={(ev) => setSpecies((ev.target as unknown as HTMLSelectElement).value)}>
            <SelectField {...f("species")} label={p.species} required requiredLabel={req}
              options={[{ value: "", label: t.common.choose }, ...SPECIES.map((s) => ({ value: s, label: t.species[s] }))]} />
          </div>
          {species === "other" && <TextField {...f("speciesOther")} label={p.speciesOther} required requiredLabel={req} />}
          <TextField {...f("breed")} label={p.breed} />
          <SelectField {...f("sex")} defaultValue={v.sex ?? "unknown"} label={p.sex}
            options={SEXES.map((s) => ({ value: s, label: t.sex[s] }))} />
          <TextField {...f("birthDate")} type="date" label={p.birthDate} hint={p.birthDateHint} className="mb-4 sm:col-span-2" />
          <fieldset className="mb-4 sm:col-span-2">
            <legend className="mb-1 font-semibold">{p.estimatedAge}</legend>
            <div className="grid grid-cols-2 gap-x-4">
              <TextField {...f("estimatedAgeYears")} defaultValue={ageYears} type="number" step="1" min="0" max="100" inputMode="numeric" label={p.ageYearsLabel} />
              <SelectField {...f("estimatedAgeMonths")} defaultValue={ageMonths} label={p.ageMonthsLabel}
                options={Array.from({ length: 12 }, (_, m) => ({ value: String(m), label: String(m) }))} />
            </div>
          </fieldset>
          <TextField {...f("weightKg")} type="number" step="0.01" min="0" inputMode="decimal" label={p.weight} />
          <TextField {...f("color")} label={p.color} />
        </div>
      </fieldset>

      <fieldset className="card mb-6 rounded-xl border-2 border-divider bg-surface p-5">
        <legend className="px-1 text-xl font-bold">{p.vet} <span className="text-base font-normal text-muted">({t.common.optional})</span></legend>
        <div className="grid gap-x-4 sm:grid-cols-2">
          <TextField {...f("vetName")} label={p.vetName} />
          <TextField {...f("vetClinic")} label={p.vetClinic} />
          <TextField {...f("vetPhone")} type="tel" dir="ltr" autoComplete="off" inputMode="tel" label={p.vetPhone} />
          <TextField {...f("vetAddress")} label={p.vetAddress} />
        </div>
      </fieldset>

      <fieldset className="card mb-6 rounded-xl border-2 border-divider bg-surface p-5">
        <legend className="px-1 text-xl font-bold">{p.insurance} <span className="text-base font-normal text-muted">({t.common.optional})</span></legend>
        <div className="grid gap-x-4 sm:grid-cols-2">
          <TextField {...f("insuranceProvider")} label={p.insuranceProvider} />
          <TextField {...f("insurancePolicyNumber")} dir="ltr" label={p.insurancePolicy} />
          <TextField {...f("insuranceExpiry")} type="date" label={p.insuranceExpiry} />
          <TextField {...f("insuranceContact")} label={p.insuranceContact} />
        </div>
      </fieldset>

      <SubmitButton pendingLabel={t.common.saving}>{submitLabel}</SubmitButton>
    </form>
  );
}
