"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Header nav link that marks the current page for assistive tech and visually. */
export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const current = usePathname() === href;
  return (
    <Link href={href} aria-current={current ? "page" : undefined}
      className="inline-flex min-h-11 items-center px-2 font-semibold aria-[current=page]:underline aria-[current=page]:decoration-2">
      {children}
    </Link>
  );
}
