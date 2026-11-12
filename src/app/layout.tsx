import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { getCurrentUser } from "@/server/auth/session";
import { getRequestA11y } from "@/server/a11y-cookie";
import { dirOf } from "@/i18n";
import { getT } from "@/i18n/server";
import { A11yToolbar } from "@/components/a11y-toolbar";
import { LanguageSwitch } from "@/components/language-switch";
import { NavLink } from "@/components/nav-link";
import { logoutAction } from "./actions/auth";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: { default: t.app.name, template: `%s · ${t.app.name}` }, description: t.app.tagline };
}
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#9a3412" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [{ t, locale }, user, { prefs, perAccount }] = await Promise.all([getT(), getCurrentUser(), getRequestA11y()]);
  // Applied server-side so preferences hold on first paint, with no flash.
  const htmlClass = [
    prefs.contrast === "high" && "contrast-high",
    prefs.underlineLinks && "underline-links",
    prefs.highlightFocus && "focus-strong",
    prefs.reduceMotion && "reduce-motion",
  ].filter(Boolean).join(" ");

  return (
    <html lang={locale} dir={dirOf(locale)} className={htmlClass} style={{ fontSize: `${prefs.textScale}%` }}>
      <body className="flex min-h-dvh flex-col">
        <a
          href="#main"
          className="sr-only z-50 rounded-lg bg-primary px-4 py-3 font-semibold text-on-primary focus:not-sr-only focus:fixed focus:start-3 focus:top-3"
        >
          {t.nav.skip}
        </a>
        <header className="border-b-2 border-divider bg-surface">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
            <Link href="/" className="flex items-center gap-2 text-xl font-bold text-fg no-underline hover:no-underline">
              <span aria-hidden="true">🐾</span>
              {t.app.name}
            </Link>
            <nav aria-label={t.nav.main}>
              <ul className="flex flex-wrap items-center gap-2">
                {user ? (
                  <>
                    <li><NavLink href="/">{t.nav.dashboard}</NavLink></li>
                    <li><NavLink href="/profile">{t.nav.profile}</NavLink></li>
                    <li>
                      <form action={logoutAction}>
                        <button type="submit" className="inline-flex min-h-11 items-center px-2 font-semibold text-link hover:underline">{t.nav.logout}</button>
                      </form>
                    </li>
                  </>
                ) : (
                  <>
                    <li><NavLink href="/login">{t.nav.login}</NavLink></li>
                    <li><NavLink href="/register">{t.nav.register}</NavLink></li>
                  </>
                )}
                <li><LanguageSwitch t={t} locale={locale} /></li>
                <li><A11yToolbar t={t} initial={prefs} perAccount={perAccount} /></li>
              </ul>
            </nav>
          </div>
        </header>
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
          {children}
        </main>
        <footer className="border-t-2 border-divider bg-surface">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4 text-sm">
            <span>© {t.footer.rights}</span>
            <Link href="/accessibility" className="inline-block py-2 underline">{t.footer.statement}</Link>
          </div>
        </footer>
      </body>
    </html>
  );
}
