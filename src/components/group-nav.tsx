"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Section navigation inside a pet's group. Marks the current section with aria-current. */
export function GroupNav({ groupId, label, items }: { groupId: string; label: string; items: { href: string; label: string; also?: string }[] }) {
  const path = usePathname();
  const base = `/groups/${groupId}`;
  return (
    <nav aria-label={label} className="mb-6 border-b-2 border-divider">
      <ul className="flex flex-wrap gap-x-1">
        {items.map((it) => {
          const href = `${base}${it.href}`;
          const current = it.href === "" ? path === base || path === `${base}/edit` : path.startsWith(href) || (!!it.also && path.startsWith(`${base}${it.also}`));
          return (
            <li key={it.href}>
              <Link
                href={href}
                aria-current={current ? "page" : undefined}
                className="-mb-0.5 inline-flex min-h-11 items-center border-b-4 border-transparent px-3 font-semibold text-fg no-underline hover:border-line aria-[current=page]:border-primary aria-[current=page]:text-link"
              >
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
