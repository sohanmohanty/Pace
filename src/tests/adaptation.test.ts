import { describe, expect, it } from "vitest";
import type { Reflection } from "../data/types";
import { capacityMultiplier, multiplierLabel } from "../logic/adaptation";

let seq = 0;
function reflect(pref: Reflection["nextPlanPreference"]): Reflection {
  seq += 1;
  return {
    id: `r${seq}`,
    date: "2026-07-01",
    completedActionIds: [],
    planFelt: "right",
    nextPlanPreference: pref,
    createdAt: `2026-07-01T00:00:${String(seq).padStart(2, "0")}`
  };
}

describe("adaptation multiplier", () => {
  it("is neutral with no reflections", () => {
    expect(capacityMultiplier([])).toBe(1);
  });

  it("moves down on 'lighter' and up on 'heavier'", () => {
    expect(capacityMultiplier([reflect("lighter")])).toBeCloseTo(0.85);
    expect(capacityMultiplier([reflect("heavier")])).toBeCloseTo(1.12);
  });

  it("clamps at 0.5 no matter how many 'lighter' answers", () => {
    const many = Array.from({ length: 8 }, () => reflect("lighter"));
    expect(capacityMultiplier(many)).toBe(0.5);
  });

  it("clamps at 1.5 on repeated 'heavier'", () => {
    const many = Array.from({ length: 10 }, () => reflect("heavier"));
    expect(capacityMultiplier(many)).toBeLessThanOrEqual(1.5);
  });

  it("decays toward neutral on 'same'", () => {
    const f = capacityMultiplier([reflect("lighter"), reflect("same"), reflect("same")]);
    expect(f).toBeGreaterThan(0.85);
    expect(f).toBeLessThan(1);
  });

  it("only uses the last five reflections", () => {
    const old = Array.from({ length: 5 }, () => reflect("lighter"));
    const recent = Array.from({ length: 5 }, () => reflect("same"));
    const f = capacityMultiplier([...old, ...recent]);
    // Five 'same' answers decay any prior signal close to neutral.
    expect(f).toBeGreaterThan(0.9);
  });

  it("labels multipliers for the UI", () => {
    expect(multiplierLabel(1)).toBeNull();
    expect(multiplierLabel(0.85)).toBe("−15%");
    expect(multiplierLabel(1.12)).toBe("+12%");
  });
});
