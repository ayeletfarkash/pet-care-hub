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
  test("medications: admin plans, caregiver confirms a scheduled dose; the other member can manage plans too", async ({ browser }) => {
    const { admin, care, groupId } = await team(browser);
    await admin.goto(`/groups/${groupId}/medications`);
    await admin.getByRole("link", { name: "Add medication plan" }).click();
    await admin.getByLabel(/^Medication or treatment/).fill("Apoquel");
    await admin.getByLabel(/^Dosage/).fill("1 tablet (16 mg)");
    await admin.getByLabel("Responsible caregiver").selectOption({ label: "Cai Caregiver" });
    await expect(admin.getByLabel("Dose time 3")).toBeVisible();
    await expect(admin.getByLabel("Dose time 4")).toHaveCount(0);
    await admin.getByRole("button", { name: "Add time" }).click();
    await expect(admin.getByLabel("Dose time 4")).toBeFocused();
    await admin.getByLabel("Dose time 1").fill("00:00");
    await admin.getByLabel(/^Start date/).fill(yesterday());
    await admin.getByRole("button", { name: "Save" }).click();
    await expect(admin.getByRole("heading", { level: 1, name: "Apoquel" })).toBeVisible();
    await expect(admin.getByText("Every day at 00:00")).toBeVisible();

    // The other member can also manage plans, and confirms the scheduled dose
    await care.goto(`/groups/${groupId}/medications`);
    await expect(care.getByRole("link", { name: "Add medication plan" })).toBeVisible();
    const dose = care.getByRole("checkbox", { name: /^Mark as given: Apoquel/ }).first();
    await dose.check();
    await ok(care, "Dose recorded.");
    await care.reload();
    await expect(dose).toHaveAccessibleDescription(/already recorded/);
    await dose.press("Space"); // a recorded dose is locked: unchecking must not delete the record
    await ok(care, "This dose is already recorded.");
    await expect(dose).toBeChecked();
    await care.goto("/"); // dashboard shows today's dose for the responsible caregiver
    await expect(care.getByRole("region", { name: "My medications today" }).or(care.getByLabel("My medications today"))).toContainText("Apoquel");

    await admin.goto(`/groups/${groupId}/medications`);
    await admin.getByRole("link", { name: "Apoquel" }).click();
    await expect(admin.getByRole("table")).toContainText("Cai Caregiver");
    await care.goto(`/groups/${groupId}/medications/new`);
    await expect(care.getByRole("heading", { name: "Page not found" })).toHaveCount(0);
    await expect(care.getByRole("button", { name: "Save" })).toBeVisible();
  });

  test("tasks and calendar: assignment shows on the dashboard; caregiver completes; events can be completed", async ({ browser }) => {
    const { admin, care, groupId } = await team(browser);
    await admin.goto(`/groups/${groupId}/tasks/new`);
    await admin.getByLabel(/^Task/).fill("Buy dog food");
    await admin.getByLabel("Due date").fill(today());
    await admin.getByRole("checkbox", { name: "Cai Caregiver" }).check();
    await admin.getByRole("button", { name: "Save" }).click();
    await expect(admin.getByRole("heading", { level: 1, name: "Buy dog food" })).toBeVisible();

    // Custom repeat interval chosen by the user; selects survive a failed submit (missing title)
    await admin.goto(`/groups/${groupId}/tasks/new`);
    await admin.getByLabel(/^Repeats/).selectOption("weekly");
    await admin.getByLabel("Priority").selectOption("high");
    await admin.getByRole("button", { name: "Save" }).click();
    await expect(admin.getByRole("alert").filter({ hasText: /./ }).first()).toBeVisible();
    await expect(admin.getByLabel(/^Repeats/)).toHaveValue("weekly");
    await expect(admin.getByLabel("Priority")).toHaveValue("high");
    await admin.getByLabel(/^Task/).fill("Clean litter box");
    await admin.getByLabel("Due date").fill(today());
    await admin.getByLabel(/^Repeats/).selectOption("daily");
    await admin.getByLabel("Every how many days?").fill("3");
    await admin.getByRole("button", { name: "Save" }).click();
    await expect(admin.getByText("Every 3 days")).toBeVisible();

    await care.goto("/");
    await care.getByRole("link", { name: "Buy dog food" }).click();
    await expect(care.getByRole("link", { name: "Edit" })).toBeVisible();
    const done = care.getByRole("checkbox", { name: "Mark completed" });
    await done.focus();
    await care.keyboard.press("Enter"); // must not submit anything
    await expect(care.getByRole("main").getByRole("alert")).toHaveCount(0);
    await care.keyboard.press("Space");
    await ok(care, "Task completed.");
    await expect(care.locator("li", { hasText: /^Completed/ })).toBeVisible();
    await care.waitForTimeout(400); // past the delayed focus fallback
    await expect(done).toBeFocused(); // still there, so focus stays: Space again undoes it
    await expect(care.getByText("Completed", { exact: true }).first()).toBeVisible();
    await care.keyboard.press("Space"); // again reopens it
    await expect(care.locator("li", { hasText: /^Reopened/ })).toBeVisible();
    await expect(done).not.toBeChecked();
    await care.goto(`/groups/${groupId}/tasks`);
    await care.getByRole("checkbox", { name: "Mark completed: Buy dog food" }).check();
    await ok(care, "Task completed.");
    await care.goto(`/groups/${groupId}/tasks?view=done`);
    await expect(care.getByRole("checkbox", { name: "Mark completed: Buy dog food" })).toBeChecked();

    await care.goto(`/groups/${groupId}/events/new`);
    await care.getByLabel(/^Type/).selectOption("vet");
    await care.getByLabel(/^Title/).fill("Annual checkup");
    await care.getByLabel(/^Time/).fill("10:30");
    await care.getByRole("button", { name: "Save" }).click();
    await expect(care.getByRole("heading", { level: 1, name: "Annual checkup" })).toBeVisible();
    await care.goto(`/groups/${groupId}/calendar`);
    await expect(care.getByRole("navigation", { name: "Calendar display" }).getByRole("link", { name: "List" })).toHaveAttribute("aria-current", "page"); // the default
    const event = care.getByRole("checkbox", { name: /^Mark completed: Annual checkup/ });
    await event.check();
    await ok(care, "Status updated.");
    const row = care.locator("li", { hasText: "Annual checkup" });
    await expect(row.getByText("Completed")).toBeVisible();
    await event.uncheck();
    await expect(row.getByText("Completed")).toHaveCount(0);
    const task = care.getByRole("checkbox", { name: "Mark completed: Buy dog food" }); // completed above, still listed
    await expect(task).toBeChecked();
    await task.uncheck();
    await ok(care, "Task reopened.");
    await task.check();
    await ok(care, "Task completed.");
  });

  test("calendar view: month grid, and picking a day opens it in the list", async ({ browser }) => {
    const { admin: page, groupId } = await team(browser);
    await page.goto(`/groups/${groupId}/events/new`);
    await page.getByLabel(/^Type/).selectOption("grooming");
    await page.getByLabel(/^Title/).fill("Grooming day");
    await page.getByLabel(/^Date/).fill("2026-11-18");
    await page.getByLabel(/^Time/).fill("10:30");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Grooming day" })).toBeVisible();

    await page.goto(`/groups/${groupId}/calendar?month=2026-11`);
    await page.getByRole("navigation", { name: "Calendar display" }).getByRole("link", { name: "Calendar" }).click();
    const grid = page.getByRole("table", { name: "November 2026" });
    await expect(grid).toBeVisible();
    await expect(page.getByRole("columnheader").first()).toContainText("Sunday");
    await expect(grid.getByRole("cell").filter({ hasText: "Grooming day" })).toHaveCount(1);
    await expect(page.getByRole("main").getByRole("checkbox")).toHaveCount(0); // overview only; acting happens in the list
    await page.getByRole("link", { name: "Next month" }).click();
    await expect(page.getByRole("table", { name: "December 2026" })).toBeVisible(); // stays in calendar view
    await page.getByRole("link", { name: "Previous month" }).click();

    await page.getByRole("link", { name: /18 November, activities: 1$/ }).click();
    await expect(page).toHaveURL(/calendar\?day=2026-11-18$/);
    await expect(page.getByRole("heading", { level: 3, name: /18 November/ })).toBeFocused();
    await expect(page.getByRole("checkbox", { name: /^Mark completed: Grooming day/ })).toBeVisible();
    await page.goBack();
    await page.getByRole("link", { name: /19 November, activities: 0$/ }).click(); // an empty day
    await expect(page.getByRole("heading", { level: 3, name: /19 November/ })).toBeFocused();
    await expect(page.getByText("Nothing scheduled on this day.")).toBeVisible();
    for (const bad of ["day=2026-02-31", "day=x", "day=2026-13-01", "month=2026-99&view=calendar", "month=9999-12&view=calendar"]) {
      await page.goto(`/groups/${groupId}/calendar?${bad}`);
      await expect(page.getByRole("heading", { level: 1, name: "Calendar" })).toBeVisible();
    }

    await page.setViewportSize({ width: 320, height: 700 }); // reflow
    await page.goto(`/groups/${groupId}/calendar?view=calendar&month=2026-11`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expectNoA11yViolations(page);
  });

  test("tasks: custom reminder time on create; admin deletes permanently after confirming", async ({ browser }) => {
    const { admin, groupId } = await team(browser);
    await admin.addInitScript(() => { Reflect.deleteProperty(window, "PushManager"); }); // a browser without push
    await admin.goto(`/groups/${groupId}/tasks/new`);
    await expect(admin.getByText("Without a time the task is due")).toHaveCount(0); // hint removed
    await expect(admin.getByLabel("Reminder", { exact: true })).toHaveAccessibleDescription(/This browser doesn't support notifications/);
    await admin.getByLabel(/^Task/).fill("Vet call");
    await admin.getByLabel("Reminder", { exact: true }).selectOption("custom");
    await admin.getByLabel("Reminder date and time").fill(`${yesterday()}T09:00`);
    await admin.getByRole("button", { name: "Save" }).click();
    await expect(admin.getByText("Choose a time in the future.")).toBeVisible();
    const tomorrow = new Date(Date.now() + 86_400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
    await admin.getByLabel("Reminder date and time").fill(`${tomorrow}T09:00`);
    await admin.getByRole("button", { name: "Save" }).click();
    await expect(admin.getByRole("heading", { level: 1, name: "Vet call" })).toBeVisible();
    await expect(admin.getByLabel("When to remind")).toHaveValue("custom");
    await expect(admin.getByLabel("Reminder date and time")).toHaveValue(`${tomorrow}T09:00`);
    await expectNoA11yViolations(admin);

    // Narrow phone, largest content: nothing overflows
    await admin.goto(`/groups/${groupId}/tasks/new`);
    await admin.getByLabel(/^Task/).fill("Another task with a fairly long descriptive title");
    await admin.getByRole("button", { name: "Save" }).click();
    await expect(admin.getByRole("heading", { level: 1, name: /^Another task/ })).toBeVisible();
    await admin.setViewportSize({ width: 320, height: 700 });
    await admin.goto(`/groups/${groupId}/tasks`);
    expect(await admin.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await admin.getByRole("button", { name: "Delete task: Vet call" }).click();
    const dialog = admin.getByRole("dialog", { name: "Permanently delete Vet call?" });
    await expect(dialog).toContainText("can't be undone");
    await expectNoA11yViolations(admin);
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(admin.getByRole("link", { name: "Vet call" })).toBeVisible();
    await admin.getByRole("button", { name: "Delete task: Vet call" }).click();
    await dialog.getByRole("button", { name: "Delete permanently" }).click();
    await ok(admin, "Task deleted.");
    await expect(admin.getByRole("link", { name: "Vet call" })).toHaveCount(0);
    await expect(admin.getByRole("link", { name: /^Another task/ })).toBeFocused(); // focus moves to the neighbouring row
    await admin.getByRole("link", { name: /^Another task/ }).click();
    await expect(admin.getByRole("heading", { level: 1, name: /^Another task/ })).toBeVisible();
    await admin.getByRole("button", { name: "Delete task", exact: true }).click(); // not the list's "Delete task: …"
    await admin.getByRole("dialog").getByRole("button", { name: "Delete permanently" }).click();
    await expect(admin).toHaveURL(/\/tasks\?notice=task_deleted/);
    await expect(admin.getByRole("main").getByText("Task deleted.")).toBeVisible();
  });

  test("automated WCAG checks on Phase 2 pages (incl. RTL)", async ({ browser }) => {
    const { admin, groupId } = await team(browser);
    const base = `/groups/${groupId}`;
    for (const p of ["/medications", "/medications/new", "/calendar", "/calendar?view=calendar", "/events/new", "/tasks", "/tasks/new"]) {
      await admin.goto(base + p);
      await expectNoA11yViolations(admin);
    }
    await admin.goto("/");
    await expectNoA11yViolations(admin);
    await admin.goto("/profile");
    await admin.getByLabel("Preferred language").selectOption("he");
    await admin.getByRole("button", { name: "Save", exact: true }).click();
    for (const p of ["/medications/new", "/calendar", "/calendar?view=calendar", "/tasks/new"]) {
      await admin.goto(base + p);
      await expect(admin.locator("html")).toHaveAttribute("dir", "rtl");
      await expectNoA11yViolations(admin);
    }
  });
});
