import { describe, expect, it } from "vitest";
import type { Level, Subtask, Task } from "../data/types";
import {
  buildCandidates,
  CAPACITY_PARAMS,
  computeBudget,
  generatePlan,
  selectCandidates,
  totalPlanMinutes,
  type Candidate
} from "../logic/scheduler";

const TODAY = "2026-07-01";
let seq = 0;

function makeTask(patch: Partial<Task> = {}): Task {
  seq += 1;
  return {
    id: `task-${seq}`,
    title: `Task ${seq}`,
    estimatedMinutes: 30,
    difficulty: 3,
    importance: 3,
    status: "not_started",
    needsCommunication: false,
    createdAt: TODAY,
    updatedAt: TODAY,
    ...patch
  };
}

function makeSubtask(taskId: string, order: number, patch: Partial<Subtask> = {}): Subtask {
  seq += 1;
  return {
    id: `sub-${seq}`,
    taskId,
    title: `Step ${order}`,
    estimatedMinutes: 15,
    difficulty: 2,
    type: "focus",
    status: "not_started",
    order,
    ...patch
  };
}

function makeCandidate(minutes: number, score: number, id: string): Candidate {
  return {
    taskId: id,
    title: id,
    minutes,
    difficulty: 2 as Level,
    importance: 3 as Level,
    kind: "task",
    virtual: false,
    score,
    factors: {
      urgency: 1,
      importance: 3,
      communication: 0,
      fit: 0,
      quickWin: 0,
      daysUntilDue: null
    }
  };
}

describe("eligibility (Step 0)", () => {
  it("only offers the earliest incomplete subtask of a task", () => {
    const task = makeTask();
    const subs = [
      makeSubtask(task.id, 0, { title: "Write thesis", status: "done" }),
      makeSubtask(task.id, 1, { title: "Draft paragraph 1" }),
      makeSubtask(task.id, 2, { title: "Draft paragraph 2" })
    ];
    const cands = buildCandidates([task], subs, "medium", TODAY);
    const titles = cands.map((c) => c.title);
    expect(titles).toContain("Draft paragraph 1");
    expect(titles).not.toContain("Draft paragraph 2");
  });

  it("lets communication subtasks jump the order", () => {
    const task = makeTask();
    const subs = [
      makeSubtask(task.id, 0, { title: "Big first step", estimatedMinutes: 30 }),
      makeSubtask(task.id, 3, {
        title: "Send teacher update",
        type: "communication",
        estimatedMinutes: 5
      })
    ];
    const cands = buildCandidates([task], subs, "medium", TODAY);
    expect(cands.map((c) => c.title)).toContain("Send teacher update");
  });

  it("caps candidates at 2 per task", () => {
    const task = makeTask({ needsCommunication: true });
    const subs = [0, 1, 2, 3].map((o) => makeSubtask(task.id, o));
    const cands = buildCandidates([task], subs, "medium", TODAY);
    expect(cands.filter((c) => c.taskId === task.id).length).toBeLessThanOrEqual(2);
  });

  it("transforms big tasks into starter steps on low capacity", () => {
    const task = makeTask({ estimatedMinutes: 120, title: "Huge lab report" });
    const cands = buildCandidates([task], [], "low", TODAY);
    expect(cands).toHaveLength(1);
    expect(cands[0].minutes).toBeLessThanOrEqual(CAPACITY_PARAMS.low.maxBlock);
    expect(cands[0].virtual).toBe(true);
  });

  it("chunks oversized work on medium capacity instead of skipping it", () => {
    const task = makeTask({ estimatedMinutes: 120 });
    const cands = buildCandidates([task], [], "medium", TODAY);
    expect(cands[0].minutes).toBe(CAPACITY_PARAMS.medium.maxBlock);
    expect(cands[0].virtual).toBe(true);
  });

  it("adds a virtual communication candidate for flagged tasks", () => {
    const task = makeTask({ needsCommunication: true });
    const cands = buildCandidates([task], [], "medium", TODAY);
    expect(cands.some((c) => c.kind === "communication")).toBe(true);
  });

  it("skips done and archived tasks", () => {
    const done = makeTask({ status: "done" });
    const archived = makeTask({ archived: true });
    expect(buildCandidates([done, archived], [], "medium", TODAY)).toHaveLength(0);
  });
});

describe("knapsack selection (Step 5)", () => {
  it("beats greedy: two small items outscore one big one", () => {
    // Greedy-by-score takes A (score 10, 25 min) into a 30-min budget and
    // then nothing else fits. Optimal is B + C (total score 12).
    const cands = [
      makeCandidate(25, 10, "A"),
      makeCandidate(15, 6, "B"),
      makeCandidate(15, 6, "C")
    ];
    const picked = selectCandidates(cands, 30, 3);
    const ids = picked.map((c) => c.taskId).sort();
    expect(ids).toEqual(["B", "C"]);
  });

  it("respects the minute budget", () => {
    const cands = [
      makeCandidate(20, 5, "A"),
      makeCandidate(20, 5, "B"),
      makeCandidate(20, 5, "C")
    ];
    const picked = selectCandidates(cands, 45, 5);
    const total = picked.reduce((s, c) => s + c.minutes, 0);
    expect(total).toBeLessThanOrEqual(45);
    expect(picked).toHaveLength(2);
  });

  it("respects the action cap", () => {
    const cands = Array.from({ length: 8 }, (_, i) => makeCandidate(5, 3, `T${i}`));
    const picked = selectCandidates(cands, 240, 3);
    expect(picked).toHaveLength(3);
  });

  it("returns empty for an empty candidate list", () => {
    expect(selectCandidates([], 30, 3)).toEqual([]);
  });
});

describe("generatePlan (Steps 6–7)", () => {
  it("puts communication actions first", () => {
    const commTask = makeTask({ needsCommunication: true, title: "Lab", importance: 3 });
    const urgent = makeTask({
      title: "Urgent worksheet",
      dueDate: TODAY,
      estimatedMinutes: 20,
      importance: 5
    });
    const plan = generatePlan({
      tasks: [urgent, commTask],
      subtasks: [],
      capacity: "medium",
      today: TODAY
    });
    expect(plan.actions.length).toBeGreaterThanOrEqual(2);
    expect(plan.actions[0].reason).toBe("communication");
  });

  it("never returns an empty plan while tasks exist", () => {
    const huge = makeTask({ estimatedMinutes: 300, difficulty: 5, importance: 1 });
    const plan = generatePlan({
      tasks: [huge],
      subtasks: [],
      capacity: "low",
      today: TODAY
    });
    expect(plan.actions.length).toBeGreaterThanOrEqual(1);
    expect(plan.actions[0].estimatedMinutes).toBeLessThanOrEqual(plan.budgetMinutes);
  });

  it("returns an empty plan when there are no tasks", () => {
    const plan = generatePlan({ tasks: [], subtasks: [], capacity: "medium", today: TODAY });
    expect(plan.actions).toEqual([]);
  });

  it("keeps every action within the low-capacity block size", () => {
    const tasks = [
      makeTask({ estimatedMinutes: 120 }),
      makeTask({ estimatedMinutes: 90 }),
      makeTask({ estimatedMinutes: 10, difficulty: 1 })
    ];
    const plan = generatePlan({ tasks, subtasks: [], capacity: "low", today: TODAY });
    for (const a of plan.actions) {
      expect(a.estimatedMinutes).toBeLessThanOrEqual(CAPACITY_PARAMS.low.maxBlock);
    }
    expect(totalPlanMinutes(plan.actions)).toBeLessThanOrEqual(plan.budgetMinutes);
  });

  it("applies the adaptation multiplier to the budget", () => {
    expect(computeBudget("medium", 1)).toBe(90);
    expect(computeBudget("medium", 0.5)).toBe(45);
    expect(computeBudget("medium", 1.5)).toBe(135);
  });

  it("caps the budget by available time", () => {
    expect(computeBudget("high", 1, 40)).toBe(40);
  });

  it("clamps tiny multiplied budgets to a usable floor", () => {
    expect(computeBudget("low", 0.5)).toBe(15);
  });

  it("shrink produces a smaller plan", () => {
    const tasks = Array.from({ length: 6 }, () => makeTask({ estimatedMinutes: 30 }));
    const normal = generatePlan({ tasks, subtasks: [], capacity: "medium", today: TODAY });
    const smaller = generatePlan({
      tasks,
      subtasks: [],
      capacity: "medium",
      shrink: true,
      today: TODAY
    });
    expect(smaller.budgetMinutes).toBeLessThan(normal.budgetMinutes);
    expect(totalPlanMinutes(smaller.actions)).toBeLessThanOrEqual(smaller.budgetMinutes);
  });

  it("every action carries a reason and a why", () => {
    const tasks = [
      makeTask({ dueDate: "2026-06-28", estimatedMinutes: 20, importance: 5 }),
      makeTask({ needsCommunication: true })
    ];
    const plan = generatePlan({ tasks, subtasks: [], capacity: "medium", today: TODAY });
    for (const a of plan.actions) {
      expect(a.reason).toBeTruthy();
      expect(a.why).toBeTruthy();
    }
  });
});
