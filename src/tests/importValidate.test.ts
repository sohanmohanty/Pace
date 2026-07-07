import { describe, expect, it } from "vitest";
import { importedCount, sanitizeImport } from "../data/importValidate";

const validExport = {
  app: "Pace",
  version: 1,
  exportedAt: "2026-07-06T12:00:00.000Z",
  tasks: [
    {
      id: "t1",
      title: "Biology lab report",
      estimatedMinutes: 120,
      difficulty: 4,
      importance: 5,
      status: "not_started",
      needsCommunication: true,
      createdAt: "2026-07-01",
      updatedAt: "2026-07-01"
    }
  ],
  subtasks: [
    {
      id: "s1",
      taskId: "t1",
      title: "Find the rubric",
      estimatedMinutes: 10,
      difficulty: 1,
      type: "starter",
      status: "done",
      order: 0
    }
  ],
  checkIns: [{ id: "c1", date: "2026-07-01", capacity: "medium", createdAt: "2026-07-01" }],
  plans: [
    {
      id: "p1",
      date: "2026-07-01",
      capacity: "medium",
      budgetMinutes: 90,
      multiplier: 1,
      actions: [],
      createdAt: "2026-07-01"
    }
  ],
  reflections: [
    {
      id: "r1",
      date: "2026-07-01",
      completedActionIds: [],
      planFelt: "right",
      nextPlanPreference: "same",
      createdAt: "2026-07-01"
    }
  ],
  settings: [{ id: "app", onboarded: false, largeText: false, highContrast: false, reduceMotion: false }]
};

describe("import validation", () => {
  it("accepts a real export and keeps every record", () => {
    const p = sanitizeImport(validExport);
    expect(importedCount(p)).toBe(5);
    expect(p.tasks[0].title).toBe("Biology lab report");
    expect(p.subtasks[0].taskId).toBe("t1");
  });

  it("forces onboarded true so an import never bounces to onboarding", () => {
    const p = sanitizeImport(validExport);
    expect(p.settings?.onboarded).toBe(true);
  });

  it("rejects files that aren't Pace exports", () => {
    expect(() => sanitizeImport("hello")).toThrow();
    expect(() => sanitizeImport(null)).toThrow();
    expect(() => sanitizeImport({ some: "random json" })).toThrow();
    expect(() => sanitizeImport([1, 2, 3])).toThrow();
  });

  it("rejects Pace-shaped files with no usable data", () => {
    expect(() => sanitizeImport({ app: "Pace", tasks: [] })).toThrow(/doesn't contain/);
  });

  it("skips malformed records instead of failing the whole import", () => {
    const messy = {
      ...validExport,
      tasks: [
        ...validExport.tasks,
        { id: "bad1" }, // no title/minutes
        { title: "no id", estimatedMinutes: 10 },
        null,
        42
      ]
    };
    const p = sanitizeImport(messy);
    expect(p.tasks).toHaveLength(1);
    expect(p.tasks[0].id).toBe("t1");
  });

  it("tolerates missing sections", () => {
    const partial = { app: "Pace", tasks: validExport.tasks };
    const p = sanitizeImport(partial);
    expect(p.tasks).toHaveLength(1);
    expect(p.plans).toHaveLength(0);
    expect(p.settings).toBeUndefined();
  });
});
