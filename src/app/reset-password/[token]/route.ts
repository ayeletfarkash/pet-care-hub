import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { RESET_COOKIE } from "@/app/actions/auth-cookies";

// Emailed reset links land here: like invitations, the token moves to an httpOnly cookie so it leaves
// the address bar. Opening the link changes nothing (mail scanners open links too).
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (/^[A-Za-z0-9_-]{43}$/.test(token))
    (await cookies()).set({
      ...RESET_COOKIE, value: token,
      httpOnly: true, sameSite: "lax", maxAge: 60 * 60, secure: process.env.NODE_ENV === "production",
    });
  redirect("/reset-password");
}
