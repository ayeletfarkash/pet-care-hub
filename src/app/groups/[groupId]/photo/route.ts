import { getCurrentUser } from "@/server/auth/session";
import { readPetPhoto } from "@/server/services/pets";

// Pet photos are served only to members of the pet's group (PRD §21.4).
export async function GET(_req: Request, ctx: { params: Promise<{ groupId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 404 });
  const { groupId } = await ctx.params;
  try {
    const { data, mime } = await readPetPhoto(user.id, groupId);
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": mime,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'",
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
