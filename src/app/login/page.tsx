import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { LoginForm } from "@/components/forms/auth-forms";
import { InviteContext } from "@/components/invite-context";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.auth.loginTitle };
}

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  const { t } = await getT();
  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-6 text-3xl font-bold">{t.auth.loginTitle}</h1>
      <InviteContext t={t} />
      <div className="card rounded-xl border-2 border-divider bg-surface p-6">
        <LoginForm t={t} />
      </div>
      <p className="mt-4">
        {t.auth.noAccount} <Link href="/register" className="underline">{t.nav.register}</Link>
      </p>
      <p className="mt-2 text-sm text-muted">{t.auth.otherMethods}</p>
    </div>
  );
}
