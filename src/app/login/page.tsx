import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { LoginForm } from "@/components/forms/auth-forms";
import { GoogleButton } from "@/components/google-button";
import { InviteContext } from "@/components/invite-context";
import { Notice } from "@/components/notice";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.auth.loginTitle };
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ notice?: string; reason?: string }> }) {
  if (await getCurrentUser()) redirect("/");
  const [{ t }, sp] = await Promise.all([getT(), searchParams]);
  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-6 text-3xl font-bold">{t.auth.loginTitle}</h1>
      <Notice t={t} notice={sp.notice} reason={sp.reason} />
      <InviteContext t={t} />
      <div className="card rounded-xl border-2 border-divider bg-surface p-6">
        <LoginForm t={t} />
        <p className="mt-2"><Link href="/forgot-password" className="inline-block py-2 underline">{t.auth.forgot}</Link></p>
        <GoogleButton t={t} />
      </div>
      <p className="mt-4">
        {t.auth.noAccount} <Link href="/register" className="underline">{t.nav.register}</Link>
      </p>
    </div>
  );
}
