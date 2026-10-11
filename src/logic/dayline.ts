// Day Line geometry without React or DOM access, shared by the hero,
// compact strip, week thumbnails, and landing demo. Fractional coordinates
// keep animation smooth when capacity or available width changes.

import type { DayWindow, PlanAction } from "../data/types";
import { MAX_DAY_MINUTES } from "./capacity";

export interface DayLineInput {
  actions: PlanAction[];
  budgetMinutes: number;
  /** Width of the drawable area in px. */
  width: number;
  height: number;
  /** Horizontal padding so round stops never clip. */
  pad?: number;
  /** The minutes that correspond to the full width. Defaults to the model's max day. */
  maxMinutes?: number;
  /** Stop radius scale, 1 for the hero. */
  scale?: number;
  windows?: DayWindow[];
}

export interface DayLineStop {
  id: string;
  taskId: string;
  title: string;
  minutes: number;
  completed: boolean;
  /** 0..1 along the full track. */
  startFrac: number;
  endFrac: number;
  x: number;
  y: number;
  r: number;
  /** Path for the thick segment this step occupies on the line. */
  segment: string;
  window?: DayWindow;
}

export interface DayLineLayout {
  width: number;
  height: number;
  pad: number;
  /** 0..1: how far along the track today's horizon sits. */
  horizonFrac: number;
  horizonX: number;
  horizonY: number;
  /** Faint full-day track. */
  trackPath: string;
  /** The solid line up to today's horizon. */
  linePath: string;
  /** Portion of the horizon line already walked (completed minutes). */
  donePath: string;
  doneFrac: number;
  nowX: number;
  nowY: number;
  stops: DayLineStop[];
  /** Window labels and their x centers, when windows are known. */
  windowMarks: { window: DayWindow; x: number; startX: number; endX: number }[];
  /** Minutes of budget not planned yet. */
  spareMinutes: number;
}

const SAMPLES = 32;
const SEGMENT_SAMPLES = 6;

export function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** Monotonic budget-to-horizon mapping: keep 25-minute days legible and reach full width at 200 minutes. */
export function horizonFracFor(budget: number, maxMinutes: number): number {
  const t = clamp01(budget / maxMinutes);
  return clamp01(0.22 + 0.78 * Math.pow(t, 0.8));
}

/** A shallow upward bow, with t from 0 to 1. Keep text aligned while giving the line a path shape. */
function curveY(t: number, height: number): number {
  const base = height * 0.56;
  const amplitude = height * 0.16;
  return base - amplitude * Math.sin(Math.PI * t);
}

function xAt(t: number, pad: number, usable: number): number {
  return pad + usable * t;
}

function samplePath(
  from: number,
  to: number,
  sampleCount: number,
  pad: number,
  usableWidth: number,
  height: number
): string {
  if (to <= from) {
    const x = xAt(from, pad, usableWidth);
    const y = curveY(from, height);
    // A zero-length path still needs n points so `d` interpolates during animation.
    return Array.from({ length: sampleCount }, (_, i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
  }
  const parts: string[] = [];
  for (let i = 0; i < sampleCount; i++) {
    const t = from + ((to - from) * i) / (sampleCount - 1);
    parts.push(`${i === 0 ? "M" : "L"}${xAt(t, pad, usableWidth).toFixed(2)} ${curveY(t, height).toFixed(2)}`);
  }
  return parts.join(" ");
}

export function layoutDayLine(input: DayLineInput): DayLineLayout {
  const pad = input.pad ?? 22;
  const width = Math.max(input.width, pad * 2 + 10);
  const height = input.height;
  const usableWidth = width - pad * 2;
  const maxMinutes = input.maxMinutes ?? MAX_DAY_MINUTES;
  const scale = input.scale ?? 1;

  const budget = Math.max(0, input.budgetMinutes);
  const horizonFrac = horizonFracFor(budget, maxMinutes);
  const horizonX = xAt(horizonFrac, pad, usableWidth);
  const horizonY = curveY(horizonFrac, height);

  const plannedMinutes = input.actions.reduce((s, a) => s + a.estimatedMinutes, 0);
  // Scale the filled stretch by planned/budget: leave spare room when the
  // plan is under budget and reach the horizon when it fills the budget.
  const fillFrac = budget > 0 ? Math.min(1, plannedMinutes / budget) : 0;
  const plannedTotal = plannedMinutes > 0 ? plannedMinutes : 1;
  const fillEnd = horizonFrac * fillFrac;

  let elapsedMinutes = 0;
  let doneMinutes = 0;
  const segments = input.actions.map((a) => {
    const startFrac = fillEnd * (elapsedMinutes / plannedTotal);
    elapsedMinutes += a.estimatedMinutes;
    const endFrac = fillEnd * (elapsedMinutes / plannedTotal);
    if (a.completed) doneMinutes += a.estimatedMinutes;
    const r = Math.min(16, Math.max(6.5, 5 + Math.sqrt(a.estimatedMinutes) * 1.35)) * scale;
    return { a, startFrac, endFrac, r };
  });

  // Start with proportional centers, then separate neighbors by at least
  // one stop diameter. Continuous adjustment keeps stops moving smoothly
  // as the dial changes.
  const centers = segments.map((s) => (s.startFrac + s.endFrac) / 2);
  if (segments.length > 1) {
    const gapFor = (i: number) => (segments[i].r + segments[i - 1].r + 4) / usableWidth;
    for (let i = 1; i < segments.length; i++) centers[i] = Math.max(centers[i], centers[i - 1] + gapFor(i));
    // If the stops exceed the filled stretch, shift the group back and compress
    // from the right, keeping the final stop near the horizon.
    const overrun = centers[centers.length - 1] - Math.max(fillEnd - segments[segments.length - 1].r / usableWidth, 0);
    if (overrun > 0) {
      for (let i = 0; i < centers.length; i++) centers[i] -= overrun;
      for (let i = centers.length - 2; i >= 0; i--) centers[i] = Math.min(centers[i], centers[i + 1] - gapFor(i + 1));
      const leftOverhang = segments[0].r / usableWidth - centers[0];
      if (leftOverhang > 0) {
        // Not enough room even when packed: spread evenly across what there is.
        const n = segments.length;
        const inset = Math.min(fillEnd / (2 * n), segments[0].r / usableWidth);
        for (let k = 0; k < n; k++) centers[k] = inset + ((fillEnd - 2 * inset) * k) / (n - 1);
      }
    }
  }

  const stops: DayLineStop[] = segments.map((s, i) => {
    const mid = centers[i];
    // Leave a hairline gap between neighboring segments so they read as steps.
    const gap = Math.min(3 / usableWidth, (s.endFrac - s.startFrac) * 0.12);
    return {
      id: s.a.id,
      taskId: s.a.taskId,
      title: s.a.title,
      minutes: s.a.estimatedMinutes,
      completed: s.a.completed,
      startFrac: s.startFrac,
      endFrac: s.endFrac,
      x: xAt(mid, pad, usableWidth),
      y: curveY(mid, height),
      r: s.r,
      segment: samplePath(s.startFrac + gap, s.endFrac - gap, SEGMENT_SAMPLES, pad, usableWidth, height),
      window: s.a.window
    };
  });

  // Completed minutes determine the walked portion. Place "Now" at the
  // first unfinished stop.
  const doneFrac = plannedMinutes > 0 ? fillEnd * (doneMinutes / plannedMinutes) : 0;
  const nextStop = stops.find((s) => !s.completed);
  const nowX = nextStop ? nextStop.x : xAt(doneFrac, pad, usableWidth);
  const nowY = nextStop ? nextStop.y : curveY(doneFrac, height);

  const windowMarks: DayLineLayout["windowMarks"] = [];
  if (input.windows && input.windows.length > 0 && stops.length > 0) {
    const order: DayWindow[] = ["morning", "afternoon", "evening"];
    const availableWindows = [...input.windows].sort((a, b) => order.indexOf(a) - order.indexOf(b));
    for (const window of availableWindows) {
      const windowStops = stops.filter((s) => s.window === window);
      if (windowStops.length === 0) continue;
      const startX = xAt(windowStops[0].startFrac, pad, usableWidth);
      const endX = xAt(windowStops[windowStops.length - 1].endFrac, pad, usableWidth);
      windowMarks.push({ window, x: (startX + endX) / 2, startX, endX });
    }
  }

  return {
    width,
    height,
    pad,
    horizonFrac,
    horizonX,
    horizonY,
    trackPath: samplePath(0, 1, SAMPLES, pad, usableWidth, height),
    linePath: samplePath(0, horizonFrac, SAMPLES, pad, usableWidth, height),
    donePath: samplePath(0, doneFrac, SAMPLES, pad, usableWidth, height),
    doneFrac,
    nowX,
    nowY,
    stops,
    windowMarks,
    spareMinutes: Math.max(0, budget - plannedMinutes)
  };
}

/** Stable color slot per task so the same task keeps its hue across screens. */
export function colorIndexFor(taskId: string, taskOrder: string[]): number {
  const knownIndex = taskOrder.indexOf(taskId);
  if (knownIndex >= 0) return knownIndex % 8;
  let hash = 0;
  for (let i = 0; i < taskId.length; i++) hash = (hash * 31 + taskId.charCodeAt(i)) >>> 0;
  return hash % 8;
}

/** Eight evenly spread hues, chosen to stay distinct in light and dark. */
export const TASK_HUES = [185, 300, 60, 150, 250, 20, 110, 330];
