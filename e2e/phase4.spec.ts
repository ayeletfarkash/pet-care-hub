import { expect, test, type Page } from "@playwright/test";
import { createPet, expectNoA11yViolations, register, uniqueEmail } from "./helpers";

/** Israel wall-clock time `min` minutes from now. */
const local = (min: number) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(Date.now() + min * 60_000)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
};
const ok = (p: Page, text: string | RegExp) => expect(p.getByRole("status").filter({ hasText: text })).toBeVisible();

test.describe("Phase 4 notifications", () => {
  test("a due task reaches the inbox; it can be completed from there; preferences and reminder rules save", async ({ page }) => {
    await register(page, "Nia Notify", uniqueEmail("p4"));
    const groupId = await createPet(page, "Rex");

    // A task due a few minutes ago, assigned to me
    const due = local(-3);
    await page.goto(`/groups/${groupId}/tasks/new`);
    await page.getByLabel(/^Task/).fill("Refill water");
    await page.getByLabel("Due date").fill(due.date);
    await page.getByLabel("Due time").fill(due.time);
    await page.getByRole("checkbox", { name: "Nia Notify" }).check();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Refill water" })).toBeVisible();

    // Reminder rule on the task page
    const reminders = page.getByRole("region", { name: "Reminders" });
    await reminders.getByLabel("Who gets the reminder").selectOption("selected");
    await reminders.getByRole("button", { name: "Save reminders" }).click();
    await expect(reminders.getByText("Choose at least one person.")).toBeVisible();
    await reminders.getByRole("checkbox", { name: "Nia Notify" }).check();
    await reminders.getByRole("button", { name: "Save reminders" }).click();
    await expect(reminders.getByText("Reminder settings saved.")).toBeVisible();

    // Inbox (the layout runs the sweep), header count, accessibility
    await expect(async () => { // page-load sweeps run at most every 5 s
      await page.goto("/notifications");
      await expect(page.getByText("Task due: Refill water for Rex")).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 20_000 });
    const item = page.getByRole("listitem").filter({ hasText: "Task due: Refill water for Rex" });
    await expect(item).toBeVisible();
    await expect(page.getByRole("link", { name: /Notifications.*1 unread/ })).toBeVisible();
    await expectNoA11yViolations(page);

    await item.getByRole("button", { name: "Mark task as completed: Refill water" }).click();
    await ok(page, "Task updated");
    await expect(item.getByRole("button", { name: /Mark task as completed/ })).toHaveCount(0);
    await page.getByRole("button", { name: "Mark all as read" }).click();
    await ok(page, "All notifications marked as read.");
    await expect(page.getByRole("link", { name: /unread/ })).toHaveCount(0);

    // Personal preferences
    await page.goto("/profile");
    const prefs = page.getByRole("region", { name: "Notification preferences" });
    await prefs.getByRole("checkbox", { name: "Tasks" }).uncheck();
    await prefs.getByRole("button", { name: "Save notification preferences" }).click();
    await expect(prefs.getByText("Changes saved.")).toBeVisible();
    await page.reload();
    await expect(page.getByRole("region", { name: "Notification preferences" }).getByRole("checkbox", { name: "Tasks" })).not.toBeChecked();
    await expectNoA11yViolations(page);
  });
});
