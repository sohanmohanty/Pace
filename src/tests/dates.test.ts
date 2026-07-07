import { describe, expect, it } from "vitest";
import {
  addDaysISO,
  daysUntil,
  formatDueLabel,
  nextWeekdayISO,
  parseISODate,
  toISODate,
  weekdayFromToken
} from "../lib/dates";

describe("dates (local-time safety)", () => {
  it("parses YYYY-MM-DD as local midnight — no UTC off-by-one", () => {
    const d = parseISODate("2026-07-03");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6);
    expect(d.getDate()).toBe(3);
    expect(d.getHours()).toBe(0);
  });

  it("round-trips through toISODate", () => {
    expect(toISODate(parseISODate("2026-01-09"))).toBe("2026-01-09");
  });

  it("adds days across month boundaries", () => {
    expect(addDaysISO("2026-06-29", 3)).toBe("2026-07-02");
    expect(addDaysISO("2026-07-01", -3)).toBe("2026-06-28");
  });

  it("computes signed day distances", () => {
    expect(daysUntil("2026-07-04", "2026-07-01")).toBe(3);
    expect(daysUntil("2026-06-28", "2026-07-01")).toBe(-3);
    expect(daysUntil("2026-07-01", "2026-07-01")).toBe(0);
  });

  it("finds the next weekday, treating today as a match", () => {
    // 2026-07-01 is a Wednesday.
    expect(nextWeekdayISO(3, "2026-07-01")).toBe("2026-07-01"); // Wed → today
    expect(nextWeekdayISO(5, "2026-07-01")).toBe("2026-07-03"); // Fri
    expect(nextWeekdayISO(1, "2026-07-01")).toBe("2026-07-06"); // Mon
  });

  it("matches weekday tokens", () => {
    expect(weekdayFromToken("fri")).toBe(5);
    expect(weekdayFromToken("Friday")).toBe(5);
    expect(weekdayFromToken("tues")).toBe(2);
    expect(weekdayFromToken("xyz")).toBeNull();
  });

  it("uses gentle language for past dates — never 'overdue: N'", () => {
    const label = formatDueLabel("2026-06-28", "2026-07-01");
    expect(label).toContain("was due");
    expect(label.toLowerCase()).not.toContain("overdue");
  });
});
