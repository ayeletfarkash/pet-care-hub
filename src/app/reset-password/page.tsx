import { cookies } from "next/headers";
import { RESET_COOKIE } from "@/app/actions/auth-cookies";
import { isResetTokenValid } from "@/server/services/users";
import { getT } from "@/i18n/server";
import { ResetPasswordForm } from "@/components/forms/auth-forms";
import { LinkButton } from "@/components/ui/buttons";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.auth.resetTitle };
}

export default async function ResetPasswordPage() {
  const { t } = await getT();
  const token = (await cookies()).get(RESET_COOKIE.name)?.value;
  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-6 text-3xl font-bold">{t.auth.resetTitle}</h1>
      {token && (await isResetTokenValid(token)) ? (
        <div className="card rounded-xl border-2 border-divider bg-surface p-6">
          <p className="mb-4">{t.auth.resetIntro}</p>
          <ResetPasswordForm t={t} />
        </div>
      ) : (
        <>
          <p role="alert" className="mb-4 rounded-xl border-2 border-danger bg-danger-bg p-4 font-semibold text-danger">{t.errors.reset_invalid}</p>
          <LinkButton href="/forgot-password">{t.auth.requestNewLink}</LinkButton>
        </>
      )}
    </div>
  );
}
