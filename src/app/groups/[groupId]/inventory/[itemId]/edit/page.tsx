import { notFound } from "next/navigation";
import { getItem } from "@/server/services/inventory";
import { listPlans } from "@/server/services/medications";
import { getT } from "@/i18n/server";
import { BackLink } from "@/components/back-link";
import { InventoryItemForm } from "@/components/forms/care-forms";
import { updateItemAction } from "@/app/actions/inventory";
import { loadGroup } from "../../../load";

export default async function EditItemPage({ params }: { params: Promise<{ groupId: string; itemId: string }> }) {
  const { groupId, itemId } = await params;
  const [{ user, role }, { t }] = await Promise.all([loadGroup(groupId), getT()]);
  if (role !== "admin") notFound();
  const [{ item }, { plans }] = await Promise.all([getItem(user.id, groupId, itemId).catch(() => notFound()), listPlans(user.id, groupId)]);
  return (
    <div className="mx-auto max-w-3xl">
      <BackLink href={`/groups/${groupId}/inventory/${itemId}`} label={item.name} />
      <h1 className="mb-6 text-3xl font-bold">{t.inventory.editTitle}</h1>
      <InventoryItemForm t={t} action={updateItemAction} hidden={{ groupId, itemId }} initial={item}
        plans={plans.map((p) => ({ value: p.id, label: p.name }))} submitLabel={t.common.save} />
    </div>
  );
}
