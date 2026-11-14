import type { ReminderSource } from "@/server/db/schema";
import { getReminderRule } from "@/server/services/notifications";
import { listMembers } from "@/server/services/members";
import { fmt, type Dict } from "@/i18n";
import { ReminderRuleForm } from "./forms/notification-forms";

/** "Reminders" card on a task/event/plan/routine page. Read-only for members who can't set them. */
export async function ReminderSection({ t, userId, groupId, sourceType, sourceId }: { t: Dict; userId: string; groupId: string; sourceType: ReminderSource; sourceId: string }) {
  const [rule, members] = await Promise.all([getReminderRule(userId, groupId, sourceType, sourceId), listMembers(userId, groupId)]);
  const k = t.notifications.rule;
  const lead = k.leads[String(rule.leadMinutes) as keyof typeof k.leads] ?? k.leads["0"];
  const who = rule.recipientMode === "selected"
    ? members.filter((m) => rule.recipients.includes(m.userId)).map((m) => m.name).join(", ") || k.whoShort.selected
    : k.whoShort[rule.recipientMode];
  return (
    <section aria-labelledby="reminders-h" className="card mb-8 rounded-xl border-2 border-divider bg-surface p-5">
      <h2 id="reminders-h" className="mb-3 text-xl font-bold">{k.title}</h2>
      {rule.canEdit ? (
        <ReminderRuleForm t={t} hidden={{ groupId, sourceType, sourceId }} members={members.map((m) => ({ userId: m.userId, name: m.name }))}
          initial={{ leadMinutes: rule.leadMinutes, recipientMode: rule.recipientMode, recipients: rule.recipients }} />
      ) : (
        <p>{fmt(k.readOnly, { lead, who })}</p>
      )}
    </section>
  );
}
