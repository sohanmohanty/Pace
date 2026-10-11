import { describe, expect, it } from "vitest";
import type { Subtask, Task } from "../data/types";
import { budgetForDial, maxBlockForDial } from "../logic/capacity";
import { narratePlan } from "../logic/narrate";
import { generatePlan } from "../logic/scheduler";

const TODAY = "2026-10-05";

const task = (id: string, patch: Partial<Task> = {}): Task => ({
  id,
  title: `Task ${id}`,
  estimatedMinutes: 60,
  difficulty: 3,
  importance: 3,
  status: "not_started",
  needsCommunication: false,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  ...patch
});

const steps = (taskId: string, mins: number[], titles?: string[]): Subtask[] =>
  mins.map((m, i) => ({
    id: `${taskId}-${i}`,
    taskId,
    title: titles?.[i] ?? `${taskId} step ${i}`,
    estimatedMinutes: m,
    difficulty: 3,
    type: "focus",
    status: "not_started",
    order: i
  }));

const tasks = [
  task("a", { title: "Biology lab report", dueDate: "2026-10-02", importance: 5 }),
  task("b", { title: "Read chapter 12", dueDate: "2026-10-07" }),
  task("c", { title: "Problem set 5", dueDate: "2026-10-06" }),
  task("d", { title: "Essay draft", dueDate: "2026-10-12", importance: 4 })
];
const subtasks = [
  ...steps("a", [10, 20, 25, 5]),
  ...steps("b", [15, 15, 10], ["Skim the headings", "Read the first section", "Write a summary"]),
  ...steps("c", [20, 20], ["Do 5 practice problems", "Check answers"]),
  ...steps("d", [10, 15, 25, 25], ["Read the prompt", "Create an outline", "Draft paragraph 1", "Draft paragraph 2"])
];

describe("dial-driven planning", () => {
  it("respects the dial's budget and block size", () => {
    for (const dial of [5, 20, 40, 60, 80, 100]) {
      const plan = generatePlan({ tasks, subtasks, capacity: "medium", dial, today: TODAY });
      const total = plan.actions.reduce((s, a) => s + a.estimatedMinutes, 0);
      expect(plan.budgetMinutes).toBe(budgetForDial(dial));
      expect(total).toBeLessThanOrEqual(plan.budgetMinutes);
      for (const a of plan.actions) expect(a.estimatedMinutes).toBeLessThanOrEqual(maxBlockForDial(dial));
      expect(plan.dial).toBe(dial);
      expect(plan.source).toBe("local");
    }
  });

  it("a higher dial never plans fewer minutes than a lower one", () => {
    let prev = 0;
    for (const dial of [0, 15, 30, 45, 60, 75, 90, 100]) {
      const plan = generatePlan({ tasks, subtasks, capacity: "medium", dial, today: TODAY });
      const total = plan.actions.reduce((s, a) => s + a.estimatedMinutes, 0);
      expect(total).toBeGreaterThanOrEqual(prev);
      prev = total;
    }
  });

  it("shrink lowers the dial by 25 and keeps the plan inside the smaller budget", () => {
    const plan = generatePlan({ tasks, subtasks, capacity: "medium", dial: 60, shrink: true, today: TODAY });
    expect(plan.dial).toBe(35);
    const total = plan.actions.reduce((s, a) => s + a.estimatedMinutes, 0);
    expect(total).toBeLessThanOrEqual(budgetForDial(35));
  });

  it("'unsure' plans gently even on a mid dial", () => {
    const plan = generatePlan({ tasks, subtasks, capacity: "unsure", dial: 35, today: TODAY });
    expect(plan.actions.length).toBeLessThanOrEqual(3);
    for (const a of plan.actions) expect(a.estimatedMinutes).toBeLessThanOrEqual(20);
  });

  it("heavy work types are steered away from, not banned", () => {
    const base = generatePlan({ tasks, subtasks, capacity: "medium", dial: 50, today: TODAY });
    const noReading = generatePlan({ tasks, subtasks, capacity: "medium", dial: 50, heavy: ["reading"], today: TODAY });
    const readingMinutes = (p: typeof base) =>
      p.actions.filter((a) => a.workType === "reading").reduce((s, a) => s + a.estimatedMinutes, 0);
    expect(readingMinutes(noReading)).toBeLessThanOrEqual(readingMinutes(base));
    expect(noReading.actions.length).toBeGreaterThan(0);
  });

  it("every action carries a work type and a window", () => {
    const plan = generatePlan({ tasks, subtasks, capacity: "medium", dial: 70, windows: ["evening"], today: TODAY });
    for (const a of plan.actions) {
      expect(a.workType).toBeDefined();
      expect(a.window).toBe("evening");
    }
  });

  it("the legacy four-bucket API still works unchanged", () => {
    const plan = generatePlan({ tasks, subtasks, capacity: "low", today: TODAY });
    expect(plan.budgetMinutes).toBe(30);
    expect(plan.dial).toBeUndefined();
  });
});

describe("narratePlan", () => {
  it("writes one honest paragraph that names the lead task and the spare time", () => {
    const plan = generatePlan({ tasks, subtasks, capacity: "medium", dial: 45, today: TODAY });
    const text = narratePlan({
      actions: plan.actions,
      budgetMinutes: plan.budgetMinutes,
      checkIn: { dial: 45, capacity: "medium", heavy: ["reading"] },
      tasks,
      today: TODAY
    });
    expect(text).toMatch(/gentle day/);
    expect(text).toMatch(/Biology lab report comes first/);
    expect(text).toMatch(/This plan keeps reading light/);
    expect(text.split(". ").length).toBeGreaterThanOrEqual(2);
  });

  it("handles an empty plan", () => {
    expect(narratePlan({ actions: [], budgetMinutes: 30, checkIn: null, tasks })).toBe("Nothing is planned yet.");
  });
});
