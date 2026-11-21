import { expect, test, type Browser, type Page } from "@playwright/test";
import { createPet, expectNoA11yViolations, register, uniqueEmail } from "./helpers";

/** Admin with a pet, plus a caregiver who joined through an invitation link. */
async function team(browser: Browser) {
  const admin = await (await browser.newContext()).newPage();
  await register(admin, "Ada Admin", uniqueEmail("p2a"));
  const groupId = await createPet(admin, "Rex");
  await admin.goto(`/groups/${groupId}/members`);
  await admin.getByRole("button", { name: "Create link" }).click();
  const link = await admin.getByLabel("Invitation link").inputValue();
  const care = await (await browser.newContext()).newPage();
  await care.goto(link);
  await care.getByRole("link", { name: /Create an account to join|יצירת חשבון להצטרפות/ }).click();
  await register(care, "Cai Caregiver", uniqueEmail("p2c"));
  await expect(care.getByRole("heading", { level: 1, name: "Rex" })).toBeVisible();
  return { admin, care, groupId };
}
const yesterday = () => new Date(Date.now() - 86_400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
const ok = (p: Page, text: string | RegExp) => expect(p.getByRole("status").filter({ hasText: text })).toBeVisible();

test.describe("Phase 2 daily care", () => {
  test("medications: admin plans, caregiver confirms a scheduled dose; dose and plan permissions hold", async ({ browser }) => {
    const { admin, care, groupId } = await team(browser);
    await admin.goto(`/groups/${groupId}/medications`);
    await admin.getByRole("link", { name: "Add medication plan" }).click();
    await admin.getByLabel(/^Medication or treatment/).fill("Apoquel");
    await admin.getByLabel(/^Dosage/).fill("1 tablet (16 mg)");
    await admin.getByLabel("Responsible caregiver").selectOption({ label: "Cai Caregiver" });
    await admin.getByLabel("Dose time 1").fill("00:00");
    await admin.getByLabel(/^Start date/).fill(yesterday());
    await admin.getByRole("button", { name: "Save" }).click();
    await expect(admin.getByRole("heading", { level: 1, name: "Apoquel" })).toBeVisible();
    await expect(admin.getByText("Every day at 00:00")).toBeVisible();

    // Caregiver: no plan management, but can confirm the scheduled dose
    await care.goto(`/groups/${groupId}/medications`);
    await expect(care.getByRole("link", { name: "Add medication plan" })).toHaveCount(0);
    await care.getByRole("button", { name: /^Mark as given: Apoquel/ }).first().click();
    await ok(care, "Dose recorded.");
    await care.goto("/"); // dashboard shows today's dose for the responsible caregiver
    await expect(care.getByRole("region", { name: "My medications today" }).or(care.getByLabel("My medications today"))).toContainText("Apoquel");

    await admin.goto(`/groups/${groupId}/medications`);
    await admin.getByRole("link", { name: "Apoquel" }).click();
    await expect(admin.getByRole("table")).toContainText("Cai Caregiver");
    await care.goto(`/groups/${groupId}/medications/new`);
    await expect(care.getByRole("heading", { name: "Page not found" })).toBeVisible();
  });

  test("tasks and calendar: assignment shows on the dashboard; caregiver completes; events can be completed", async ({ browser }) => {
    const { admin, care, groupId } = await team(browser);
    await admin.goto(`/groups/${groupId}/tasks/new`);
    await admin.getByLabel(/^Task/).fill("Buy dog food");
    await admin.getByLabel("Due date").fill(today());
    await admin.getByRole("checkbox", { name: "Cai Caregiver" }).check();
    await admin.getByRole("button", { name: "Save" }).click();
    await expect(admin.getByRole("heading", { level: 1, name: "Buy dog food" })).toBeVisible();

    // Custom repeat interval chosen by the user
    await admin.goto(`/groups/${groupId}/tasks/new`);
    await admin.getByLabel(/^Task/).fill("Clean litter box");
    await admin.getByLabel("Due date").fill(today());
    await admin.getByLabel(/^Repeats/).selectOption("daily");
    await admin.getByLabel("Every how many days?").fill("3");
    await admin.getByRole("button", { name: "Save" }).click();
    await expect(admin.getByText("Every 3 days")).toBeVisible();

    await care.goto("/");
    await care.getByRole("link", { name: "Buy dog food" }).click();
    await expect(care.getByRole("link", { name: "Edit" })).toHaveCount(0);
    await care.getByRole("button", { name: "Mark completed" }).click();
    await ok(care, "Task updated.");
    await expect(care.getByText("Completed", { exact: true }).first()).toBeVisible();

    await care.goto(`/groups/${groupId}/events/new`);
    await care.getByLabel(/^Type/).selectOption("vet");
    await care.getByLabel(/^Title/).fill("Annual checkup");
    await care.getByLabel(/^Time/).fill("10:30");
    await care.getByRole("button", { name: "Save" }).click();
    await expect(care.getByRole("heading", { level: 1, name: "Annual checkup" })).toBeVisible();
    await care.goto(`/groups/${groupId}/calendar`);
    await care.getByRole("button", { name: /^Mark completed: Annual checkup/ }).click();
    await ok(care, "Status updated.");
  });

  test("automated WCAG checks on Phase 2 pages (incl. RTL)", async ({ browser }) => {
    const { admin, groupId } = await team(browser);
    const base = `/groups/${groupId}`;
    for (const p of ["/medications", "/medications/new", "/calendar", "/events/new", "/tasks", "/tasks/new"]) {
      await admin.goto(base + p);
      await expectNoA11yViolations(admin);
    }
    await admin.goto("/");
    await expectNoA11yViolations(admin);
    await admin.goto("/profile");
    await admin.getByLabel("Preferred language").selectOption("he");
    await admin.getByRole("button", { name: "Save", exact: true }).click();
    for (const p of ["/medications/new", "/calendar", "/tasks/new"]) {
      await admin.goto(base + p);
      await expect(admin.locator("html")).toHaveAttribute("dir", "rtl");
      await expectNoA11yViolations(admin);
    }
  });
});
