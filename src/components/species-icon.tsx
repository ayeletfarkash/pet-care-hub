import type { Species } from "@/server/db/schema";

// Species-specific visual (PRD §17.2). Decorative only: the species is always also given in text.
const ICONS: Record<Species, string> = {
  dog: "🐕", cat: "🐈", bird: "🦜", rabbit: "🐇", reptile: "🦎", fish: "🐠", rodent: "🐹", horse: "🐎", other: "🐾",
};
const TINTS: Record<Species, string> = {
  dog: "#fde7cf", cat: "#e9e1f7", bird: "#dff3e4", rabbit: "#fbe3ea", reptile: "#e3f0d6",
  fish: "#dceefa", rodent: "#f6ead8", horse: "#efe4d8", other: "#ece7e1",
};

export function SpeciesIcon({ species, size = "md" }: { species: Species; size?: "md" | "lg" }) {
  const dim = size === "lg" ? "size-24 text-5xl" : "size-14 text-3xl";
  return (
    <span aria-hidden="true" className={`inline-flex shrink-0 items-center justify-center rounded-full ${dim}`} style={{ background: TINTS[species] }}>
      {ICONS[species]}
    </span>
  );
}
