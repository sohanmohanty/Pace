import { describe, expect, it } from "vitest";
import { parseQuickAdd } from "../logic/quickadd";

// The fixture day is a Wednesday.
const TODAY = "2026-07-01";

describe("quick-add parser", () => {
  it("parses the canonical example", () => {
    const p = parseQuickAdd("bio lab report due fri ~2h hard #biology @teacher", TODAY);
    expect(p.title).toBe("Bio lab report");
    expect(p.dueDate).toBe("2026-07-03");
    expect(p.estimatedMinutes).toBe(120);
    expect(p.difficulty).toBe(4);
    expect(p.course).toBe("Biology");
    expect(p.needsCommunication).toBe(true);
  });

  it("treats today's weekday as today", () => {
    expect(parseQuickAdd("thing due wed", TODAY).dueDate).toBe(TODAY);
  });

  it("parses tomorrow and today", () => {
    expect(parseQuickAdd("essay due tomorrow", TODAY).dueDate).toBe("2026-07-02");
    expect(parseQuickAdd("essay due today", TODAY).dueDate).toBe(TODAY);
  });

  it("parses 'due next fri' as a week later", () => {
    expect(parseQuickAdd("quiz due next fri", TODAY).dueDate).toBe("2026-07-10");
  });

  it("parses M/D dates in the current year, allowing past dates", () => {
    const p = parseQuickAdd("makeup lab due 6/20", TODAY);
    expect(p.dueDate).toBe("2026-06-20"); // Accept past dates for catch-up work.
  });

  it("parses duration ranges as midpoints", () => {
    expect(parseQuickAdd("project ~2-3h", TODAY).estimatedMinutes).toBe(150);
    expect(parseQuickAdd("worksheet 45m", TODAY).estimatedMinutes).toBe(45);
    expect(parseQuickAdd("reading 1.5h", TODAY).estimatedMinutes).toBe(90);
  });

  it("parses importance markers", () => {
    expect(parseQuickAdd("college form !!", TODAY).importance).toBe(5);
    expect(parseQuickAdd("college form !", TODAY).importance).toBe(4);
  });

  it("leaves 'due' in the title when no date follows", () => {
    const p = parseQuickAdd("past due reading log", TODAY);
    expect(p.title.toLowerCase()).toContain("due");
    expect(p.dueDate).toBeUndefined();
  });

  it("keeps plain text as the title with no false positives", () => {
    const p = parseQuickAdd("finish reading chapter twelve", TODAY);
    expect(p.title).toBe("Finish reading chapter twelve");
    expect(p.dueDate).toBeUndefined();
    expect(p.estimatedMinutes).toBeUndefined();
  });

  it("reports recognized chips for the live preview", () => {
    const p = parseQuickAdd("essay due fri ~1h #english", TODAY);
    expect(p.recognized.length).toBe(3);
  });
});
