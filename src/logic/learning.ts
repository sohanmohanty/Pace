// Compute three local estimators from focus sessions and reflections.
// Insights shows the values, and the planner receives them as sentences.
// Robust ratios shrink toward no adjustment until enough samples exist.

import type { DayWindow, FocusSession, Profile, Reflection, WorkType } from "../data/types";
import { WINDOW_LABELS, WORK_TYPE_LABELS } from "./capacity";

const MIN_SAMPLES = 3;
/** Pseudo-count pulling ratios toward 1.0 while samples are few. */
const PRIOR_SAMPLES = 2;

export interface Calibrated {
  ratio: number;
  n: number;
}

function shrunkRatio(ratios: number[]): Calibrated {
  const sampleCount = ratios.length;
  if (sampleCount === 0) return { ratio: 1, n: 0 };
  // Median is robust to one wild session; shrink toward 1.
  const sortedRatios = [...ratios].sort((a, b) => a - b);
  const median = sortedRatios[Math.floor((sampleCount - 1) / 2)];
  const ratio = (median * sampleCount + 1 * PRIOR_SAMPLES) / (sampleCount + PRIOR_SAMPLES);
  return { ratio: Math.min(3, Math.max(0.33, round2(ratio))), n: sampleCount };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Actual/estimated minute ratios per course and per work type, from finished sessions. */
export function calibrate(sessions: FocusSession[]): {
  byCourse: Record<string, Calibrated>;
  byType: Partial<Record<WorkType, Calibrated>>;
} {
  const courseRatios: Record<string, number[]> = {};
  const typeRatios: Partial<Record<WorkType, number[]>> = {};
  for (const session of sessions) {
    if (!session.minutes || !session.estimatedMinutes || session.estimatedMinutes <= 0) continue;
    // Only sessions that finished the step say anything about the estimate.
    if (session.outcome !== "done" && session.outcome !== "longer") continue;
    const ratio = session.minutes / session.estimatedMinutes;
    if (!Number.isFinite(ratio) || ratio <= 0) continue;
    if (session.course) (courseRatios[session.course] ??= []).push(ratio);
    if (session.workType) (typeRatios[session.workType] ??= []).push(ratio);
  }
  const byCourse: Record<string, Calibrated> = {};
  for (const [course, ratios] of Object.entries(courseRatios)) byCourse[course] = shrunkRatio(ratios);
  const byType: Partial<Record<WorkType, Calibrated>> = {};
  for (const [workType, ratios] of Object.entries(typeRatios)) byType[workType as WorkType] = shrunkRatio(ratios ?? []);
  return { byCourse, byType };
}

/** Completion rate by part of day: sessions that ended "done" over all sessions started in that window. */
export function energyProfile(sessions: FocusSession[]): Partial<Record<DayWindow, { rate: number; n: number }>> {
  const counts: Record<DayWindow, { done: number; n: number }> = {
    morning: { done: 0, n: 0 },
    afternoon: { done: 0, n: 0 },
    evening: { done: 0, n: 0 }
  };
  for (const session of sessions) {
    if (!session.endedAt) continue;
    const hour = new Date(session.startedAt).getHours();
    const window: DayWindow = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
    counts[window].n += 1;
    if (session.outcome === "done") counts[window].done += 1;
  }
  const ratesByWindow: Partial<Record<DayWindow, { rate: number; n: number }>> = {};
  for (const window of Object.keys(counts) as DayWindow[]) {
    const windowCounts = counts[window];
    if (windowCounts.n === 0) continue;
    ratesByWindow[window] = { rate: round2((windowCounts.done + 1) / (windowCounts.n + 2)), n: windowCounts.n };
  }
  return ratesByWindow;
}

/** Multiply an estimate by what Pace has learned, when there is enough evidence. */
export function calibratedMinutes(
  estimate: number,
  profile: Pick<Profile, "calibration" | "calibrationByType">,
  course?: string,
  workType?: WorkType
): number {
  const byCourse = course ? profile.calibration[course] : undefined;
  const byType = workType ? profile.calibrationByType[workType] : undefined;
  let calibration: Calibrated | null = null;
  if (byCourse && byCourse.n >= MIN_SAMPLES) {
    calibration = byCourse;
  } else if (byType && byType.n >= MIN_SAMPLES) {
    calibration = byType;
  }
  if (!calibration) return estimate;
  return Math.max(5, Math.round((estimate * calibration.ratio) / 5) * 5);
}

/** Plain sentences for the planner's context and the Insights screen. */
export function learnedSentences(
  profile: Pick<Profile, "calibration" | "calibrationByType" | "energy">,
  reflections: Reflection[],
  multiplier: number
): string[] {
  const sentences: string[] = [];
  for (const [course, calibration] of Object.entries(profile.calibration)) {
    if (calibration.n < MIN_SAMPLES || Math.abs(calibration.ratio - 1) < 0.15) continue;
    sentences.push(
      calibration.ratio > 1
        ? `${course} work tends to take about ${calibration.ratio.toFixed(1)}x the estimate (${calibration.n} sessions).`
        : `${course} work tends to finish in about ${Math.round(calibration.ratio * 100)}% of the estimate (${calibration.n} sessions).`
    );
  }
  for (const [type, calibration] of Object.entries(profile.calibrationByType)) {
    if (!calibration || calibration.n < MIN_SAMPLES || Math.abs(calibration.ratio - 1) < 0.15) continue;
    const name = WORK_TYPE_LABELS[type as WorkType].toLowerCase();
    sentences.push(
      calibration.ratio > 1
        ? `${name} tends to take about ${calibration.ratio.toFixed(1)}x the estimate.`
        : `${name} tends to go faster than estimated (about ${Math.round(calibration.ratio * 100)}%).`
    );
  }
  const energy = Object.entries(profile.energy).filter(([, e]) => e && e.n >= MIN_SAMPLES) as [DayWindow, { rate: number; n: number }][];
  if (energy.length >= 2) {
    const best = [...energy].sort((a, b) => b[1].rate - a[1].rate)[0];
    const worst = [...energy].sort((a, b) => a[1].rate - b[1].rate)[0];
    if (best[1].rate - worst[1].rate >= 0.2) {
      sentences.push(
        `Steps started in the ${WINDOW_LABELS[best[0]].title.toLowerCase()} get finished more often (${Math.round(best[1].rate * 100)}%) than in the ${WINDOW_LABELS[worst[0]].title.toLowerCase()} (${Math.round(worst[1].rate * 100)}%).`
      );
    }
  }
  const recent = [...reflections].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 5);
  const heavyPlans = recent.filter((r) => r.planFelt === "too_heavy").length;
  const lightPlans = recent.filter((r) => r.planFelt === "too_light").length;
  if (heavyPlans >= 2) sentences.push("Recent plans felt too heavy; the budget is already adjusted down.");
  if (lightPlans >= 2) sentences.push("Recent plans felt too light; the budget is already adjusted up.");
  const adjustmentPercent = Math.round((multiplier - 1) * 100);
  if (adjustmentPercent !== 0) sentences.push(`Today's budget is adjusted ${adjustmentPercent > 0 ? "+" : ""}${adjustmentPercent}% from reflections.`);
  return sentences;
}
