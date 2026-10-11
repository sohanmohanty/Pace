import { expect, type Page } from "@playwright/test";

/** Skip onboarding and load the sample tasks through the app's own code. */
export async function seed(page: Page, opts: { demo?: boolean; theme?: "light" | "dark" | "hc" } = {}) {
  await page.goto("/");
  await page.evaluate(async ({ demo, theme }) => {
    const { db } = await import(/* @vite-ignore */ ("/src/data/" + "db.ts"));
    const { loadDemoData } = await import(/* @vite-ignore */ ("/src/data/" + "demo.ts"));
    await db.settings.put({
      id: "app",
      onboarded: true,
      largeText: false,
      highContrast: theme === "hc",
      reduceMotion: true,
      theme: theme ?? "light",
      aiEnabled: true
    });
    if (demo) await loadDemoData();
  }, { demo: opts.demo ?? true, theme: opts.theme });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

export async function makePlan(page: Page) {
  const slider = page.getByRole("slider", { name: "Capacity" });
  await expect(slider).toBeVisible();
  await slider.focus();
  await slider.press("End");
  for (let i = 0; i < 40; i++) await slider.press("ArrowLeft");
  await page.getByRole("button", { name: "Make today's plan" }).click();
  await expect(page.getByRole("region", { name: "Today's plan" })).toBeVisible();
}
