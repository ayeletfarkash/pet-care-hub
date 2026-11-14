import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db, writeTx } from "../db";
import { attachments, medicalRecords, users } from "../db/schema";
import { AppError } from "../errors";
import { deleteStoredFiles, readStoredFile, safeDisplayName, storeDocument } from "../files";
import { requireMembership } from "../permissions";
import type { MedicalRecordInput } from "../validation";

// PRD §6.1–6.2: both roles view, add records and upload documents; only Admins edit/delete.

export async function listMedicalRecords(userId: string, groupId: string) {
  await requireMembership(db, userId, groupId);
  // shortcut: no pagination; add it when a pet's history grows past a few hundred records.
  const records = await db
    .select({ r: medicalRecords, createdByName: users.name })
    .from(medicalRecords)
    .leftJoin(users, eq(users.id, medicalRecords.createdById))
    .where(eq(medicalRecords.groupId, groupId))
    .orderBy(desc(medicalRecords.date), desc(medicalRecords.createdAt));
  const ids = records.map((x) => x.r.id);
  const files = ids.length
    ? await db.select().from(attachments).where(and(eq(attachments.groupId, groupId), inArray(attachments.medicalRecordId, ids))).orderBy(asc(attachments.createdAt))
    : [];
  return records.map(({ r, createdByName }) => ({ ...r, createdByName, attachments: files.filter((f) => f.medicalRecordId === r.id) }));
}

export async function getMedicalRecord(userId: string, groupId: string, recordId: string) {
  const role = await requireMembership(db, userId, groupId);
  const record = await db.select().from(medicalRecords).where(and(eq(medicalRecords.id, recordId), eq(medicalRecords.groupId, groupId))).get();
  if (!record) throw new AppError("not_found");
  const files = await db.select().from(attachments).where(and(eq(attachments.groupId, groupId), eq(attachments.medicalRecordId, recordId)));
  return { record, attachments: files, role };
}

/** Files are written first, then rows in one transaction; on failure the written files are removed. */
async function withStoredFiles<T>(uploads: { name: string; data: Uint8Array }[], fn: (stored: (Awaited<ReturnType<typeof storeDocument>> & { displayName: string })[]) => Promise<T>) {
  const stored: (Awaited<ReturnType<typeof storeDocument>> & { displayName: string })[] = [];
  try {
    for (const u of uploads) stored.push({ ...(await storeDocument(u.data)), displayName: safeDisplayName(u.name) });
    return await fn(stored);
  } catch (e) {
    await deleteStoredFiles(stored.map((s) => s.file));
    throw e;
  }
}

export async function createMedicalRecord(userId: string, groupId: string, input: MedicalRecordInput, uploads: { name: string; data: Uint8Array }[] = []) {
  await requireMembership(db, userId, groupId); // fail fast before writing files
  return withStoredFiles(uploads, (stored) =>
    writeTx(async (tx) => {
      await requireMembership(tx, userId, groupId);
      const [rec] = await tx.insert(medicalRecords).values({ ...input, groupId, createdById: userId }).returning({ id: medicalRecords.id });
      for (const s of stored) await tx.insert(attachments).values({ ...s, groupId, medicalRecordId: rec.id, uploadedById: userId });
      return rec.id;
    }),
  );
}

/** Adding documents to an existing record is "adding documentation", allowed for both roles. */
export async function addAttachments(userId: string, groupId: string, recordId: string, uploads: { name: string; data: Uint8Array }[]) {
  await requireMembership(db, userId, groupId);
  return withStoredFiles(uploads, (stored) =>
    writeTx(async (tx) => {
      await requireMembership(tx, userId, groupId);
      const rec = await tx.select({ id: medicalRecords.id }).from(medicalRecords).where(and(eq(medicalRecords.id, recordId), eq(medicalRecords.groupId, groupId))).get();
      if (!rec) throw new AppError("not_found");
      for (const s of stored) await tx.insert(attachments).values({ ...s, groupId, medicalRecordId: recordId, uploadedById: userId });
    }),
  );
}

export async function updateMedicalRecord(userId: string, groupId: string, recordId: string, input: MedicalRecordInput) {
  await writeTx(async (tx) => {
    await requireMembership(tx, userId, groupId, "admin");
    const res = await tx.update(medicalRecords).set({ ...input, updatedAt: new Date() })
      .where(and(eq(medicalRecords.id, recordId), eq(medicalRecords.groupId, groupId)));
    if (res.rowsAffected === 0) throw new AppError("not_found");
  });
}

export async function deleteMedicalRecord(userId: string, groupId: string, recordId: string) {
  const files = await writeTx(async (tx) => {
    await requireMembership(tx, userId, groupId, "admin");
    const rows = await tx.select({ file: attachments.file }).from(attachments).where(and(eq(attachments.groupId, groupId), eq(attachments.medicalRecordId, recordId)));
    const res = await tx.delete(medicalRecords).where(and(eq(medicalRecords.id, recordId), eq(medicalRecords.groupId, groupId)));
    if (res.rowsAffected === 0) throw new AppError("not_found");
    return rows.map((r) => r.file);
  });
  await deleteStoredFiles(files); // DB cascade removed the rows; remove the files too
}

export async function deleteAttachment(userId: string, groupId: string, attachmentId: string) {
  const file = await writeTx(async (tx) => {
    await requireMembership(tx, userId, groupId, "admin");
    const row = await tx.select({ file: attachments.file }).from(attachments).where(and(eq(attachments.id, attachmentId), eq(attachments.groupId, groupId))).get();
    if (!row) throw new AppError("not_found");
    await tx.delete(attachments).where(eq(attachments.id, attachmentId));
    return row.file;
  });
  await deleteStoredFiles([file]);
}

/** Bytes for the download route; group-scoped so another group's attachment id 404s. */
export async function readAttachment(userId: string, groupId: string, attachmentId: string) {
  await requireMembership(db, userId, groupId);
  const row = await db.select().from(attachments).where(and(eq(attachments.id, attachmentId), eq(attachments.groupId, groupId))).get();
  if (!row) throw new AppError("not_found");
  return { data: await readStoredFile(row.file), mime: row.mime, displayName: row.displayName };
}
