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
    // Snooze: a new reminder later; the task's own state is untouched
    await item.getByText("Snooze", { exact: true }).and(item.locator("summary")).click();
    await item.getByLabel("Snooze until").selectOption("custom");
    await item.getByLabel("Date and time").fill("2000-01-01T08:00");
    await item.locator("form").getByRole("button", { name: "Snooze: Task due: Refill water for Rex" }).click();
    await expect(item.getByText("Choose a time in the next 30 days.")).toBeVisible();
    await item.getByLabel("Snooze until").selectOption("60");
    await item.locator("form").getByRole("button", { name: "Snooze: Task due: Refill water for Rex" }).click();
    await ok(page, /Snoozed. You'll be reminded again then/);
    await expect(page.getByRole("region", { name: "Snoozed" })).toContainText("Task due: Refill water for Rex");
    await expectNoA11yViolations(page);

    await expect(page.getByRole("link", { name: /unread/ })).toHaveCount(0); // snoozing marked the original read
    await expect(page.getByRole("button", { name: "Mark all as read" })).toHaveCount(0);

    // Personal preferences
    await page.goto("/profile");
    const prefs = page.getByRole("region", { name: "Notification preferences" });
    await prefs.getByRole("checkbox", { name: "Tasks" }).uncheck();
    await prefs.getByRole("button", { name: "Save notification preferences" }).click();
    await expect(prefs.getByText("Changes saved.")).toBeVisible();
    await page.reload();
    await expect(page.getByRole("region", { name: "Notification preferences" }).getByRole("checkbox", { name: "Tasks" })).not.toBeChecked();
    // Push section (the test server has dummy keys; permission is only asked after the button press)
    const push = page.getByRole("region", { name: "Phone notifications" });
    await expect(push.getByRole("status")).toHaveText("Notifications are off for this device.");
    await expect(push.getByRole("button", { name: "Turn on notifications on this device" })).toBeVisible();
    await expectNoA11yViolations(page);

    // PWA plumbing
    const manifest = await (await page.request.get("/manifest.webmanifest")).json();
    expect(manifest.display).toBe("standalone");
    expect((await page.request.get("/pwa-icon/192")).headers()["content-type"]).toContain("image/png");
    expect((await page.request.get("/pwa-icon/77")).status()).toBe(404);
    expect(await (await page.request.get("/sw.js")).text()).toContain("notificationclick");
  });

  test("an appointment with a prep task opt-in creates the task automatically", async ({ page }) => {
    await register(page, "Ari Auto", uniqueEmail("p4auto"));
    const groupId = await createPet(page, "Bo");
    const when = local(600); // in 10 hours: inside the day-before window
    await page.goto(`/groups/${groupId}/events/new`);
    await page.getByLabel(/^Type/).selectOption("vet");
    await page.getByLabel(/^Title/).fill("Dental cleaning");
    await page.getByLabel(/^Date/).fill(when.date);
    await page.getByLabel(/^Time/).fill(when.time);
    await page.getByLabel("Responsible person").selectOption({ label: "Ari Auto" });
    await page.getByRole("checkbox", { name: "Create a preparation task the day before" }).check();
    await expectNoA11yViolations(page);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Dental cleaning" })).toBeVisible();

    await expect(async () => { // created by the sweep that runs on page loads after a write
      await page.goto(`/groups/${groupId}/tasks`);
      await expect(page.getByRole("link", { name: "Prepare for: Dental cleaning" })).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 20_000 });
    await page.getByRole("link", { name: "Prepare for: Dental cleaning" }).click();
    await expect(page.getByText("Created automatically the day before the appointment.")).toBeVisible();
    await expect(page.getByRole("region", { name: "History" })).toContainText("Created automatically · Automatic");
  });

  test("global search finds group data, filters it, and is accessible in both languages", async ({ page }) => {
    await register(page, "Sam Search", uniqueEmail("p4s"));
    const groupId = await createPet(page, "Pickles");
    await page.goto(`/groups/${groupId}/tasks/new`);
    await page.getByLabel(/^Task/).fill("Trim Pickles nails");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Trim Pickles nails" })).toBeVisible();

    await page.getByRole("link", { name: "Search" }).click();
    await page.getByRole("searchbox", { name: "Search for" }).fill("pickles");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.locator("#search-summary")).toContainText("2 results for");
    await expect(page.getByRole("heading", { level: 2, name: /Search results: 2 results for/ })).toBeFocused(); // screen readers land on the outcome
    await expect(page.getByRole("region", { name: /Pets/ }).getByRole("link", { name: "Pickles" })).toBeVisible();
    await expect(page.getByRole("region", { name: /Tasks/ }).getByRole("link", { name: "Trim Pickles nails" })).toBeVisible();
    await expectNoA11yViolations(page);

    await page.getByLabel("Status").selectOption("closed");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.locator("#search-summary")).toContainText("No results for");
    await expect(page).toHaveURL(/status=closed/); // filters live in the URL (shareable, back button works)

    await page.goto("/profile");
    await page.getByLabel("Preferred language").selectOption("he");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.goto("/search?q=pickles");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("#search-summary")).toContainText("2 תוצאות");
    await expectNoA11yViolations(page);
  });

  test("dashboard shows insights at a glance, linking to the filtered insights page", async ({ page }) => {
    await register(page, "Ines Insight", uniqueEmail("p4i"));
    const groupId = await createPet(page, "Nala");
    await page.goto("/");
    await expect(page.getByRole("region", { name: "At a glance" })).toContainText("All clear");

    await page.goto(`/groups/${groupId}/inventory/new`);
    await page.getByLabel(/^Product name/).fill("Salmon kibble");
    await page.getByLabel(/^Type/).selectOption("food");
    await page.getByLabel(/^Current quantity/).fill("0");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Salmon kibble" })).toBeVisible();

    await page.goto("/");
    const glance = page.getByRole("region", { name: "At a glance" });
    await glance.getByRole("link", { name: "Nala: Out of stock or below the threshold: 1" }).click();
    await expect(page).toHaveURL(/\/insights\?group=.*category=inventory/);
    await expect(page.getByLabel("Topic")).toHaveValue("inventory");
    const card = page.getByRole("region", { name: "Out of stock or below the threshold: 1" });
    await expect(card.getByRole("link", { name: "Salmon kibble" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Nala" })).not.toContainText("Overdue tasks"); // category filter applied
    await expectNoA11yViolations(page);
    await page.goto("/");
    await expectNoA11yViolations(page);
  });
});
