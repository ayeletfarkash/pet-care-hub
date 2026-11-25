import type { ReminderSource } from "@/server/db/schema";
import { CATEGORY_OF, getNotificationPrefs, getReminderRule } from "@/server/services/notifications";
import { listMembers } from "@/server/services/members";
import type { Dict } from "@/i18n";
import { ReminderRuleForm } from "./forms/notification-forms";

/** "Reminders" card on a task/event/plan/routine page. */
export async function ReminderSection({ t, userId, groupId, sourceType, sourceId }: { t: Dict; userId: string; groupId: string; sourceType: ReminderSource; sourceId: string }) {
  const [rule, members, prefs] = await Promise.all([getReminderRule(userId, groupId, sourceType, sourceId), listMembers(userId, groupId), getNotificationPrefs(userId)]);
  const k = t.notifications.rule;
  return (
    <section aria-labelledby="reminders-h" className="card mb-8 rounded-xl border-2 border-divider bg-surface p-5">
      <h2 id="reminders-h" className="mb-3 text-xl font-bold">{k.title}</h2>
      <ReminderRuleForm t={t} hidden={{ groupId, sourceType, sourceId }} members={members.map((m) => ({ userId: m.userId, name: m.name }))}
        initial={{ leadMinutes: rule.leadMinutes, remindAt: rule.remindAt, recipientMode: rule.recipientMode, recipients: rule.recipients }}
        prefsOff={!prefs[CATEGORY_OF[sourceType]]} />
    </section>
  );
}
