import type { Reflection } from "../data/types";

/**
 * The adaptation loop: recent reflections nudge the next plan's minute budget.
 * "lighter" → ×0.85, "heavier" → ×1.12, "same" → decay back toward 1.
 * Last 5 reflections, clamped to 0.5–1.5. Transparent: always shown in the UI.
 */
export function capacityMultiplier(reflections: Reflection[]): number {
  const recent = [...reflections]
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
    .slice(-5);

  let f = 1;
  for (const r of recent) {
    if (r.nextPlanPreference === "lighter") f *= 0.85;
    else if (r.nextPlanPreference === "heavier") f *= 1.12;
    else f = 1 + (f - 1) * 0.6;
  }
  return Math.min(1.5, Math.max(0.5, f));
}

/** "−15%" / "+12%" / null when effectively neutral. */
export function multiplierLabel(multiplier: number): string | null {
  const pct = Math.round((multiplier - 1) * 100);
  if (pct === 0) return null;
  return pct > 0 ? `+${pct}%` : `−${Math.abs(pct)}%`;
}
