import Link from "next/link";
import { fmt, type Dict } from "@/i18n";

/** Tabs of a pet's Profile section. Each tab is its own page, so these are links with aria-current, not an ARIA tablist. */
export function ProfileTabs({ t, groupId, pet, current }: { t: Dict; groupId: string; pet: string; current: "profile" | "members" }) {
  const n = t.groupNav;
  const tabs = [
    { key: "profile", href: `/groups/${groupId}`, label: n.petProfile },
    { key: "members", href: `/groups/${groupId}/members`, label: n.groupMembers },
  ] as const;
  return (
    <nav aria-label={fmt(n.profileTabs, { pet })} className="mb-6 border-b-2 border-divider">
      <ul className="flex flex-wrap gap-x-1">
        {tabs.map((tab) => (
          <li key={tab.key}>
            <Link
              href={tab.href}
              aria-current={current === tab.key ? "page" : undefined}
              className="-mb-0.5 inline-flex min-h-11 items-center border-b-4 border-transparent px-3 font-semibold text-fg no-underline hover:border-line aria-[current=page]:border-primary aria-[current=page]:text-link"
            >
              {tab.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
