import "server-only";
import { headers } from "next/headers";

export async function inviteLink(token: string) {
  const h = await headers();
  const base = process.env.APP_URL ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  return `${base}/invite/${token}`;
}
