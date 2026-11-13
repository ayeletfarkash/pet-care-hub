"use client";

const ID = "app-live-region";

/**
 * One persistent polite live region for the whole app. Status messages from controls that disappear
 * after acting (e.g. "Mark as given" once the dose is recorded) are announced here (WCAG 4.1.3).
 */
export function LiveRegion() {
  return <div id={ID} role="status" aria-live="polite" className="sr-only" />;
}

export function announce(message: string) {
  const el = document.getElementById(ID);
  if (!el) return;
  el.textContent = "";
  setTimeout(() => { el.textContent = message; }, 50); // clear first so a repeated message is re-announced
}
