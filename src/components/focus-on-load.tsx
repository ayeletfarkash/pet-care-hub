"use client";

import { useEffect } from "react";

/** Moves focus to an element after a full page load (e.g. GET search results), so screen readers land on the outcome. */
export function FocusOnLoad({ id }: { id: string }) {
  useEffect(() => { document.getElementById(id)?.focus(); }, [id]);
  return null;
}
