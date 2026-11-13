import { getCurrentUser } from "@/server/auth/session";
import { readAttachment } from "@/server/services/medical";

// Medical documents are served only to members of the record's group (PRD §21.4).
export async function GET(_req: Request, ctx: { params: Promise<{ groupId: string; attachmentId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 404 });
  const { groupId, attachmentId } = await ctx.params;
  try {
    const { data, mime, displayName } = await readAttachment(user.id, groupId, attachmentId);
    const ext = mime === "application/pdf" ? "pdf" : mime.split("/")[1];
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": mime,
        // PDFs download (no in-browser script surface); images may display inline.
        "Content-Disposition": `${mime === "application/pdf" ? "attachment" : "inline"}; filename="document.${ext}"; filename*=UTF-8''${encodeURIComponent(displayName)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
