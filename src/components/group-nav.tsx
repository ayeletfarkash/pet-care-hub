"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Section navigation inside a pet's group, shown as a bar fixed to the bottom of the viewport.
 * Rendered after the page content so focus order matches the visual order. Scrolls sideways on narrow screens.
 */
export function GroupNav({ groupId, label, items }: { groupId: string; label: string; items: { href: string; label: string; also?: string[] }[] }) {
  const path = usePathname();
  const ref = useRef<HTMLUListElement>(null);
  const base = `/groups/${groupId}`;
  const isCurrent = (it: (typeof items)[number]) =>
    it.href === "" ? path === base || !!it.also?.some((a) => path.startsWith(`${base}${a}`)) : [it.href, ...(it.also ?? [])].some((h) => path.startsWith(`${base}${h}`));

  // Keep the current section visible when the bar overflows (e.g. "Orders" on a phone).
  useEffect(() => {
    ref.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [path]);

  return (
    <nav aria-label={label} data-bottom-bar className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-divider bg-surface print:hidden">
      {/* center-safe: falls back to start alignment when items overflow, so the first item stays scrollable */}
      <ul ref={ref} className="mx-auto flex max-w-5xl justify-center-safe overflow-x-auto">
        {items.map((it) => (
          <li key={it.href} className="shrink-0">
            <Link
              href={`${base}${it.href}`}
              aria-current={isCurrent(it) ? "page" : undefined}
              className="-mt-0.5 inline-flex min-h-12 items-center border-t-4 border-transparent px-3 font-semibold text-fg no-underline hover:border-line aria-[current=page]:border-primary aria-[current=page]:text-link"
            >
              {it.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
