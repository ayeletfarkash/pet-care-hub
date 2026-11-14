import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { INVITE_COOKIE } from "@/app/actions/invite-cookie";

// Invitation links land here: stash the token in an httpOnly cookie and move to /join so the
// token leaves the address bar. Visiting the link never joins by itself (confirm step on /join).
export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (/^[A-Za-z0-9_-]{20,100}$/.test(token)) {
    (await cookies()).set(INVITE_COOKIE, token, {
      httpOnly: true, sameSite: "lax", path: "/", maxAge: 24 * 60 * 60, secure: process.env.NODE_ENV === "production",
    });
  }
  return NextResponse.redirect(new URL("/join", req.url), 303);
}
