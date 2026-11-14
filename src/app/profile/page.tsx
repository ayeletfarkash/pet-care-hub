import { requireUser } from "@/server/auth/session";
import { getNotificationPrefs } from "@/server/services/notifications";
import { getT } from "@/i18n/server";
import { ProfileForm } from "@/components/forms/profile-form";
import { NotificationPrefsForm, PushSettings } from "@/components/forms/notification-forms";
import { vapidPublicKey } from "@/server/services/push";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.profile.title };
}

export default async function ProfilePage() {
  const user = await requireUser();
  const [{ t }, prefs] = await Promise.all([getT(), getNotificationPrefs(user.id)]);
  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-6 text-3xl font-bold">{t.profile.title}</h1>
      <div className="card rounded-xl border-2 border-divider bg-surface p-6">
        <ProfileForm t={t} name={user.name} email={user.email} locale={user.locale} />
      </div>
      <section aria-labelledby="notif-prefs-h" className="card mt-6 rounded-xl border-2 border-divider bg-surface p-6">
        <h2 id="notif-prefs-h" className="mb-2 text-xl font-bold">{t.notifications.prefsTitle}</h2>
        <p className="mb-4 text-sm text-muted">{t.profile.notificationsNote}</p>
        <NotificationPrefsForm t={t} enabled={Object.entries(prefs).filter(([, on]) => on).map(([c]) => c)} />
      </section>
      <section aria-labelledby="push-h" className="card mt-6 rounded-xl border-2 border-divider bg-surface p-6">
        <h2 id="push-h" className="mb-2 text-xl font-bold">{t.notifications.push.title}</h2>
        <PushSettings t={t} publicKey={vapidPublicKey()} />
      </section>
    </div>
  );
}
