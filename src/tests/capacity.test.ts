import { describe, expect, it } from "vitest";
import {
  budgetForDial,
  capacityForDial,
  clampDial,
  guessWorkType,
  maxBlockForDial,
  paramsForDial,
  tintHueForDial
} from "../logic/capacity";

describe("capacity model", () => {
  it("clamps and rounds the dial", () => {
    expect(clampDial(-5)).toBe(0);
    expect(clampDial(140)).toBe(100);
    expect(clampDial(42.6)).toBe(43);
    expect(clampDial(Number.NaN)).toBe(50);
  });

  it("derives the old labels from the dial", () => {
    expect(capacityForDial(0)).toBe("low");
    expect(capacityForDial(30)).toBe("low");
    expect(capacityForDial(31)).toBe("medium");
    expect(capacityForDial(62)).toBe("medium");
    expect(capacityForDial(63)).toBe("high");
    expect(capacityForDial(100)).toBe("high");
  });

  it("budget is monotonic in the dial and lands on the anchor points", () => {
    let prev = -1;
    for (let d = 0; d <= 100; d++) {
      const b = budgetForDial(d);
      expect(b).toBeGreaterThanOrEqual(prev);
      expect(b % 5).toBe(0);
      prev = b;
    }
    expect(budgetForDial(0)).toBe(15);
    expect(budgetForDial(62)).toBe(90);
    expect(budgetForDial(85)).toBe(150);
    expect(budgetForDial(100)).toBe(200);
  });

  it("block size grows with the dial and stays within the model's bounds", () => {
    expect(maxBlockForDial(0)).toBe(10);
    expect(maxBlockForDial(100)).toBe(60);
    let prev = -1;
    for (let d = 0; d <= 100; d += 5) {
      const m = maxBlockForDial(d);
      expect(m).toBeGreaterThanOrEqual(prev);
      prev = m;
    }
  });

  it("low days never chain follow-on steps; high days chain the most", () => {
    expect(paramsForDial(10).maxChained).toBe(0);
    expect(paramsForDial(50).maxChained).toBe(3);
    expect(paramsForDial(90).maxChained).toBe(4);
    expect(paramsForDial(10).maxActions).toBe(3);
  });

  it("tint hue sweeps dusk → teal → amber", () => {
    expect(tintHueForDial(0)).toBe(300);
    expect(tintHueForDial(50)).toBe(185);
    expect(tintHueForDial(100)).toBe(70);
    expect(tintHueForDial(25)).toBeGreaterThan(185);
    expect(tintHueForDial(75)).toBeLessThan(185);
  });

  it("guesses work types from titles", () => {
    expect(guessWorkType("Read chapter 12")).toBe("reading");
    expect(guessWorkType("Draft body paragraph 1")).toBe("writing");
    expect(guessWorkType("Do 5 practice problems")).toBe("problems");
    expect(guessWorkType("Ask the teacher what to prioritize", "communication")).toBe("people");
    expect(guessWorkType("Build the slides")).toBe("making");
  });
});
