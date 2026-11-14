import "server-only";
import { notFound } from "next/navigation";
import { cache } from "react";
import { requireUser } from "@/server/auth/session";
import { getPetForMember } from "@/server/services/pets";
import { AppError } from "@/server/errors";

/** Loads the group's pet for the current member, or renders 404 (also for non-members). */
export const loadGroup = cache(async (groupId: string) => {
  const user = await requireUser();
  try {
    return { user, ...(await getPetForMember(user.id, groupId)) };
  } catch (e) {
    if (e instanceof AppError && e.code === "not_found") notFound();
    throw e;
  }
});
