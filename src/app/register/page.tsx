import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { RegisterForm } from "@/components/forms/auth-forms";
import { GoogleButton } from "@/components/google-button";
import { InviteContext } from "@/components/invite-context";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.auth.registerTitle };
}

export default async function RegisterPage() {
  if (await getCurrentUser()) redirect("/");
  const { t, locale } = await getT();
  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-6 text-3xl font-bold">{t.auth.registerTitle}</h1>
      <InviteContext t={t} />
      <div className="card rounded-xl border-2 border-divider bg-surface p-6">
        <RegisterForm t={t} locale={locale} />
        <GoogleButton t={t} />
      </div>
      <p className="mt-4">
        {t.auth.haveAccount} <Link href="/login" className="underline">{t.nav.login}</Link>
      </p>
    </div>
  );
}
