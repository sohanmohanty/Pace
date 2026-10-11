// Map the 0 to 100 dial to planner limits and capacity labels. The labels
// preserve compatibility with existing records and tests. Piecewise-linear,
// monotonic curves keep the animated Day Line smooth as the thumb moves
// and make the model straightforward to inspect.

import type { CapacityLevel, DayWindow, WorkType } from "../data/types";
import type { CapacityParams } from "./scheduler";

export const DIAL_MIN = 0;
export const DIAL_MAX = 100;
/** The longest day the model ever plans, in minutes. The Day Line's full width. */
export const MAX_DAY_MINUTES = 200;

/** Default dial positions for the four plain-language labels. */
export const DIAL_FOR: Record<CapacityLevel, number> = {
  low: 20,
  unsure: 35,
  medium: 50,
  high: 85
};

export function clampDial(d: number): number {
  if (!Number.isFinite(d)) return DIAL_FOR.medium;
  return Math.min(DIAL_MAX, Math.max(DIAL_MIN, Math.round(d)));
}

/** Derived label. "unsure" is never derived; it is an explicit choice. */
export function capacityForDial(dial: number): Exclude<CapacityLevel, "unsure"> {
  const d = clampDial(dial);
  if (d <= 30) return "low";
  if (d <= 62) return "medium";
  return "high";
}

type Curve = [dial: number, value: number][];

function interp(curve: Curve, dial: number): number {
  const d = clampDial(dial);
  for (let i = 1; i < curve.length; i++) {
    const [x0, y0] = curve[i - 1];
    const [x1, y1] = curve[i];
    if (d <= x1) {
      const t = (d - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    }
  }
  return curve[curve.length - 1][1];
}

const BUDGET_CURVE: Curve = [
  [0, 15],
  [20, 30],
  [35, 45],
  [50, 70],
  [62, 90],
  [75, 120],
  [85, 150],
  [100, MAX_DAY_MINUTES]
];

const BLOCK_CURVE: Curve = [
  [0, 10],
  [30, 15],
  [50, 25],
  [62, 35],
  [80, 50],
  [100, 60]
];

const round5 = (m: number) => Math.max(5, Math.round(m / 5) * 5);

/** Base minute budget for a dial position, before reflections and time caps. */
export function budgetForDial(dial: number): number {
  return round5(interp(BUDGET_CURVE, dial));
}

/** Unrounded budget curve for smooth Day Line horizon movement. */
export function smoothBudgetForDial(dial: number): number {
  const d = Math.min(DIAL_MAX, Math.max(DIAL_MIN, dial));
  return interp(BUDGET_CURVE, d);
}

/** Longest single step the plan may ask for at this dial. */
export function maxBlockForDial(dial: number): number {
  return round5(interp(BLOCK_CURVE, dial));
}

/** Full scheduler parameters for a dial position. */
export function paramsForDial(dial: number): CapacityParams {
  const d = clampDial(dial);
  const level = capacityForDial(d);
  return {
    budgetMinutes: budgetForDial(d),
    maxBlock: maxBlockForDial(d),
    maxActions: level === "low" ? 3 : level === "medium" ? 5 : 6,
    maxChained: level === "low" ? 0 : level === "medium" ? 3 : 4
  };
}

/** Plain-language label for a dial value, for aria-valuetext and headings. */
export function dialLabel(dial: number): string {
  const d = clampDial(dial);
  if (d <= 12) return "a very low day";
  if (d <= 30) return "a low day";
  if (d <= 45) return "a gentle day";
  if (d <= 62) return "a medium day";
  if (d <= 80) return "a good day";
  return "a high-energy day";
}

/** Hue for the capacity tint: dusk violet at 0, teal in the middle, amber at 100. */
export function tintHueForDial(dial: number): number {
  const d = clampDial(dial) / 100;
  // 300 → 185 over the first half, 185 → 70 over the second.
  return d <= 0.5 ? 300 - (300 - 185) * (d / 0.5) : 185 - (185 - 70) * ((d - 0.5) / 0.5);
}

export const WINDOW_LABELS: Record<DayWindow, { title: string; hint: string }> = {
  morning: { title: "Morning", hint: "before noon" },
  afternoon: { title: "Afternoon", hint: "noon to 5" },
  evening: { title: "Evening", hint: "after 5" }
};

export const WORK_TYPE_LABELS: Record<WorkType, string> = {
  reading: "Reading",
  writing: "Writing",
  problems: "Problem sets",
  people: "Talking to people",
  making: "Building or making"
};

/** Which window the clock is in right now. */
export function currentWindow(hour = new Date().getHours()): DayWindow {
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

/** Windows that are still ahead today (including the current one). */
export function remainingWindows(hour = new Date().getHours()): DayWindow[] {
  const now = currentWindow(hour);
  const all: DayWindow[] = ["morning", "afternoon", "evening"];
  return all.slice(all.indexOf(now));
}

/** Infer work type from the title and step type; AI breakdown supplies it explicitly. */
export function guessWorkType(title: string, kind?: string): WorkType {
  const t = title.toLowerCase();
  if (kind === "communication" || /\b(email|message|ask|talk|meet|contact|reply)\b/.test(t)) return "people";
  if (/\b(read|skim|chapter|pages|article|notes?|review|study|flashcards?|vocab)\b/.test(t)) return "reading";
  if (/\b(write|draft|essay|paragraph|outline|thesis|revise|summary|reflection|conclusion|intro)\b/.test(t)) return "writing";
  if (/\b(problem|practice|solve|worksheet|equations?|calculate|proof|set \d|problems)\b/.test(t)) return "problems";
  if (/\b(build|code|project|lab|design|slides|poster|model|prototype|record)\b/.test(t)) return "making";
  return "writing";
}
