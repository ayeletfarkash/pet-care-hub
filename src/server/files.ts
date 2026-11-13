import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { sniffImage } from "./services/pets";
import { AppError } from "./errors";

// Same storage as pet photos: outside public/, generated names, served only after a membership check.
const UPLOAD_DIR = path.resolve(/*turbopackIgnore: true*/ process.env.UPLOAD_DIR ?? "./data/uploads");
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const FILE_RE = /^[0-9a-f-]{36}\.(jpg|png|webp|pdf)$/;

/** Images (as for photos) plus PDF, detected from magic bytes only. */
export function sniffDocument(b: Uint8Array): { ext: string; mime: string } | null {
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d) return { ext: "pdf", mime: "application/pdf" }; // %PDF-
  return sniffImage(b);
}

/** Display-only name: strip paths/control chars, cap length. Never used as a filesystem path. */
export const safeDisplayName = (name: string) =>
  // Also strips bidi overrides and zero-width characters that could disguise a name.
  name.replace(/^.*[\\/]/, "").replace(/[\u0000-\u001f\u007f<>:"|?*​-‏‪-‮⁦-⁩﻿]/g, "").trim().slice(0, 120) || "file";

export async function storeDocument(data: Uint8Array) {
  if (data.byteLength === 0 || data.byteLength > MAX_ATTACHMENT_BYTES) throw new AppError("invalid_file");
  const type = sniffDocument(data);
  if (!type) throw new AppError("invalid_file");
  await mkdir(UPLOAD_DIR, { recursive: true });
  const file = `${crypto.randomUUID()}.${type.ext}`;
  await writeFile(path.join(/*turbopackIgnore: true*/ UPLOAD_DIR, file), data);
  return { file, mime: type.mime, size: data.byteLength };
}

export async function deleteStoredFiles(files: string[]) {
  await Promise.all(files.filter((f) => FILE_RE.test(f)).map((f) => unlink(path.join(/*turbopackIgnore: true*/ UPLOAD_DIR, f)).catch(() => {})));
}

export async function readStoredFile(file: string) {
  if (!FILE_RE.test(file)) throw new AppError("not_found");
  return readFile(path.join(/*turbopackIgnore: true*/ UPLOAD_DIR, file));
}
