import { fmt } from "@/i18n";
import { getT } from "@/i18n/server";
import { GroupNav } from "@/components/group-nav";
import { loadGroup } from "./load";

export default async function GroupLayout({ children, params }: { children: React.ReactNode; params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const [{ pet }, { t }] = await Promise.all([loadGroup(groupId), getT()]); // 404s for non-members
  const n = t.groupNav;
  return (
    <>
      <GroupNav
        groupId={groupId}
        label={fmt(n.label, { pet: pet.name })}
        items={[
          { href: "", label: n.profile },
          { href: "/medical", label: n.medical },
          { href: "/medications", label: n.medications },
          { href: "/calendar", label: n.calendar, also: "/events" },
          { href: "/tasks", label: n.tasks },
          { href: "/routines", label: n.routines },
          { href: "/inventory", label: n.inventory },
          { href: "/orders", label: n.orders },
          { href: "/members", label: n.members },
        ]}
      />
      {children}
    </>
  );
}
