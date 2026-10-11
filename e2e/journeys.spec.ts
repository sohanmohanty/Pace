import { expect, test } from "@playwright/test";
import { makePlan, seed } from "./helpers";

test.describe("first run", () => {
  test("landing shows the live dial and leads into onboarding", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("plans around how you actually feel");
    const slider = page.getByRole("slider", { name: "Capacity" });
    await expect(slider).toBeVisible();
    const before = await page.getByText(/steps ·/).first().textContent();
    await slider.focus();
    await slider.press("Home");
    await expect.poll(async () => page.getByText(/steps ·/).first().textContent()).not.toBe(before);
    await page.getByRole("link", { name: /Start, no sign-up/ }).click();
    await expect(page).toHaveURL(/onboarding/);
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: /example tasks/ }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("slider", { name: "Capacity" })).toBeVisible();
  });
});

test.describe("check in, plan, focus, replan", () => {
  test("the dial reshapes the preview and a plan is made, then upgraded by the mock planner", async ({ page }) => {
    await seed(page);
    const slider = page.getByRole("slider", { name: "Capacity" });
    await slider.focus();
    await slider.press("Home");
    await expect(page.getByText(/a very low day/)).toBeVisible();
    await slider.press("End");
    await expect(page.getByText(/high-energy day/)).toBeVisible();
    await makePlan(page);
    await expect(page.locator('[data-plan-source="ai"][data-ai-phase="done"]')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("checkbox", { name: /^Mark/ }).first()).toBeVisible();
  });

  test("focus mode completes a step and records a session", async ({ page }) => {
    await seed(page);
    await makePlan(page);
    await page.getByRole("button", { name: "Start next" }).click();
    await expect(page).toHaveURL(/focus/);
    await expect(page.getByRole("button", { name: /Done\. That counts/ })).toBeVisible();
    await page.getByRole("button", { name: /Done\. That counts/ }).click();
    await expect(page).toHaveURL(/focus|reflect/);
    const sessions = await page.evaluate(async () => {
      const { db } = await import(/* @vite-ignore */ ("/src/data/" + "db.ts"));
      return db.sessions.toArray();
    });
    expect(sessions.length).toBeGreaterThan(0);
    expect(sessions[0].outcome).toBe("done");
  });

  test("replan in plain words keeps completed steps", async ({ page }) => {
    await seed(page);
    await makePlan(page);
    await expect(page.locator('[data-plan-source="ai"][data-ai-phase="done"]')).toBeVisible({ timeout: 20_000 });
    const first = page.getByRole("checkbox", { name: /^Mark/ }).first();
    await first.click();
    await expect(page.getByRole("checkbox", { name: /^Mark/, checked: true })).toHaveCount(1);
    await page.getByRole("textbox", { name: /Change something/ }).fill("nothing with reading tonight, 40 minutes");
    await page.getByRole("button", { name: /Replan with this change/ }).click();
    await expect(page.locator('[data-plan-source="ai"][data-ai-phase="done"]')).toBeVisible({ timeout: 20_000 });
    const done = await page.getByRole("checkbox", { name: /^Mark/, checked: true }).count();
    expect(done).toBeGreaterThanOrEqual(1);
  });

  test("make it smaller never exceeds the smaller budget and keeps done steps", async ({ page }) => {
    await seed(page);
    await makePlan(page);
    await expect(page.locator('[data-plan-source="ai"][data-ai-phase="done"]')).toBeVisible({ timeout: 20_000 });
    await page.getByRole("checkbox", { name: /^Mark/ }).first().click();
    await expect(page.getByRole("checkbox", { name: /^Mark/, checked: true })).toHaveCount(1);
    await page.getByRole("button", { name: "Make it smaller" }).click();
    await expect(page.getByText(/Made it smaller/)).toBeVisible();
    const plan = await page.evaluate(async () => {
      const { db } = await import(/* @vite-ignore */ ("/src/data/" + "db.ts"));
      const plans = await db.plans.toArray();
      return plans.sort((a: { createdAt: string }, b: { createdAt: string }) => (a.createdAt < b.createdAt ? 1 : -1))[0];
    });
    const minutes = plan.actions.filter((a: { completed: boolean }) => !a.completed).reduce((s: number, a: { estimatedMinutes: number }) => s + a.estimatedMinutes, 0);
    expect(minutes).toBeLessThanOrEqual(plan.budgetMinutes);
    expect(plan.actions.some((a: { completed: boolean }) => a.completed)).toBe(true);
  });
});

test.describe("capture", () => {
  test("quick add parses a line and the paste flow extracts tasks with the mock", async ({ page }) => {
    await seed(page, { demo: false });
    await page.getByRole("textbox", { name: /Quick add/ }).fill("bio lab report due fri ~2h hard #biology @teacher");
    await expect(page.getByText("Biology")).toBeVisible();
    await page.getByRole("button", { name: "Add this task" }).click();
    await expect(page.getByText(/Added to your tasks/)).toBeVisible();

    await page.goto("/capture?tab=paste");
    await page.getByRole("textbox", { name: "Paste text" }).fill("Unit 4 reading due Thursday\nLab report draft due Fri\nQuiz on ch. 12 next Monday");
    await page.getByRole("button", { name: "Read it" }).click();
    await expect(page.getByRole("button", { name: /Add \d+ to my tasks/ })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Where each one came from/)).toBeVisible();
    await page.getByRole("button", { name: /Add \d+ to my tasks/ }).click();
    await expect(page).toHaveURL(/tasks/);
  });
});

test.describe("messages", () => {
  test("the lint flags a disclosure and offers neutral wording", async ({ page }) => {
    await seed(page);
    await page.goto("/message?course=Biology");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: /Draft it for me/ }).click();
    const box = page.getByRole("textbox", { name: "Message text" });
    await expect(box).toBeVisible({ timeout: 20_000 });
    await box.fill("Hi, I missed class because of a seizure. Could you share the notes?");
    await expect(page.getByText(/This mentions/)).toBeVisible();
    await expect(box).toHaveValue(/seizure/);
    await page.getByRole("button", { name: /swap in neutral wording/ }).click();
    await expect(box).toHaveValue(/health-related absence/);
    await expect(page.getByText(/Nothing in here shares/)).toBeVisible();
  });
});

test.describe("keyboard", () => {
  test("the command palette opens with the keyboard and navigates", async ({ page }) => {
    await seed(page);
    await page.keyboard.press("Control+k");
    const input = page.getByPlaceholder(/Jump to a screen/);
    await expect(input).toBeVisible();
    await input.fill("week");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/week/);
  });
});
