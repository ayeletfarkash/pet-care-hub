import { createServer } from "node:net";
import { expect, test, type Page } from "@playwright/test";
import { createPet, expectNoA11yViolations, register, uniqueEmail, useEnglish } from "./helpers";

/** Minimal SMTP server on the port in SMTP_URL (playwright.config.ts); collects raw messages. */
async function startSmtp() {
  const mails: string[] = [];
  const server = createServer((socket) => {
    let data: string | null = null, buf = "";
    socket.write("220 test\r\n");
    socket.on("data", (chunk) => {
      buf += chunk;
      for (let i; (i = buf.indexOf("\r\n")) >= 0; buf = buf.slice(i + 2)) {
        const line = buf.slice(0, i);
        if (data !== null) {
          if (line !== ".") { data += `${line}\r\n`; continue; }
          mails.push(data.replace(/=\r\n/g, "").replace(/=3D/g, "="));
          data = null;
          socket.write("250 ok\r\n");
        } else if (/^DATA/i.test(line)) { data = ""; socket.write("354 go\r\n"); }
        else if (/^QUIT/i.test(line)) socket.end("221 bye\r\n");
        else socket.write("250 ok\r\n");
      }
    });
    socket.on("error", () => {});
  });
  await new Promise<void>((r) => server.listen(3125, "127.0.0.1", r));
  return { mails, close: () => server.close() };
}

/** Google's consent page: checks the request and returns to the app as `claims`. */
async function fakeGoogle(page: Page, claims: object) {
  await page.route("https://accounts.google.com/**", (route) => {
    const q = new URL(route.request().url()).searchParams;
    const code = Buffer.from(JSON.stringify({
      iss: "https://accounts.google.com", aud: q.get("client_id"), exp: Date.now() / 1000 + 60, nonce: q.get("nonce"), email_verified: true, ...claims,
    })).toString("base64url");
    const back = `${q.get("redirect_uri")}?${new URLSearchParams({ code, state: q.get("state")! })}`;
    return route.fulfill({ contentType: "text/html", body: `<script>location.href = ${JSON.stringify(back)}</script>` });
  });
}
const gmail = (p: string) => uniqueEmail(p).replace("example.test", "gmail.com");
const google = (page: Page) => page.getByRole("button", { name: /Continue with Google|המשיכו עם Google/ });

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel(/^Email/).fill(email);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
}

test("forgotten password: emailed link sets a new password and logs out other devices", async ({ page, browser }) => {
  const smtp = await startSmtp();
  try {
    const email = uniqueEmail("reset");
    const other = await (await browser.newContext()).newPage();
    await register(other, "Reset User", email);

    await page.goto("/login");
    await useEnglish(page);
    await page.goto("/login");
    await page.getByRole("link", { name: "Forgot your password?" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Reset your password");
    await expectNoA11yViolations(page);

    // Same answer for an unknown address, and no email
    await page.getByLabel(/^Email/).fill(uniqueEmail("nobody"));
    await page.getByRole("button", { name: "Send reset link" }).click();
    const sent = page.getByRole("status").filter({ hasText: "If an account exists" });
    await expect(sent).toBeVisible();
    await page.reload();
    await page.getByLabel(/^Email/).fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(sent).toBeVisible();
    await expect.poll(() => smtp.mails.length).toBe(1);
    expect(smtp.mails[0]).toContain(`To: ${email}`);
    const link = smtp.mails[0].match(/http:\/\/localhost:3100\/reset-password\/[\w-]{43}/)![0];

    await page.goto(link);
    await expect(page).toHaveURL(/\/reset-password$/); // token removed from the address bar
    await expectNoA11yViolations(page);
    await page.getByLabel(/^New password/).fill("short");
    await page.getByRole("button", { name: "Save new password" }).click();
    await expect(page.getByLabel(/^New password/)).toBeFocused();
    await page.getByLabel(/^New password/).fill("brand-new-password");
    await page.getByRole("button", { name: "Save new password" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Your password was changed" })).toBeVisible();

    await other.goto("/");
    await expect(other).toHaveURL(/\/login/);
    await login(page, email, "brand-new-password");
    await expect(page.getByRole("heading", { level: 1, name: "Hello, Reset User" })).toBeVisible();

    // The link works once
    await other.goto(link);
    await expect(other.getByRole("alert").filter({ hasText: /not valid|אינו תקף/ })).toBeVisible();
    await expectNoA11yViolations(other);
  } finally {
    smtp.close();
  }
});

test("Google: sign up through an invitation, then log in again", async ({ page, browser }) => {
  const owner = await (await browser.newContext()).newPage();
  await register(owner, "Owner", uniqueEmail("owner"));
  const groupId = await createPet(owner, "Rex");
  await owner.goto(`/groups/${groupId}/members`);
  await owner.getByRole("button", { name: "Create link" }).click();
  const link = await owner.getByLabel("Invitation link").inputValue();

  await page.goto("/login");
  await useEnglish(page);
  await page.goto(link);
  await page.getByRole("link", { name: "Create an account to join" }).click();
  await expect(google(page)).toBeVisible();
  await expectNoA11yViolations(page);
  await fakeGoogle(page, { sub: `s-${Date.now()}`, email: gmail("new"), name: "Gali Google" });
  await google(page).click();
  await expect(page.getByRole("heading", { level: 1, name: "Rex" })).toBeVisible(); // joined the group

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Hello, Gali Google" })).toBeVisible();
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login/);
  await google(page).click();
  await expect(page.getByRole("heading", { level: 1, name: "Hello, Gali Google" })).toBeVisible();
});

test("Google: connecting an existing account keeps it and retires its old password", async ({ page }) => {
  const email = gmail("link");
  await register(page, "Password User", email);
  await page.context().clearCookies();
  await page.goto("/login");
  await useEnglish(page);
  await page.goto("/login");
  await fakeGoogle(page, { sub: `l-${Date.now()}`, email, name: "Other Name" });
  await google(page).click();
  await expect(page.getByRole("heading", { level: 1, name: "Hello, Password User" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "connected to Google" })).toBeVisible();
  await expectNoA11yViolations(page);

  await page.context().clearCookies();
  await page.goto("/login");
  await useEnglish(page);
  await login(page, email, "password123");
  await expect(page.getByRole("alert").filter({ hasText: "The email or password is incorrect." })).toBeVisible();
});

test("Google: a callback this browser didn't start, or a cancelled one, signs nobody in", async ({ page }) => {
  await page.goto("/login");
  await useEnglish(page);
  for (const query of ["code=abc&state=forged", "error=access_denied"]) {
    await page.goto(`/auth/google/callback?${query}`);
    await expect(page).toHaveURL(/\/login\?/);
    await expect(page.getByRole("alert").filter({ hasText: "Google sign-in didn't complete" })).toBeVisible();
  }
  await expectNoA11yViolations(page);
});
