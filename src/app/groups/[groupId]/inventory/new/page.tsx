import { listPlans } from "@/server/services/medications";
import { getT } from "@/i18n/server";
import { BackLink } from "@/components/back-link";
import { InventoryItemForm } from "@/components/forms/care-forms";
import { createItemAction } from "@/app/actions/inventory";
import { loadGroup } from "../../load";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.inventory.createTitle };
}

export default async function NewItemPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const [{ user }, { t }] = await Promise.all([loadGroup(groupId), getT()]);
  const { plans } = await listPlans(user.id, groupId);
  return (
    <div className="mx-auto max-w-3xl">
      <BackLink href={`/groups/${groupId}/inventory`} label={t.inventory.title} />
      <h1 className="mb-6 text-3xl font-bold">{t.inventory.createTitle}</h1>
      <InventoryItemForm t={t} action={createItemAction} hidden={{ groupId }} plans={plans.map((p) => ({ value: p.id, label: p.name }))} submitLabel={t.common.save} />
    </div>
  );
}
