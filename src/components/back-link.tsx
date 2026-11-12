import Link from "next/link";

/** "Back" link whose arrow points toward the reading start in both RTL and LTR. */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <p className="mb-2">
      <Link href={href} className="inline-flex min-h-11 items-center gap-1 underline">
        <span aria-hidden="true" className="inline-block rtl:rotate-180">←</span>
        {label}
      </Link>
    </p>
  );
}
