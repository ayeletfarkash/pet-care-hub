import nodemailer from "nodemailer";
import { dictionaries, fmt } from "@/i18n";
import type { Locale } from "./db/schema";

export const mailEnabled = () => process.env.NODE_ENV !== "production" || !!process.env.SMTP_URL;

/** Without SMTP_URL, development logs the link to the console; production sends nothing (and never logs the token). */
export async function sendPasswordResetEmail(to: string, link: string, locale: Locale) {
  const url = process.env.SMTP_URL;
  if (!url) {
    if (process.env.NODE_ENV !== "production") console.info(`[mail:dev] Password reset for ${to}: ${link}`);
    return;
  }
  const t = dictionaries[locale];
  await nodemailer.createTransport(url).sendMail({
    from: { name: t.app.name, address: decodeURIComponent(new URL(url).username) },
    to,
    subject: t.auth.resetEmailSubject,
    text: fmt(t.auth.resetEmailBody, { link }),
  });
}

// shortcut: email-bound invitations have no form today, so this only logs in development; send it over SMTP when one returns.
export async function sendInvitationEmail(to: string, link: string, petName: string): Promise<boolean> {
  if (process.env.NODE_ENV === "production") return false;
  console.info(`[mail:dev] Invitation to ${to} for "${petName}": ${link}`);
  return true;
}
