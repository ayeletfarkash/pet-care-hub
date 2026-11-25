import { existsSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { makeGroup, makeUser } from "../../test/factories";
import { resetRateLimits } from "../rate-limit";
import { addDays, todayLocal } from "../schedule";
import { eventSchema, medicalRecordSchema, medicationPlanSchema, taskSchema } from "../validation";
import { acceptInvitation, createInvitation } from "./invitations";
import { removeMember } from "./members";
import { addAttachments, createMedicalRecord, deleteMedicalRecord, getMedicalRecord, listMedicalRecords, readAttachment, updateMedicalRecord } from "./medical";
import { createPlan, deletePlan, endPlan, getPlan, groupDoses, recordAdministration } from "./medications";
import { createEvent, deleteEvent, groupOccurrences, setOccurrenceStatus, updateEvent } from "./events";
import { completeTask, createTask, decideTransfer, deleteTask, getTask, groupTasksDue, listTasks, reopenTask, requestTransfer, updateTask } from "./tasks";

const code = async (p: Promise<unknown>) => {
  try { await p; return "ok"; } catch (e) { return (e as { code?: string }).code ?? String(e); }
};
/** Admin + caregiver in one group, plus an outsider with their own group. */
async function setup() {
  const admin = await makeUser("Admin"), care = await makeUser("Care"), out = await makeUser("Out");
  const g = await makeGroup(admin.id), gOut = await makeGroup(out.id, "Other");
  const token = await createInvitation(admin.id, g, { role: "caregiver", reusable: false, email: null, expiresInDays: 7 });
  await acceptInvitation(care.id, token);
  return { admin: admin.id, care: care.id, out: out.id, g, gOut };
}
const today = () => todayLocal();
const PDF = new TextEncoder().encode("%PDF-1.4 test");
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);

beforeEach(() => resetRateLimits());

describe("medical history", () => {
  const rec = (o = {}) => medicalRecordSchema.parse({ type: "vaccination", date: today(), title: "Rabies", ...o });

  it("both roles add records; only admins edit or delete; outsiders see nothing", async () => {
    const s = await setup();
    const id = await createMedicalRecord(s.care, s.g, rec());
    expect((await listMedicalRecords(s.admin, s.g))[0].title).toBe("Rabies");
    expect(await code(updateMedicalRecord(s.care, s.g, id, rec({ title: "X" })))).toBe("forbidden");
    expect(await code(deleteMedicalRecord(s.care, s.g, id))).toBe("forbidden");
    expect(await code(listMedicalRecords(s.out, s.g))).toBe("not_found");
    expect(await code(getMedicalRecord(s.out, s.gOut, id))).toBe("not_found"); // id from another group
    await updateMedicalRecord(s.admin, s.g, id, rec({ title: "Rabies booster" }));
    expect((await getMedicalRecord(s.care, s.g, id)).record.title).toBe("Rabies booster");
  });

  it("rejects future dates", () => {
    expect(medicalRecordSchema.safeParse({ type: "other", date: addDays(today(), 1), title: "x" }).success).toBe(false);
  });

  it("attachments: PDF/images only, group-scoped download, files removed with the record", async () => {
    const s = await setup();
    const id = await createMedicalRecord(s.care, s.g, rec(), [{ name: "..\\..\\evil<script>.pdf", data: PDF }]);
    await addAttachments(s.care, s.g, id, [{ name: "xray.png", data: PNG }]);
    const { attachments } = await getMedicalRecord(s.admin, s.g, id);
    expect(attachments.map((a) => a.mime).sort()).toEqual(["application/pdf", "image/png"]);
    expect(attachments.find((a) => a.mime === "application/pdf")!.displayName).toBe("evilscript.pdf");
    const pdf = attachments.find((a) => a.mime === "application/pdf")!;
    expect((await readAttachment(s.care, s.g, pdf.id)).mime).toBe("application/pdf");
    expect(await code(readAttachment(s.out, s.gOut, pdf.id))).toBe("not_found");
    expect(await code(addAttachments(s.care, s.g, id, [{ name: "x.html", data: new TextEncoder().encode("<html>") }]))).toBe("invalid_file");
    const filePath = path.resolve(process.env.UPLOAD_DIR!, pdf.file);
    expect(existsSync(filePath)).toBe(true);
    await deleteMedicalRecord(s.admin, s.g, id);
    expect(existsSync(filePath)).toBe(false);
  });
});

describe("medications", () => {
  const plan = (o = {}) => medicationPlanSchema.parse({ name: "Apoquel", dosage: "16 mg", scheduleType: "daily", times: ["00:00"], startDate: addDays(today(), -2), ...o });

  it("only admins create plans; responsible person must be a member", async () => {
    const s = await setup();
    expect(await code(createPlan(s.care, s.g, plan()))).toBe("forbidden");
    expect(await code(createPlan(s.admin, s.g, plan({ responsibleUserId: s.out })))).toBe("invalid_assignee");
    const id = await createPlan(s.admin, s.g, plan({ responsibleUserId: s.care }));
    expect((await getPlan(s.care, s.g, id)).plan.responsibleUserId).toBe(s.care);
  });

  it("scheduled vs administered doses; caregivers confirm; duplicates, invented and future doses rejected", async () => {
    const s = await setup();
    const id = await createPlan(s.admin, s.g, plan());
    const dose = `${addDays(today(), -1)}T00:00`;
    let doses = await groupDoses(s.care, s.g, addDays(today(), -2), today());
    expect(doses.map((d) => d.status)).toEqual(["missed", "missed", "missed"]); // computed, none confirmed
    await recordAdministration(s.care, s.g, id, dose, "with food");
    expect(await code(recordAdministration(s.admin, s.g, id, dose))).toBe("already_administered");
    expect(await code(recordAdministration(s.care, s.g, id, `${dose.slice(0, 10)}T09:13`))).toBe("invalid_dose");
    expect(await code(recordAdministration(s.care, s.g, id, `${addDays(today(), 2)}T00:00`))).toBe("invalid_dose");
    expect(await code(recordAdministration(s.out, s.gOut, id, dose))).toBe("not_found"); // plan of another group
    doses = await groupDoses(s.care, s.g, addDays(today(), -2), today());
    expect(doses.find((d) => d.scheduledFor === dose)).toMatchObject({ status: "given", given: { notes: "with food" } });
  });

  it("concurrent confirmations of one dose record exactly one administration", async () => {
    const s = await setup();
    const id = await createPlan(s.admin, s.g, plan());
    const dose = `${addDays(today(), -1)}T00:00`;
    const r = await Promise.all([code(recordAdministration(s.care, s.g, id, dose)), code(recordAdministration(s.admin, s.g, id, dose))]);
    expect(r.sort()).toEqual(["already_administered", "ok"]);
  });

  it("caregivers can backfill doses for 48 hours; older doses need an admin", async () => {
    const s = await setup();
    const id = await createPlan(s.admin, s.g, plan({ startDate: addDays(today(), -5) }));
    const old = `${addDays(today(), -4)}T00:00`;
    expect(await code(recordAdministration(s.care, s.g, id, old))).toBe("invalid_dose");
    await recordAdministration(s.admin, s.g, id, old);
  });

  it("plans with history can be ended but not deleted", async () => {
    const s = await setup();
    const id = await createPlan(s.admin, s.g, plan());
    await recordAdministration(s.care, s.g, id, `${addDays(today(), -1)}T00:00`);
    expect(await code(deletePlan(s.admin, s.g, id))).toBe("has_history");
    await endPlan(s.admin, s.g, id);
    expect((await getPlan(s.admin, s.g, id)).plan.endDate).toBe(today());
    const unused = await createPlan(s.admin, s.g, plan({ name: "Unused" }));
    await deletePlan(s.admin, s.g, unused);
  });

  it("schedule validation", () => {
    const bad = (o: object) => medicationPlanSchema.safeParse({ name: "n", dosage: "d", startDate: today(), ...o }).error?.issues.map((i) => i.message) ?? [];
    expect(bad({ scheduleType: "daily", times: [] })).toContain("times_required");
    expect(bad({ scheduleType: "daily", times: ["25:00"] })).toContain("invalid_time");
    expect(bad({ scheduleType: "weekdays", times: ["08:00"], weekdays: [] })).toContain("weekdays_required");
    expect(bad({ scheduleType: "daily", times: ["08:00"], endDate: addDays(today(), -1) })).toContain("end_before_start");
  });
});

describe("events", () => {
  const ev = (o = {}) => eventSchema.parse({ type: "vet", title: "Checkup", date: today(), time: "10:00", ...o });

  it("both roles create and complete; only admins edit or delete; occurrences validated", async () => {
    const s = await setup();
    const id = await createEvent(s.care, s.g, ev({ recurrence: "weekly" }));
    expect(await code(updateEvent(s.care, s.g, id, ev({ title: "X" })))).toBe("forbidden");
    expect(await code(deleteEvent(s.care, s.g, id))).toBe("forbidden");
    const next = `${addDays(today(), 7)}T10:00`;
    await setOccurrenceStatus(s.care, s.g, id, next, "cancelled");
    expect(await code(setOccurrenceStatus(s.care, s.g, id, `${addDays(today(), 3)}T10:00`, "completed"))).toBe("invalid_occurrence");
    expect(await code(setOccurrenceStatus(s.out, s.gOut, id, next, "completed"))).toBe("not_found");
    const occ = await groupOccurrences(s.admin, s.g, today(), addDays(today(), 14));
    expect(occ.map((o) => o.status)).toEqual(["scheduled", "cancelled", "scheduled"]);
    await setOccurrenceStatus(s.care, s.g, id, next, null);
    expect((await groupOccurrences(s.admin, s.g, next.slice(0, 10), next.slice(0, 10)))[0].status).toBe("scheduled");
  });

  it("rejects malformed occurrence values before any date maths", async () => {
    const s = await setup();
    const id = await createEvent(s.care, s.g, ev({ recurrence: "daily" }));
    expect(await code(setOccurrenceStatus(s.care, s.g, id, "zzzz", "completed"))).toBe("invalid_occurrence");
  });

  it("assignee must be a group member", async () => {
    const s = await setup();
    expect(await code(createEvent(s.care, s.g, ev({ assigneeId: s.out })))).toBe("invalid_assignee");
  });
});

describe("tasks", () => {
  const task = (o = {}) => taskSchema.parse({ title: "Buy food", ...o });

  it("the calendar lists open and completed tasks due in the range, for members only", async () => {
    const s = await setup();
    const due = (title: string, dueDate: string) => createTask(s.admin, s.g, task({ title, dueDate }));
    const done = await due("Done", "2026-11-10");
    await due("First", "2026-11-01");
    await due("Last", "2026-11-30");
    await due("Outside", "2026-12-01");
    await completeTask(s.care, s.g, done);
    const list = await groupTasksDue(s.care, s.g, "2026-11-01", "2026-11-30");
    expect(list.map((x) => [x.title, x.status])).toEqual([["First", "new"], ["Done", "completed"], ["Last", "new"]]);
    expect(list[1].overdue).toBe(false);
    expect(await code(groupTasksDue(s.out, s.g, "2026-11-01", "2026-11-30"))).toBe("not_found");
    expect(await groupTasksDue(s.out, s.gOut, "2026-11-01", "2026-11-30")).toEqual([]);
  });

  it("both roles create and complete; only admins edit or delete; assignees must be members", async () => {
    const s = await setup();
    expect(await code(createTask(s.care, s.g, task({ assignees: [s.out] })))).toBe("invalid_assignee");
    const id = await createTask(s.care, s.g, task({ assignees: [s.care] }));
    expect(await code(updateTask(s.care, s.g, id, task({ title: "X" })))).toBe("forbidden");
    expect(await code(deleteTask(s.care, s.g, id))).toBe("forbidden");
    expect(await code(completeTask(s.out, s.gOut, id))).toBe("not_found");
    await completeTask(s.care, s.g, id);
    expect(await code(completeTask(s.admin, s.g, id))).toBe("task_closed");
    expect((await getTask(s.admin, s.g, id)).history.map((h) => h.action)).toEqual(["completed", "created"]);
    await reopenTask(s.care, s.g, id); // undo a mistaken completion
    expect((await getTask(s.admin, s.g, id)).task.status).toBe("new");
    expect((await listTasks(s.admin, s.g, "done")).tasks).toHaveLength(0); // reopened → back in open tasks
    expect((await listTasks(s.admin, s.g, "open")).tasks.map((x) => x.id)).toEqual([id]);
  });

  it("recurring tasks need a due date and spawn the next instance once, even when completed concurrently", async () => {
    const s = await setup();
    expect(taskSchema.safeParse({ title: "Walk", recurrence: "daily" }).success).toBe(false);
    const due = addDays(today(), -1);
    const id = await createTask(s.admin, s.g, task({ title: "Walk", recurrence: "daily", dueDate: due, dueTime: "07:00", assignees: [s.care] }));
    await Promise.all([code(completeTask(s.care, s.g, id)), code(completeTask(s.admin, s.g, id))]);
    const open = (await listTasks(s.admin, s.g)).tasks;
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ dueAt: `${today()}T07:00`, overdue: true, assignees: [{ userId: s.care }] });
    await deleteTask(s.admin, s.g, open[0].id); // deleting the open instance ends the series
    expect((await listTasks(s.admin, s.g)).tasks).toHaveLength(0);
    expect((await listTasks(s.admin, s.g, "done")).tasks).toHaveLength(1); // earlier completed instance stays
  });

  it("custom intervals: an every-3-days task comes back 3 days after its due date", async () => {
    const s = await setup();
    expect(taskSchema.safeParse({ title: "x", recurrence: "daily", dueDate: today(), recurrenceInterval: "0" }).success).toBe(false);
    expect(taskSchema.parse({ title: "x", recurrenceInterval: "5" }).recurrenceInterval).toBe(1); // ignored when not repeating
    const id = await createTask(s.admin, s.g, task({ title: "Clean litter", recurrence: "daily", recurrenceInterval: "3", dueDate: today(), dueTime: "18:00" }));
    await completeTask(s.care, s.g, id);
    const [next] = (await listTasks(s.admin, s.g)).tasks;
    expect(next).toMatchObject({ title: "Clean litter", dueAt: `${addDays(today(), 3)}T18:00`, recurrenceInterval: 3 });
  });

  it("caregiver transfer requests need admin approval; one pending request per task", async () => {
    const s = await setup();
    const third = await makeUser("Third");
    await acceptInvitation(third.id, await createInvitation(s.admin, s.g, { role: "caregiver", reusable: false, email: null, expiresInDays: 7 }));
    const id = await createTask(s.admin, s.g, task({ assignees: [s.care] }));
    expect(await requestTransfer(s.care, s.g, id, third.id)).toBe("requested");
    expect(await code(requestTransfer(s.care, s.g, id, s.admin))).toBe("transfer_pending");
    expect((await getTask(s.care, s.g, id)).assignees.map((a) => a.userId)).toEqual([s.care]); // unchanged until approved
    expect(await code(decideTransfer(s.care, s.g, id, true))).toBe("forbidden");
    await decideTransfer(s.admin, s.g, id, true);
    expect((await getTask(s.care, s.g, id)).assignees.map((a) => a.userId)).toEqual([third.id]);
    expect(await requestTransfer(s.admin, s.g, id, s.admin)).toBe("applied"); // admins reassign directly
  });

  it("removing a member unassigns their open tasks, plans and events in that group only", async () => {
    const s = await setup();
    const t = await createTask(s.admin, s.g, task({ assignees: [s.care] }));
    const p = await createPlan(s.admin, s.g, medicationPlanSchema.parse({ name: "M", dosage: "1", scheduleType: "daily", times: ["08:00"], startDate: today(), responsibleUserId: s.care }));
    await removeMember(s.admin, s.g, s.care);
    expect((await getTask(s.admin, s.g, t)).assignees).toEqual([]);
    expect((await getPlan(s.admin, s.g, p)).plan.responsibleUserId).toBeNull();
    expect((await getTask(s.admin, s.g, t)).history.length).toBeGreaterThan(0); // history kept
  });
});
