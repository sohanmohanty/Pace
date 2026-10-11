import { describe, expect, it } from "vitest";
import type { PlanAction } from "../data/types";
import { colorIndexFor, layoutDayLine } from "../logic/dayline";
import { placeInWindows } from "../logic/scheduler";

const act = (id: string, minutes: number, completed = false, taskId = "t"): PlanAction => ({
  id,
  taskId,
  title: id,
  estimatedMinutes: minutes,
  reason: "momentum",
  completed
});

describe("Day Line layout", () => {
  it("the horizon moves with the budget", () => {
    const low = layoutDayLine({ actions: [], budgetMinutes: 30, width: 400, height: 150 });
    const high = layoutDayLine({ actions: [], budgetMinutes: 150, width: 400, height: 150 });
    expect(high.horizonX).toBeGreaterThan(low.horizonX);
    expect(layoutDayLine({ actions: [], budgetMinutes: 200, width: 400, height: 150 }).horizonFrac).toBe(1);
  });

  it("stops tile the horizon in plan order and never pass it", () => {
    const actions = [act("a", 15), act("b", 30), act("c", 45)];
    const l = layoutDayLine({ actions, budgetMinutes: 90, width: 600, height: 150 });
    expect(l.stops.map((s) => s.id)).toEqual(["a", "b", "c"]);
    for (let i = 1; i < l.stops.length; i++) {
      expect(l.stops[i].startFrac).toBeCloseTo(l.stops[i - 1].endFrac, 6);
      expect(l.stops[i].x).toBeGreaterThan(l.stops[i - 1].x);
    }
    expect(l.stops[2].endFrac).toBeCloseTo(l.horizonFrac, 6);
    expect(l.spareMinutes).toBe(0);
  });

  it("an under-filled day leaves visible room before the horizon", () => {
    const l = layoutDayLine({ actions: [act("a", 20)], budgetMinutes: 100, width: 600, height: 150 });
    expect(l.stops[0].endFrac).toBeLessThan(l.horizonFrac);
    expect(l.spareMinutes).toBe(80);
  });

  it("the walked portion equals the share of completed minutes", () => {
    const l = layoutDayLine({
      actions: [act("a", 30, true), act("b", 30), act("c", 30)],
      budgetMinutes: 90,
      width: 600,
      height: 150
    });
    expect(l.doneFrac).toBeCloseTo(l.horizonFrac / 3, 6);
    // "Now" sits on the first unfinished stop.
    expect(l.nowX).toBeCloseTo(l.stops[1].x, 6);
    expect(l.nowY).toBeCloseTo(l.stops[1].y, 6);
  });

  it("paths keep a fixed sample count so they can animate", () => {
    const a = layoutDayLine({ actions: [], budgetMinutes: 30, width: 500, height: 150 });
    const b = layoutDayLine({ actions: [], budgetMinutes: 180, width: 500, height: 150 });
    const count = (d: string) => d.split(/[ML]/).length;
    expect(count(a.linePath)).toBe(count(b.linePath));
    expect(count(a.donePath)).toBe(count(b.linePath));
  });

  it("bigger steps get bigger stops, within bounds", () => {
    const l = layoutDayLine({ actions: [act("a", 5), act("b", 60)], budgetMinutes: 100, width: 600, height: 150 });
    expect(l.stops[1].r).toBeGreaterThan(l.stops[0].r);
    expect(l.stops[0].r).toBeGreaterThanOrEqual(6.5);
    expect(l.stops[1].r).toBeLessThanOrEqual(16);
  });

  it("window marks follow the steps placed in each window", () => {
    const placed = placeInWindows([act("a", 30), act("b", 30), act("c", 30)], ["morning", "evening"]);
    const l = layoutDayLine({ actions: placed, budgetMinutes: 90, width: 600, height: 150, windows: ["morning", "evening"] });
    expect(l.windowMarks.map((m) => m.window)).toEqual(["morning", "evening"]);
    expect(l.windowMarks[0].x).toBeLessThan(l.windowMarks[1].x);
  });

  it("task colors are stable by position and fall back to a hash", () => {
    expect(colorIndexFor("b", ["a", "b", "c"])).toBe(1);
    expect(colorIndexFor("zzz", ["a"])).toBe(colorIndexFor("zzz", ["a"]));
    expect(colorIndexFor("zzz", ["a"])).toBeLessThan(8);
  });
});

describe("placeInWindows", () => {
  it("shares minutes across the chosen windows in order", () => {
    const placed = placeInWindows([act("a", 20), act("b", 20), act("c", 20), act("d", 20)], ["afternoon", "morning"]);
    expect(placed.map((a) => a.window)).toEqual(["morning", "morning", "afternoon", "afternoon"]);
  });

  it("one window takes everything; none given spreads across the day", () => {
    expect(placeInWindows([act("a", 10), act("b", 50)], ["evening"]).every((a) => a.window === "evening")).toBe(true);
    const spread = placeInWindows([act("a", 30), act("b", 30), act("c", 30)], undefined);
    expect(spread.map((a) => a.window)).toEqual(["morning", "afternoon", "evening"]);
  });
});
