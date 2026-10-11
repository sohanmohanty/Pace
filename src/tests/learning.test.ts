import { describe, expect, it } from "vitest";
import type { FocusSession } from "../data/types";
import { calibrate, calibratedMinutes, energyProfile, learnedSentences } from "../logic/learning";

const s = (patch: Partial<FocusSession>): FocusSession => ({
  id: Math.random().toString(36).slice(2),
  date: "2026-10-05",
  taskId: "t",
  startedAt: "2026-10-05T09:00:00.000Z",
  endedAt: "2026-10-05T09:30:00.000Z",
  minutes: 30,
  estimatedMinutes: 20,
  outcome: "done",
  course: "Biology",
  workType: "writing",
  ...patch
});

describe("calibration", () => {
  it("needs evidence before it moves, then shrinks toward the median", () => {
    const one = calibrate([s({ minutes: 40, estimatedMinutes: 20 })]);
    expect(one.byCourse.Biology.n).toBe(1);
    expect(one.byCourse.Biology.ratio).toBeLessThan(2);
    expect(one.byCourse.Biology.ratio).toBeGreaterThan(1);
    const many = calibrate(Array.from({ length: 6 }, () => s({ minutes: 32, estimatedMinutes: 20 })));
    expect(many.byCourse.Biology.ratio).toBeGreaterThan(1.4);
    expect(many.byCourse.Biology.ratio).toBeLessThan(1.6);
  });

  it("ignores stopped sessions and one wild outlier", () => {
    const r = calibrate([
      ...Array.from({ length: 4 }, () => s({ minutes: 20, estimatedMinutes: 20 })),
      s({ minutes: 200, estimatedMinutes: 20 }),
      s({ minutes: 1, estimatedMinutes: 20, outcome: "stopped" })
    ]);
    expect(r.byCourse.Biology.n).toBe(5);
    expect(r.byCourse.Biology.ratio).toBeLessThan(1.2);
  });

  it("applies calibration only with enough samples, rounding to 5", () => {
    const profile = { calibration: { Biology: { ratio: 1.6, n: 4 } }, calibrationByType: { writing: { ratio: 2, n: 1 } } };
    expect(calibratedMinutes(20, profile, "Biology")).toBe(30);
    expect(calibratedMinutes(20, profile, "Math", "writing")).toBe(20);
    expect(calibratedMinutes(20, profile)).toBe(20);
  });
});

describe("energy profile and sentences", () => {
  it("buckets sessions by start hour with a smoothed completion rate", () => {
    const e = energyProfile([
      s({ startedAt: "2026-10-05T08:00:00.000Z", outcome: "done" }),
      s({ startedAt: "2026-10-05T08:30:00.000Z", outcome: "done" }),
      s({ startedAt: "2026-10-05T20:00:00.000Z", outcome: "stopped" })
    ]);
    // Hours are local; both morning sessions land in one bucket.
    const buckets = Object.values(e);
    expect(buckets.length).toBeGreaterThanOrEqual(1);
    for (const b of buckets) expect(b.rate).toBeGreaterThan(0);
  });

  it("writes plain sentences only for meaningful, well-supported facts", () => {
    const sentences = learnedSentences(
      {
        calibration: { Biology: { ratio: 1.6, n: 4 }, Math: { ratio: 1.05, n: 10 }, Art: { ratio: 2, n: 1 } },
        calibrationByType: {},
        energy: { morning: { rate: 0.8, n: 5 }, evening: { rate: 0.4, n: 5 } }
      },
      [],
      0.85
    );
    expect(sentences.some((x) => x.startsWith("Biology work tends to take about 1.6x"))).toBe(true);
    expect(sentences.some((x) => x.startsWith("Math"))).toBe(false);
    expect(sentences.some((x) => x.startsWith("Art"))).toBe(false);
    expect(sentences.some((x) => x.includes("morning") && x.includes("evening"))).toBe(true);
    expect(sentences.some((x) => x.includes("-15%"))).toBe(true);
  });
});
