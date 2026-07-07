import type { CapacityLevel, Level, PlanReason, SubtaskType } from "../data/types";
import { daysUntil } from "../lib/dates";

export interface ScoreFactors {
  urgency: number;
  importance: number;
  communication: number;
  fit: number;
  quickWin: number;
  daysUntilDue: number | null;
}

/** Urgency from due date. Overdue work matters most — it is the re-entry pile. */
export function urgencyScore(dueISO: string | undefined, todayISO: string): number {
  if (!dueISO) return 1;
  const days = daysUntil(dueISO, todayISO);
  if (days < 0) return 10;
  if (days === 0) return 9;
  if (days <= 2) return 7;
  if (days <= 5) return 5;
  return 2;
}

/** How well an action's size and difficulty fit today's capacity. */
export function capacityFit(minutes: number, difficulty: number, capacity: CapacityLevel): number {
  if (capacity === "low") {
    if (minutes <= 15 && difficulty <= 3) return 5;
    if (minutes <= 25) return 2;
    return -5;
  }
  if (capacity === "medium") {
    if (minutes <= 35) return 5;
    if (minutes <= 60) return 2;
    return -2;
  }
  if (capacity === "high") {
    return 3;
  }
  // unsure — favor low-pressure first steps
  if (minutes <= 20) return 4;
  return -1;
}

export function communicationBoost(isCommunication: boolean): number {
  return isCommunication ? 4 : 0;
}

export function quickWinBonus(minutes: number, difficulty: number): number {
  return minutes <= 10 && difficulty <= 2 ? 2 : 0;
}

export interface Scorable {
  minutes: number;
  difficulty: Level;
  importance: Level;
  kind: SubtaskType | "task";
  dueDate?: string;
}

export function scoreCandidate(
  c: Scorable,
  capacity: CapacityLevel,
  todayISO: string
): { total: number; factors: ScoreFactors } {
  const factors: ScoreFactors = {
    urgency: urgencyScore(c.dueDate, todayISO),
    importance: c.importance,
    communication: communicationBoost(c.kind === "communication"),
    fit: capacityFit(c.minutes, c.difficulty, capacity),
    quickWin: quickWinBonus(c.minutes, c.difficulty),
    daysUntilDue: c.dueDate ? daysUntil(c.dueDate, todayISO) : null
  };
  const total =
    factors.urgency * 1.5 +
    factors.importance * 1.2 +
    factors.communication +
    factors.fit +
    factors.quickWin;
  return { total, factors };
}

/** Reason label for the UI chip. */
export function reasonFor(
  c: Scorable,
  factors: ScoreFactors,
  capacity: CapacityLevel
): PlanReason {
  if (c.kind === "communication") return "communication";
  if (factors.daysUntilDue !== null && factors.daysUntilDue <= 0) return "urgent";
  if (factors.daysUntilDue !== null && factors.daysUntilDue <= 2) return "deadline";
  if (factors.quickWin > 0) return "quick_win";
  if (capacity === "low") return "low_capacity";
  return "momentum";
}

/** Honest, human-readable answer to "why this?". */
export function whyText(factors: ScoreFactors, kind: SubtaskType | "task"): string {
  const parts: string[] = [];
  if (factors.daysUntilDue !== null) {
    if (factors.daysUntilDue < 0) parts.push("past due — a small restart counts");
    else if (factors.daysUntilDue === 0) parts.push("due today");
    else if (factors.daysUntilDue <= 2) parts.push("due very soon");
    else if (factors.daysUntilDue <= 5) parts.push("due this week");
  }
  if (kind === "communication") parts.push("a quick message can unlock help");
  if (factors.importance >= 4) parts.push("high importance");
  if (factors.quickWin > 0) parts.push("small win to build momentum");
  if (factors.fit >= 4) parts.push("fits today's capacity");
  if (parts.length === 0) parts.push("steady progress");
  const s = parts.join(" · ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}
