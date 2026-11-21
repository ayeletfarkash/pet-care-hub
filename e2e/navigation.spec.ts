import { expect, test, type Page } from "@playwright/test";
import { createPet, expectNoA11yViolations, register, uniqueEmail } from "./helpers";

const SECTIONS = ["Profile", "Medications", "Calendar", "Tasks", "Routines", "Inventory", "Orders"];
const sectionNav = (p: Page) => p.getByRole("navigation", { name: /^Sections for Rex|^אזורים עבור Rex/ });

/** The section bar sits at the bottom of the viewport while the page scrolls. */
async function expectAtBottom(page: Page) {
  const box = await sectionNav(page).boundingBox();
  const vh = page.viewportSize()!.height;
  expect(box).not.toBeNull();
  expect(Math.abs(box!.y + box!.height - vh)).toBeLessThanOrEqual(2);
}

test.describe("Navigation and profile structure", () => {
  for (const viewport of [{ width: 1280, height: 800 }, { width: 375, height: 700 }]) {
    test(`bottom section bar, profile tabs, no medical history (${viewport.width}px)`, async ({ browser }) => {
      const page = await (await browser.newContext({ viewport })).newPage();
      await register(page, "Nav Admin", uniqueEmail("nav"));
      const groupId = await createPet(page, "Rex");
      const base = `/groups/${groupId}`;

      const nav = sectionNav(page);
      await expect(nav.getByRole("link")).toHaveText(SECTIONS);
      await expect(nav.getByRole("link", { name: /Medical|Members/ })).toHaveCount(0);
      await expect(nav.getByRole("link", { name: "Profile" })).toHaveAttribute("aria-current", "page");
      await expectAtBottom(page);

      // Profile section: two tabs; the Members tab keeps the members + invitations functionality.
      const tabs = page.getByRole("navigation", { name: "Profile of Rex" });
      await expect(tabs.getByRole("link", { name: "Pet profile" })).toHaveAttribute("aria-current", "page");
      await tabs.getByRole("link", { name: "Group members" }).click();
      await expect(page).toHaveURL(`${base}/members`);
      await expect(tabs.getByRole("link", { name: "Group members" })).toHaveAttribute("aria-current", "page");
      await expect(page.getByRole("button", { name: "Create link" })).toBeVisible();
      await expect(nav.getByRole("link", { name: "Profile" })).toHaveAttribute("aria-current", "page");
      await expectAtBottom(page);
      await expectNoA11yViolations(page);

      // Last item is reachable and visible even when the bar overflows on a phone.
      await nav.getByRole("link", { name: "Orders" }).click();
      await expect(page).toHaveURL(`${base}/orders`);
      await expect(nav.getByRole("link", { name: "Orders" })).toHaveAttribute("aria-current", "page");
      await expect(nav.getByRole("link", { name: "Orders" })).toBeInViewport();
      await expectAtBottom(page); // short page: still at the viewport bottom
      // At the end of the page the footer is not hidden under the bar.
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const footer = await page.getByRole("contentinfo").boundingBox();
      expect(footer!.y + footer!.height).toBeLessThanOrEqual((await nav.boundingBox())!.y + 1);
      await expectNoA11yViolations(page);

      // Medical history pages are gone from the user-facing structure.
      await page.goto(`${base}/medical`);
      await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    });
  }

  test("keyboard reaches the section bar after the content; RTL in Hebrew", async ({ browser }) => {
    const page = await (await browser.newContext()).newPage();
    await register(page, "נועה", uniqueEmail("navhe"), "he");
    await page.goto("/groups/new");
    await page.getByLabel(/^שם חיית המחמד/).fill("Rex");
    await page.getByLabel(/^סוג/).selectOption("dog");
    await page.getByRole("button", { name: /יצירת/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Rex" })).toBeVisible();
    const groupId = page.url().split("/groups/")[1].split(/[/?]/)[0];

    await page.goto(`/groups/${groupId}/tasks`);
    const nav = sectionNav(page);
    await expect(nav).toBeVisible();
    // Tab through the page until focus lands in the section bar; it must get there, and Enter follows the link.
    let reached = false;
    for (let i = 0; i < 60 && !reached; i++) {
      await page.keyboard.press("Tab");
      reached = await nav.evaluate((el) => el.contains(document.activeElement));
    }
    expect(reached).toBe(true);
    await nav.getByRole("link", { name: "לוח שנה" }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(`/groups/${groupId}/calendar`);
    await expect(nav.getByRole("link", { name: "לוח שנה" })).toHaveAttribute("aria-current", "page");

    // In RTL the first section (Profile) is on the right.
    const first = await nav.getByRole("link").first().boundingBox();
    const second = await nav.getByRole("link").nth(1).boundingBox();
    expect(first!.x).toBeGreaterThan(second!.x);
    await page.goto(`/groups/${groupId}/members`);
    await expect(page.getByRole("navigation", { name: "פרופיל של Rex" }).getByRole("link", { name: "חברי הקבוצה" })).toHaveAttribute("aria-current", "page");
    await expectNoA11yViolations(page);
  });
});
