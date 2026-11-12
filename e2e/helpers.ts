import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

export const uniqueEmail = (p: string) => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;

/** Visitors default to Hebrew; set the visitor language cookie for English-label tests. */
export async function useEnglish(page: Page) {
  await page.context().addCookies([{ name: "pch_locale", value: "en", url: page.url().startsWith("http") ? page.url() : "http://localhost:3100" }]);
}

export async function register(page: Page, name: string, email: string, locale: "en" | "he" = "en") {
  await page.goto("/register");
  await page.getByLabel(/Full name|שם מלא/).fill(name);
  await page.getByLabel(/^Email|^דוא"ל/).fill(email);
  await page.getByLabel(/^Password|^סיסמה/).fill("password123");
  await page.getByLabel(/Preferred language|שפה מועדפת/).selectOption(locale);
  await page.getByRole("button", { name: /Create account|יצירת חשבון/ }).click();
}

export async function createPet(page: Page, name: string, species = "dog") {
  await page.goto("/groups/new");
  await page.getByLabel(/^Pet name/).fill(name);
  await page.getByLabel(/^Species/).selectOption(species);
  await page.getByRole("button", { name: "Create pet group" }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  return page.url().split("/groups/")[1].split(/[/?]/)[0];
}

/** WCAG 2.x A/AA automated checks. Fails with a readable list of violations. */
export async function expectNoA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const summary = results.violations.map((v) => `${v.id} (${v.impact}): ${v.help} -> ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
  expect(summary, `axe violations on ${page.url()}`).toEqual([]);
}
