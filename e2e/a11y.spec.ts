import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { makePlan, seed } from "./helpers";

const ROUTES = ["/", "/plan", "/tasks", "/capture", "/week", "/message", "/settings", "/insights", "/reflect", "/how"];
const THEMES = ["light", "dark", "hc"] as const;

for (const theme of THEMES) {
  test.describe(`axe · ${theme}`, () => {
    test(`every route is free of WCAG 2.2 A/AA violations`, async ({ page }) => {
      test.setTimeout(180_000);
      await seed(page, { theme });
      await makePlan(page);
      const failures: string[] = [];
      for (const route of ROUTES) {
        await page.goto(route);
        await page.waitForLoadState("networkidle");
        const results = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
          .disableRules(["color-contrast-enhanced"])
          .analyze();
        for (const v of results.violations) {
          failures.push(`${route} [${theme}] ${v.id}: ${v.help} (${v.nodes.length} node${v.nodes.length === 1 ? "" : "s"}) e.g. ${v.nodes[0]?.target?.join(" ")}`);
        }
      }
      expect(failures, failures.join("\n")).toEqual([]);
    });
  });
}

test("focus mode and the landing page pass too", async ({ page }) => {
  await seed(page, { theme: "light" });
  await makePlan(page);
  await page.goto("/focus");
  await page.waitForLoadState("networkidle");
  const focus = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(focus.violations.map((v) => `${v.id}: ${v.help} e.g. ${v.nodes[0]?.target?.join(" ")}`)).toEqual([]);

  await page.evaluate(async () => {
    const { db } = await import(/* @vite-ignore */ ("/src/data/" + "db.ts"));
    await db.settings.update("app", { onboarded: false });
  });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const landing = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(landing.violations.map((v) => `${v.id}: ${v.help} e.g. ${v.nodes[0]?.target?.join(" ")}`)).toEqual([]);
});
