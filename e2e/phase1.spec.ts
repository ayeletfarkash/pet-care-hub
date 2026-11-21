import { expect, test } from "@playwright/test";
import { createPet, expectNoA11yViolations, register, uniqueEmail, useEnglish } from "./helpers";

test.describe("Phase 1 acceptance", () => {
  test("register, create a pet, invite a caregiver who joins; roles and isolation hold", async ({ browser }) => {
    // Admin
    const adminCtx = await browser.newContext();
    const admin = await adminCtx.newPage();
    await register(admin, "Dana Admin", uniqueEmail("admin"));
    await expect(admin.getByRole("heading", { level: 1, name: "Hello, Dana Admin" })).toBeVisible();
    const groupId = await createPet(admin, "Rex");
    await expect(admin.getByText("Your role: Admin")).toBeVisible();
    const privateGroupId = await createPet(admin, "Secret Cat", "cat");

    // Invitation link (one-time, caregiver by default)
    await admin.goto(`/groups/${groupId}/members`);
    await admin.getByRole("button", { name: "Create link" }).click();
    const link = await admin.getByLabel("Invitation link").inputValue();
    expect(link).toContain("/invite/");

    // Active invitation row: copy, WhatsApp and email share the same link
    await admin.reload();
    const row = admin.getByRole("row", { name: /One-time link/ });
    const wa = await row.getByRole("link", { name: /^Share on WhatsApp/ }).getAttribute("href");
    expect(wa?.startsWith("https://wa.me/?text=") && wa.includes(encodeURIComponent(link))).toBe(true);
    const mail = await row.getByRole("link", { name: /^Share by email/ }).getAttribute("href");
    expect(mail?.startsWith("mailto:?subject=") && mail.includes(encodeURIComponent(link))).toBe(true);
    await adminCtx.grantPermissions(["clipboard-read", "clipboard-write"]);
    await row.getByRole("button", { name: /^Copy link/ }).click();
    await expect(admin.locator("#app-live-region")).toHaveText("Link copied.");
    expect(await admin.evaluate(() => navigator.clipboard.readText())).toBe(link);

    // Invitee registers through the link and is added automatically
    const userCtx = await browser.newContext();
    const user = await userCtx.newPage();
    await user.goto(link);
    await expect(user).toHaveURL(/\/join$/); // token removed from the address bar
    await user.getByRole("link", { name: /Create an account to join|יצירת חשבון להצטרפות/ }).click();
    await register(user, "Gal Caregiver", uniqueEmail("care"));
    await expect(user.getByRole("heading", { level: 1, name: "Rex" })).toBeVisible();
    await expect(user.getByText("Your role: Caregiver")).toBeVisible();
    await expect(user.getByRole("link", { name: "Edit profile" })).toHaveCount(0);

    // Caregiver can't open the edit page or another group (same 404 as a missing group)
    await user.goto(`/groups/${groupId}/edit`);
    await expect(user.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await user.goto(`/groups/${privateGroupId}`);
    await expect(user.getByRole("heading", { name: "Page not found" })).toBeVisible();
    const photo = await user.request.get(`/groups/${privateGroupId}/photo`);
    expect(photo.status()).toBe(404);

    // The one-time link can't be reused
    const thirdCtx = await browser.newContext();
    const third = await thirdCtx.newPage();
    await third.goto(link);
    await expect(third.getByRole("alert").filter({ hasText: /not valid|אינו תקף/ })).toBeVisible();

    // Different roles in different groups: caregiver creates their own pet and is Admin there
    await createPet(user, "Mitzi", "rabbit");
    await expect(user.getByText("Your role: Admin")).toBeVisible();
    await user.goto("/");
    await expect(user.getByRole("listitem").filter({ hasText: "Rex" })).toContainText("Caregiver");
    await expect(user.getByRole("listitem").filter({ hasText: "Mitzi" })).toContainText("Admin");

    // Admin promotes the caregiver
    await admin.goto(`/groups/${groupId}/members`);
    await admin.getByRole("row", { name: /Gal Caregiver/ }).getByRole("button", { name: "Make Admin" }).click();
    await expect(admin.getByRole("status").filter({ hasText: "Role updated." })).toBeVisible();

    // Last admin can't leave their private group
    await admin.goto(`/groups/${privateGroupId}`);
    await admin.getByRole("button", { name: "Leave group" }).click();
    await admin.getByRole("dialog").getByRole("button", { name: "Leave group" }).click();
    await expect(admin.getByRole("dialog").getByRole("alert").filter({ hasText: "at least one Admin" })).toBeVisible();

    await Promise.all([adminCtx.close(), userCtx.close(), thirdCtx.close()]);
  });

  test("validation errors are announced and focus moves to the first invalid field", async ({ page }) => {
    await page.goto("/login");
    await useEnglish(page);
    await page.goto("/register");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Please correct" })).toBeVisible();
    await expect(page.getByLabel(/Full name/)).toBeFocused();
    await expect(page.getByLabel(/Full name/)).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByLabel(/^Email/)).toHaveAccessibleDescription(/valid email|required/i);
  });

  test("wrong password shows a generic error", async ({ page }) => {
    await page.goto("/login");
    await useEnglish(page);
    await page.goto("/login");
    await page.getByLabel(/^Email/).fill("nobody@example.test");
    await page.getByLabel(/^Password/).fill("wrongpass1");
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "The email or password is incorrect." })).toBeVisible();
  });
});

test.describe("Localization", () => {
  test("Hebrew RTL by default; switching to English sets LTR", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("html")).toHaveAttribute("lang", "he");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("התחברות");
    await page.getByRole("button", { name: "English" }).click();
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Log in");
  });

  test("each user's language is independent", async ({ browser }) => {
    const a = await (await browser.newContext()).newPage();
    const b = await (await browser.newContext()).newPage();
    await register(a, "Hebrew User", uniqueEmail("he"), "he");
    await register(b, "English User", uniqueEmail("en"), "en");
    await a.goto("/");
    await b.goto("/");
    await expect(a.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(b.locator("html")).toHaveAttribute("dir", "ltr");
  });
});

test.describe("Accessibility", () => {
  test("keyboard: skip link, then register and create a pet without a mouse", async ({ page }) => {
    await page.goto("/login");
    await useEnglish(page);
    await page.goto("/register");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Tab");
    await expect(page.getByLabel(/Full name/)).toBeFocused();
    await page.keyboard.type("Keyboard User");
    await page.keyboard.press("Tab");
    await page.keyboard.type(uniqueEmail("kb"));
    await page.keyboard.press("Tab");
    await page.keyboard.type("password123");
    await page.keyboard.press("Tab"); // language select
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Create account" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { level: 1, name: "Hello, Keyboard User" })).toBeVisible();

    await page.getByRole("link", { name: "Add a pet" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { level: 1, name: "Add a pet" })).toBeVisible();
    await page.getByLabel(/^Pet name/).focus();
    await page.keyboard.type("Tweety");
    await page.keyboard.press("Tab");
    await page.keyboard.press("b"); // select "Bird" by typing
    await page.getByRole("button", { name: "Create pet group" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { level: 1, name: "Tweety" })).toBeVisible();
    await expect(page.getByText("Bird")).toBeVisible();
  });

  test("toolbar is keyboard-operable and preferences are saved per user", async ({ browser }) => {
    const a = await (await browser.newContext()).newPage();
    await register(a, "Toolbar User", uniqueEmail("tb"));
    const toggle = a.getByRole("button", { name: "Accessibility", exact: true });
    await toggle.focus();
    await a.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await a.getByRole("button", { name: "A+ Increase text size" }).click();
    await a.getByRole("switch", { name: "High contrast" }).check();
    await expect(a.locator("html")).toHaveClass(/contrast-high/);
    await expect(a.locator("html")).toHaveAttribute("style", /font-size:\s*112%/);
    await a.keyboard.press("Escape");
    await expect(toggle).toBeFocused();
    await a.waitForTimeout(500); // let the save action finish
    await a.reload();
    await expect(a.locator("html")).toHaveClass(/contrast-high/);

    // A different user keeps defaults
    const b = await (await browser.newContext()).newPage();
    await register(b, "Other User", uniqueEmail("tb2"));
    await expect(b.locator("html")).not.toHaveClass(/contrast-high/);
    await expect(b.getByRole("link", { name: "Accessibility statement" })).toBeVisible();
  });

  test("links styled as buttons keep their own text colour (CSS layer regression)", async ({ page }) => {
    await register(page, "Colour User", uniqueEmail("col"));
    const colours = await page.getByRole("link", { name: "Add a pet" }).evaluate((el) => {
      const s = getComputedStyle(el);
      return { fg: s.color, bg: s.backgroundColor };
    });
    expect(colours.fg).not.toBe(colours.bg);
    expect(colours.fg).toBe("rgb(255, 255, 255)");
  });

  test("toolbar panel fits a 360px phone screen at 200% text", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto("/login");
    await page.getByRole("button", { name: "נגישות", exact: true }).click();
    const increase = page.getByRole("button", { name: /^A\+/ });
    for (let i = 0; i < 5; i++) await increase.click();
    const box = (await page.getByRole("region", { name: "הגדרות נגישות" }).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(360);
    expect(box.y + box.height).toBeLessThanOrEqual(740);
  });

  test("accessibility statement is public and dated", async ({ page }) => {
    await page.goto("/accessibility");
    await expect(page.getByRole("heading", { level: 1, name: "הצהרת נגישות" })).toBeVisible();
    await expect(page.locator("time")).toHaveAttribute("datetime", /\d{4}-\d{2}-\d{2}/);
  });

  test("automated WCAG checks: public pages (he + en)", async ({ page }) => {
    for (const path of ["/login", "/register", "/accessibility", "/join"]) {
      await page.goto(path);
      await expectNoA11yViolations(page);
    }
    await useEnglish(page);
    for (const path of ["/login", "/register", "/accessibility"]) {
      await page.goto(path);
      await expectNoA11yViolations(page);
    }
  });

  test("profile: photo saves on select and removes by icon; estimated age in years and months", async ({ page }) => {
    await register(page, "Pia Profile", uniqueEmail("prof"));
    const groupId = await createPet(page, "Momo", "cat");
    await page.goto(`/groups/${groupId}/edit`);
    await expect(page.getByText("Identifying characteristics")).toHaveCount(0);
    // 1×1 PNG
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
    await page.getByLabel("Upload photo").setInputFiles({ name: "p.png", mimeType: "image/png", buffer: png });
    await expect(page.getByRole("img", { name: "Photo of Momo" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Upload photo" })).toHaveCount(0);
    await page.getByRole("button", { name: "Remove photo" }).click();
    await expect(page.getByRole("img", { name: "Photo of Momo" })).toHaveCount(0);
    await expect(page.getByLabel("Upload photo")).toBeFocused();

    await page.getByLabel("Years").fill("1");
    await page.getByLabel("Months").selectOption("11");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("~1 year, 11 months (estimated)")).toBeVisible();
    await page.goto(`/groups/${groupId}/edit`);
    await expect(page.getByLabel("Years")).toHaveValue("1");
    await expect(page.getByLabel("Months")).toHaveValue("11");
  });

  test("automated WCAG checks: signed-in pages, incl. high contrast and open dialog", async ({ page }) => {
    await register(page, "Axe User", uniqueEmail("axe"));
    await expectNoA11yViolations(page); // empty dashboard
    await page.goto("/groups/new");
    await expectNoA11yViolations(page);
    const groupId = await createPet(page, "Luna", "cat");
    await expectNoA11yViolations(page);
    await page.goto(`/groups/${groupId}/edit`);
    await expectNoA11yViolations(page);
    await page.goto(`/groups/${groupId}/members`);
    await page.getByRole("button", { name: "Create link" }).click();
    await expect(page.getByLabel("Invitation link")).toBeVisible();
    await expectNoA11yViolations(page);
    await page.goto("/profile");
    await expectNoA11yViolations(page);
    await page.goto("/");
    await expectNoA11yViolations(page);

    await page.goto(`/groups/${groupId}`);
    await page.getByRole("button", { name: "Delete group" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog").getByRole("button", { name: "Cancel" })).toBeFocused(); // safe default
    await expectNoA11yViolations(page);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Delete group" })).toBeFocused();

    await page.getByRole("button", { name: "Accessibility", exact: true }).click();
    await page.getByRole("switch", { name: "High contrast" }).check();
    await expectNoA11yViolations(page);
  });
});
