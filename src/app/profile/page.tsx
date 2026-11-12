import { requireUser } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { ProfileForm } from "@/components/forms/profile-form";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.profile.title };
}

export default async function ProfilePage() {
  const user = await requireUser();
  const { t } = await getT();
  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-6 text-3xl font-bold">{t.profile.title}</h1>
      <div className="card rounded-xl border-2 border-divider bg-surface p-6">
        <ProfileForm t={t} name={user.name} email={user.email} locale={user.locale} />
      </div>
      <p className="mt-4 text-sm text-muted">{t.profile.notificationsNote}</p>
    </div>
  );
}
