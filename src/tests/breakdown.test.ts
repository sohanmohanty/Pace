import { describe, expect, it } from "vitest";
import type { Task } from "../data/types";
import { detectTemplate, generateSubtasks, TEMPLATES } from "../logic/breakdown";

function makeTask(patch: Partial<Task> = {}): Task {
  return {
    id: "t1",
    title: "Untitled",
    estimatedMinutes: 60,
    difficulty: 3,
    importance: 3,
    status: "not_started",
    needsCommunication: false,
    createdAt: "2026-07-01",
    updatedAt: "2026-07-01",
    ...patch
  };
}

describe("template detection", () => {
  it("detects by keywords with sensible precedence", () => {
    expect(detectTemplate("The Great Gatsby essay")).toBe("essay");
    expect(detectTemplate("Study for stoichiometry retake")).toBe("test");
    expect(detectTemplate("Biology lab report")).toBe("project");
    expect(detectTemplate("Read chapter 12")).toBe("reading");
    expect(detectTemplate("Email counselor about schedule")).toBe("communication");
    expect(detectTemplate("Random thing")).toBe("generic");
  });
});

describe("subtask generation", () => {
  it("produces ordered steps with ids and statuses", () => {
    const subs = generateSubtasks(makeTask({ title: "History essay" }));
    expect(subs.length).toBe(TEMPLATES.essay.steps.length);
    subs.forEach((s, i) => {
      expect(s.order).toBe(i);
      expect(s.status).toBe("not_started");
      expect(s.taskId).toBe("t1");
    });
  });

  it("scales step minutes toward the task estimate", () => {
    const big = generateSubtasks(makeTask({ title: "Long essay", estimatedMinutes: 320 }));
    const small = generateSubtasks(makeTask({ title: "Short essay", estimatedMinutes: 80 }));
    const sum = (list: typeof big) => list.reduce((s, x) => s + x.estimatedMinutes, 0);
    expect(sum(big)).toBeGreaterThan(sum(small));
    for (const s of [...big, ...small]) {
      expect(s.estimatedMinutes).toBeGreaterThanOrEqual(2);
      expect(s.estimatedMinutes).toBeLessThanOrEqual(60);
    }
  });

  it("prepends a communication step when the task needs one", () => {
    const subs = generateSubtasks(
      makeTask({ title: "Read chapter 12", needsCommunication: true })
    );
    expect(subs[0].type).toBe("communication");
    expect(subs[0].order).toBe(0);
  });

  it("does not duplicate communication steps", () => {
    const subs = generateSubtasks(
      makeTask({ title: "Study for the retake", needsCommunication: true })
    );
    const commCount = subs.filter((s) => s.type === "communication").length;
    expect(commCount).toBe(TEMPLATES.test.steps.filter((s) => s.type === "communication").length);
  });

  it("inherits the demo flag", () => {
    const subs = generateSubtasks(makeTask({ demo: 1 }));
    expect(subs.every((s) => s.demo === 1)).toBe(true);
  });
});
