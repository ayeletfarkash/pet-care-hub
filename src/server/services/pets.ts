import { eq } from "drizzle-orm";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { db, writeTx } from "../db";
import { pets } from "../db/schema";
import { audit } from "../audit";
import { AppError } from "../errors";
import { requireMembership } from "../permissions";
import type { PetInput } from "../validation";

// Runtime data dir, not source: keep the bundler from tracing it.
const UPLOAD_DIR = path.resolve(/*turbopackIgnore: true*/ process.env.UPLOAD_DIR ?? "./data/uploads");
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export async function getPetForMember(userId: string, groupId: string) {
  await requireMembership(db, userId, groupId);
  const pet = await db.select().from(pets).where(eq(pets.groupId, groupId)).get();
  if (!pet) throw new AppError("not_found");
  return { pet };
}

export async function updatePet(userId: string, groupId: string, input: PetInput) {
  await writeTx(async (tx) => {
    await requireMembership(tx, userId, groupId);
    await tx.update(pets).set({ ...input, updatedAt: new Date() }).where(eq(pets.groupId, groupId));
    await audit(tx, { groupId, actorId: userId, action: "pet.updated" });
  });
}

/** Detect type from magic bytes; never trust the client-provided MIME type or filename. */
export function sniffImage(buf: Uint8Array): { ext: string; mime: string } | null {
  const b = buf;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: "jpg", mime: "image/jpeg" };
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { ext: "png", mime: "image/png" };
  const ascii = (s: number, e: number) => String.fromCharCode(...b.slice(s, e));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return { ext: "webp", mime: "image/webp" };
  return null;
}
const MIME_BY_EXT: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

export async function setPetPhoto(userId: string, groupId: string, data: Uint8Array) {
  await requireMembership(db, userId, groupId);
  if (data.byteLength === 0 || data.byteLength > MAX_PHOTO_BYTES) throw new AppError("invalid_photo");
  const type = sniffImage(data);
  if (!type) throw new AppError("invalid_photo");
  await mkdir(UPLOAD_DIR, { recursive: true });
  const file = `${crypto.randomUUID()}.${type.ext}`;
  await writeFile(path.join(/*turbopackIgnore: true*/ UPLOAD_DIR, file), data);
  await replacePhoto(userId, groupId, file);
}

export const removePetPhoto = (userId: string, groupId: string) => replacePhoto(userId, groupId, null);

async function replacePhoto(userId: string, groupId: string, file: string | null) {
  const old = await writeTx(async (tx) => {
    await requireMembership(tx, userId, groupId);
    const row = await tx.select({ f: pets.photoFile }).from(pets).where(eq(pets.groupId, groupId)).get();
    await tx.update(pets).set({ photoFile: file, updatedAt: new Date() }).where(eq(pets.groupId, groupId));
    await audit(tx, { groupId, actorId: userId, action: "pet.updated", meta: { photo: file ? "set" : "removed" } });
    return row?.f;
  }).catch(async (e) => {
    if (file) await unlink(path.join(/*turbopackIgnore: true*/ UPLOAD_DIR, file)).catch(() => {}); // don't leave an orphan upload
    throw e;
  });
  if (old) await unlink(path.join(/*turbopackIgnore: true*/ UPLOAD_DIR, old)).catch(() => {});
}

/** Returns photo bytes only to members of the pet's group. */
export async function readPetPhoto(userId: string, groupId: string) {
  await requireMembership(db, userId, groupId);
  const row = await db.select({ f: pets.photoFile }).from(pets).where(eq(pets.groupId, groupId)).get();
  if (!row?.f || !/^[0-9a-f-]{36}\.(jpg|png|webp)$/.test(row.f)) throw new AppError("not_found");
  return { data: await readFile(path.join(/*turbopackIgnore: true*/ UPLOAD_DIR, row.f)), mime: MIME_BY_EXT[row.f.split(".")[1]] };
}
