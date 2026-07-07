import type { CapacityLevel, PlanReason } from "../data/types";

export const CAPACITY_LABELS: Record<CapacityLevel, { title: string; hint: string }> = {
  low: { title: "Low", hint: "I need the smallest possible steps" },
  medium: { title: "Medium", hint: "Some focused work, but not everything" },
  high: { title: "High", hint: "I can handle a bigger plan" },
  unsure: { title: "Not sure", hint: "Help me start gently" }
};

export const REASON_LABELS: Record<PlanReason, string> = {
  urgent: "Past due / today",
  deadline: "Due soon",
  communication: "Message first",
  quick_win: "Quick win",
  low_capacity: "Gentle start",
  momentum: "Steady progress"
};

export const REASON_TONES: Record<PlanReason, "warn" | "brand" | "good" | "neutral"> = {
  urgent: "warn",
  deadline: "warn",
  communication: "brand",
  quick_win: "good",
  low_capacity: "brand",
  momentum: "neutral"
};

export function greeting(hour: number): string {
  if (hour < 5) return "Hi";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function minutesLabel(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
