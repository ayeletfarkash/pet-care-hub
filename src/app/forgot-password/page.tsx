import Link from "next/link";
import { getT } from "@/i18n/server";
import { ForgotPasswordForm } from "@/components/forms/auth-forms";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.auth.forgotTitle };
}

export default async function ForgotPasswordPage() {
  const { t } = await getT();
  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-6 text-3xl font-bold">{t.auth.forgotTitle}</h1>
      <div className="card rounded-xl border-2 border-divider bg-surface p-6">
        <p className="mb-4">{t.auth.forgotIntro}</p>
        <ForgotPasswordForm t={t} />
      </div>
      <p className="mt-4"><Link href="/login" className="underline">{t.auth.backToLogin}</Link></p>
    </div>
  );
}
