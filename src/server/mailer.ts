// shortcut: no email provider yet. In development the invitation link is logged to the server
// console; in production nothing is sent (and the token is never logged). Plug an SMTP/API
// provider in here when one is chosen (see docs/development.md).
export async function sendInvitationEmail(to: string, link: string, petName: string): Promise<boolean> {
  if (process.env.NODE_ENV === "production") return false;
  console.info(`[mail:dev] Invitation to ${to} for "${petName}": ${link}`);
  return true;
}
