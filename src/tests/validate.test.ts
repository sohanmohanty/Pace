import { describe, expect, it } from "vitest";
import type { Subtask, Task } from "../data/types";
import { paramsForDial } from "../logic/capacity";
import { validateProposal } from "../logic/validate";
import type { PlanResponse } from "../shared/schema";

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
const step = (taskId: string, i: number, minutes: number, type: Subtask["type"] = "focus", status: Subtask["status"] = "not_started"): Subtask => ({
  id: `${taskId}-${i}`,
  taskId,
  title: `${taskId} step ${i}`,
  estimatedMinutes: minutes,
  difficulty: 3,
  type,
  status,
  order: i
});

const tasks = [task("a", { dueDate: "2026-10-04", importance: 5 }), task("b", { dueDate: "2026-10-09" }), task("z", { status: "done" })];
const subtasks = [step("a", 0, 10, "starter", "done"), step("a", 1, 20), step("a", 2, 25), step("b", 0, 15), step("b", 1, 30), step("b", 2, 5, "communication")];

const act = (taskId: string, subtaskId: string | null, minutes: number, title = "x"): PlanResponse["actions"][number] => ({
  taskId,
  subtaskId,
  title,
  minutes,
  window: "evening",
  why: "because",
  firstAction: "open it",
  workType: "writing"
});

const base = (actions: PlanResponse["actions"]): PlanResponse => ({ reasoning: "Short and honest.", actions, deferred: [] });
const params = paramsForDial(55); // budget 75ish, block 30, 5 actions

describe("validateProposal", () => {
  it("accepts a clean proposal and carries why/firstAction through", () => {
    const r = validateProposal({ proposal: base([act("a", "a-1", 20), act("b", "b-0", 15)]), tasks, subtasks, budgetMinutes: 60, params, capacity: "medium", today: TODAY, windows: ["evening"] });
    expect(r.actions.map((a) => a.subtaskId)).toEqual(["a-1", "b-0"]);
    expect(r.actions[0].firstAction).toBe("open it");
    expect(r.actions[0].why).toBe("because");
    expect(r.actions[0].window).toBe("evening");
    expect(r.repairs).toEqual([]);
    expect(r.rejectedCount).toBe(0);
  });

  it("drops unknown tasks, unknown steps, finished tasks, and done steps", () => {
    const r = validateProposal({
      proposal: base([act("nope", null, 10), act("a", "ghost", 10), act("z", null, 10), act("a", "a-0", 10), act("a", "a-1", 20)]),
      tasks, subtasks, budgetMinutes: 60, params, capacity: "medium", today: TODAY
    });
    expect(r.actions.map((a) => a.subtaskId)).toEqual(["a-1"]);
    expect(r.rejectedCount).toBe(4);
  });

  it("enforces step order within a task, allowing a predecessor placed earlier in the plan", () => {
    const skips = validateProposal({ proposal: base([act("a", "a-2", 25)]), tasks, subtasks, budgetMinutes: 60, params, capacity: "medium", today: TODAY });
    expect(skips.actions).toHaveLength(0);
    const inOrder = validateProposal({ proposal: base([act("a", "a-1", 20), act("a", "a-2", 25)]), tasks, subtasks, budgetMinutes: 60, params, capacity: "medium", today: TODAY });
    expect(inOrder.actions.map((a) => a.subtaskId)).toEqual(["a-1", "a-2"]);
  });

  it("communication steps are exempt from order and capped", () => {
    const r = validateProposal({ proposal: base([act("b", "b-2", 5), act("b", "b-0", 15)]), tasks, subtasks, budgetMinutes: 60, params, capacity: "medium", today: TODAY });
    expect(r.actions.map((a) => a.subtaskId)).toEqual(["b-2", "b-0"]);
  });

  it("clamps oversized steps to the block limit and rounds to 5", () => {
    const r = validateProposal({ proposal: base([act("a", "a-1", 97)]), tasks, subtasks, budgetMinutes: 120, params, capacity: "medium", today: TODAY });
    expect(r.actions[0].estimatedMinutes).toBe(params.maxBlock);
    expect(r.repairs.some((x) => x.startsWith("clamp"))).toBe(true);
  });

  it("trims an over-budget proposal with the exact solver and never exceeds the budget", () => {
    const r = validateProposal({
      proposal: base([act("a", "a-1", 20), act("a", "a-2", 25), act("b", "b-0", 15), act("b", "b-1", 30)]),
      tasks, subtasks, budgetMinutes: 45, params, capacity: "medium", today: TODAY
    });
    const total = r.actions.reduce((s, a) => s + a.estimatedMinutes, 0);
    expect(total).toBeLessThanOrEqual(45);
    expect(r.actions.length).toBeGreaterThan(0);
    expect(r.repairs.some((x) => x.startsWith("trim"))).toBe(true);
    // Trimming must not leave a step whose predecessor was trimmed away.
    const ids = r.actions.map((a) => a.subtaskId);
    if (ids.includes("a-2")) expect(ids.indexOf("a-1")).toBeLessThan(ids.indexOf("a-2"));
    if (ids.includes("b-1")) expect(ids.indexOf("b-0")).toBeLessThan(ids.indexOf("b-1"));
  });

  it("re-windows steps the model put in a window the student doesn't have", () => {
    const r = validateProposal({ proposal: base([{ ...act("a", "a-1", 20), window: "morning" }]), tasks, subtasks, budgetMinutes: 60, params, capacity: "medium", today: TODAY, windows: ["evening"] });
    expect(r.actions[0].window).toBe("evening");
    expect(r.repairs.some((x) => x.startsWith("rewindow"))).toBe(true);
  });

  it("allows a proposed new step for a task with no steps, as a bounded virtual block", () => {
    const t = [task("c", { estimatedMinutes: 120 })];
    const r = validateProposal({ proposal: base([act("c", null, 90, "Spend time on the project")]), tasks: t, subtasks: [], budgetMinutes: 60, params, capacity: "medium", today: TODAY });
    expect(r.actions).toHaveLength(1);
    expect(r.actions[0].estimatedMinutes).toBe(params.maxBlock);
    expect(r.actions[0].virtual).toBe(true);
  });
});
