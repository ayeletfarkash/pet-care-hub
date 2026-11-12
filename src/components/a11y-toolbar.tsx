"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { saveA11yAction } from "@/app/actions/preferences";
import type { A11yPrefs } from "@/server/services/users";
import { fmt, type Dict } from "@/i18n";
import { Button } from "./ui/buttons";

const SCALES = [100, 112, 125, 150, 175, 200];
const DEFAULTS: A11yPrefs = { textScale: 100, contrast: "default", underlineLinks: false, highlightFocus: false, reduceMotion: false };

/** Mirror of the server-side html classes in the root layout. */
export function applyA11y(p: A11yPrefs) {
  const html = document.documentElement;
  html.style.fontSize = `${p.textScale}%`;
  html.classList.toggle("contrast-high", p.contrast === "high");
  html.classList.toggle("underline-links", p.underlineLinks);
  html.classList.toggle("focus-strong", p.highlightFocus);
  html.classList.toggle("reduce-motion", p.reduceMotion);
}

/**
 * Accessibility toolbar (PRD §19): a disclosure panel, not a modal, so the page stays usable.
 * Changes apply instantly and persist per user account (or per device for visitors).
 */
export function A11yToolbar({ t, initial, perAccount }: { t: Dict; initial: A11yPrefs; perAccount: boolean }) {
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState(initial);
  const [, startTransition] = useTransition();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const a = t.a11y;

  useEffect(() => applyA11y(prefs), [prefs]);

  const update = (next: Partial<A11yPrefs>) => {
    const merged = { ...prefs, ...next };
    setPrefs(merged);
    startTransition(() => saveA11yAction(merged));
  };
  const close = () => { setOpen(false); toggleRef.current?.focus(); };
  const idx = SCALES.indexOf(prefs.textScale);

  const switches: [keyof A11yPrefs, string, boolean][] = [
    ["contrast", a.highContrast, prefs.contrast === "high"],
    ["underlineLinks", a.underlineLinks, prefs.underlineLinks],
    ["highlightFocus", a.highlightFocus, prefs.highlightFocus],
    ["reduceMotion", a.reduceMotion, prefs.reduceMotion],
  ];

  return (
    // Close when focus leaves the toolbar, so the panel never covers the focused element (WCAG 2.4.11).
    // Only when focus lands on another element: a null target (Safari clicks, removed focus) keeps it open.
    <div className="relative" onBlur={(e) => {
      const next = e.relatedTarget as Node | null;
      if (next && !e.currentTarget.contains(next)) setOpen(false);
    }}>
      <button
        ref={toggleRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg border-2 border-line bg-surface px-3 font-semibold text-fg hover:bg-accent"
      >
        <span aria-hidden="true">♿</span>
        {a.open}
      </button>
      <section
        id={panelId}
        hidden={!open}
        aria-label={a.title}
        onKeyDown={(e) => e.key === "Escape" && close()}
        className="absolute end-0 z-20 mt-2 max-h-[85dvh] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border-2 border-line bg-surface p-4 text-fg shadow-xl max-sm:fixed max-sm:inset-x-4 max-sm:top-4 max-sm:mt-0 max-sm:w-auto"
      >
        <h2 className="mb-3 text-lg font-bold">{a.title}</h2>

        <fieldset className="mb-4">
          <legend className="font-semibold">{a.textSize}</legend>
          <div className="mt-2 flex items-center gap-2">
            {/* Accessible name starts with the visible "A−"/"A+" (WCAG 2.5.3 Label in Name). */}
            {/* aria-disabled (not disabled) at the limits so keyboard focus isn't dropped. */}
            <Button variant="secondary" aria-label={`A− ${a.decrease}`} aria-disabled={idx <= 0 || undefined}
              onClick={() => idx > 0 && update({ textScale: SCALES[idx - 1] })}>A−</Button>
            <Button variant="secondary" aria-label={`A+ ${a.increase}`} aria-disabled={idx >= SCALES.length - 1 || undefined}
              onClick={() => idx < SCALES.length - 1 && update({ textScale: SCALES[idx + 1] })}>A+</Button>
            <Button variant="ghost" onClick={() => update({ textScale: 100 })}>{a.resetText}</Button>
          </div>
          <p className="mt-1 text-sm text-muted" aria-live="polite">{fmt(a.current, { n: prefs.textScale })}</p>
        </fieldset>

        <ul className="mb-4 space-y-2">
          {switches.map(([key, label, checked]) => (
            <li key={key}>
              <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-lg px-1">
                <span>{label}</span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={checked}
                  onChange={(e) => update(key === "contrast" ? { contrast: e.target.checked ? "high" : "default" } : { [key]: e.target.checked })}
                  className="size-6 accent-primary"
                />
              </label>
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => update(DEFAULTS)}>{a.resetAll}</Button>
          <Link href="/accessibility" className="underline" onClick={() => setOpen(false)}>{a.statement}</Link>
        </div>
        <p className="mt-3 text-sm text-muted">{perAccount ? a.savedAccount : a.savedDevice}</p>
        <Button variant="ghost" className="mt-2 w-full" onClick={close}>{a.close}</Button>
      </section>
    </div>
  );
}
