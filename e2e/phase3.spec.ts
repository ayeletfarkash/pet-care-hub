import { expect, test, type Browser, type Page } from "@playwright/test";
import { createPet, expectNoA11yViolations, register, uniqueEmail } from "./helpers";

/** Admin with a pet, plus a caregiver who joined through an invitation link. */
async function team(browser: Browser) {
  const admin = await (await browser.newContext()).newPage();
  await register(admin, "Ada Admin", uniqueEmail("p3a"));
  const groupId = await createPet(admin, "Rex");
  await admin.goto(`/groups/${groupId}/members`);
  await admin.getByRole("button", { name: "Create link" }).click();
  const link = await admin.getByLabel("Invitation link").inputValue();
  const care = await (await browser.newContext()).newPage();
  await care.goto(link);
  await care.getByRole("link", { name: /Create an account to join|יצירת חשבון להצטרפות/ }).click();
  await register(care, "Cai Caregiver", uniqueEmail("p3c"));
  await expect(care.getByRole("heading", { level: 1, name: "Rex" })).toBeVisible();
  return { admin, care, groupId };
}
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
const ok = (p: Page, text: string | RegExp) => expect(p.getByRole("status").filter({ hasText: text })).toBeVisible();

test.describe("Phase 3 inventory and routines", () => {
  test("inventory and orders: estimate, caregiver updates stock, delivered order restocks once", async ({ browser }) => {
    const { admin, care, groupId } = await team(browser);
    await admin.goto(`/groups/${groupId}/inventory/new`);
    await admin.getByLabel(/^Product name/).fill("Kibble");
    await admin.getByLabel(/^Type/).selectOption("food");
    await admin.getByLabel(/^Unit/).fill("kg");
    await admin.getByLabel(/^Current quantity/).fill("3");
    await admin.getByLabel(/^Estimated use per day/).fill("0.5");
    await admin.getByLabel(/^Low-stock threshold/).fill("2");
    await admin.getByRole("button", { name: "Save" }).click();
    await expect(admin.getByRole("heading", { level: 1, name: "Kibble" })).toBeVisible();
    await expect(admin.getByText("About 6 days left")).toBeVisible();
    await expect(admin.getByText("Reorder soon").first()).toBeVisible(); // ≤ 7 days left

    // Caregiver: no product management, but records use
    await care.goto(`/groups/${groupId}/inventory`);
    await expect(care.getByRole("link", { name: "Add product" })).toHaveCount(0);
    await care.getByRole("link", { name: "Kibble" }).click();
    await expect(care.getByRole("link", { name: "Edit" })).toHaveCount(0);
    await care.getByLabel("What happened?").selectOption("consumption");
    await care.getByLabel(/^Amount/).fill("1");
    await care.getByRole("button", { name: "Save quantity" }).click();
    await ok(care, "Quantity updated.");
    await expect(care.getByRole("table")).toContainText("Cai Caregiver");
    await care.goto("/"); // dashboard reorder reminder
    await expect(care.getByRole("region", { name: "Running low" }).or(care.getByLabel("Running low"))).toContainText("Kibble");

    // Caregiver orders from the product page, then marks it delivered with restock
    await care.goto(`/groups/${groupId}/inventory`);
    await care.getByRole("link", { name: "Kibble" }).click();
    await care.getByRole("link", { name: "Add order" }).click();
    await expect(care.getByLabel(/^Product/).first()).toHaveValue("Kibble");
    await care.getByLabel(/^Quantity/).fill("10");
    await care.getByLabel(/^Store or product link/).fill("javascript:alert(1)");
    await care.getByRole("button", { name: "Save" }).click();
    await expect(care.getByText("Enter a full link starting with https://")).toBeVisible();
    await care.getByLabel(/^Store or product link/).fill("https://shop.example/kibble");
    await care.getByRole("button", { name: "Save" }).click();
    await expect(care.getByRole("heading", { level: 1, name: "Kibble" })).toBeVisible();
    await care.getByLabel("Status", { exact: true }).selectOption("delivered");
    await expect(care.getByRole("checkbox", { name: /When delivered, add 10 kg to Kibble/ })).toBeChecked();
    await care.getByRole("button", { name: "Save status" }).click();
    await ok(care, "Order status updated.");
    await expect(care.getByText("Added to inventory.")).toBeVisible();
    await expect(care.getByRole("link", { name: "Edit" })).toHaveCount(0);
    await care.getByRole("link", { name: "Kibble" }).last().click(); // linked product
    await expect(care.getByText("12 kg").first()).toBeVisible(); // 3 − 1 + 10
  });

  test("routines: admin defines, caregiver logs done and missed; history records both", async ({ browser }) => {
    const { admin, care, groupId } = await team(browser);
    await admin.goto(`/groups/${groupId}/routines/new`);
    await admin.getByLabel(/^Activity/).fill("Morning walk");
    await admin.getByLabel("Responsible person").selectOption({ label: "Cai Caregiver" });
    await expect(admin.getByLabel("Time 2")).toHaveCount(0);
    await admin.getByRole("button", { name: "Add time" }).click();
    await expect(admin.getByLabel("Time 2")).toBeFocused();
    await admin.getByLabel("Time 1").fill("00:00");
    await admin.getByLabel(/^Start date/).fill(daysAgo(1));
    await admin.getByRole("button", { name: "Save" }).click();
    await expect(admin.getByRole("heading", { level: 1, name: "Morning walk" })).toBeVisible();

    await care.goto(`/groups/${groupId}/routines/new`);
    await expect(care.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await care.goto("/"); // assigned activity on the dashboard
    await care.getByRole("button", { name: /^Mark as done: Morning walk/ }).click();
    await ok(care, "Activity logged.");
    await care.goto(`/groups/${groupId}/routines`);
    await care.getByRole("button", { name: /^Report missed: Morning walk/ }).click(); // yesterday's
    await ok(care, "Missed activity recorded.");
    await care.getByRole("link", { name: "Morning walk" }).click();
    await care.getByRole("button", { name: "Log activity" }).click(); // extra walk
    await ok(care, "Activity logged.");
    const table = care.getByRole("table");
    await expect(table).toContainText("Missed");
    await expect(table).toContainText("Extra activity");
    await expect(table.getByText("Done")).toHaveCount(2);
  });

  test("automated WCAG checks on Phase 3 pages (incl. RTL)", async ({ browser }) => {
    const { admin, groupId } = await team(browser);
    const base = `/groups/${groupId}`;
    for (const p of ["/inventory", "/inventory/new", "/orders", "/orders/new", "/routines", "/routines/new"]) {
      await admin.goto(base + p);
      await expectNoA11yViolations(admin);
    }
    await admin.goto("/profile");
    await admin.getByLabel("Preferred language").selectOption("he");
    await admin.getByRole("button", { name: "Save", exact: true }).click();
    for (const p of ["/inventory/new", "/orders/new", "/routines"]) {
      await admin.goto(base + p);
      await expect(admin.locator("html")).toHaveAttribute("dir", "rtl");
      await expectNoA11yViolations(admin);
    }
  });
});
