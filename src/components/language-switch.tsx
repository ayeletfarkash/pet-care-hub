import { switchLocaleAction } from "@/app/actions/preferences";
import type { Dict } from "@/i18n";

export function LanguageSwitch({ t, locale }: { t: Dict; locale: "he" | "en" }) {
  const target = locale === "he" ? "en" : "he";
  return (
    <form action={switchLocaleAction}>
      <input type="hidden" name="locale" value={target} />
      <button
        type="submit"
        lang={target}
        title={t.nav.switchLanguageLabel}
        className="inline-flex min-h-11 items-center rounded-lg border-2 border-line px-3 font-semibold hover:bg-accent"
      >
        {t.nav.switchLanguage}
      </button>
    </form>
  );
}
