import { useCallback, useSyncExternalStore } from "react";
import { AIError } from "../ai/client";
import { runAIPlan, type AIPlanContext } from "../ai/planner";
import { getProfile, listEventsBetween, savePlanForToday } from "../data/repo";
import { todayISO } from "../lib/dates";
import type { BuiltPlan } from "../logic/scheduler";

export type AIPhase = "idle" | "composing" | "done" | "fallback";

export interface AIPlanState {
  phase: AIPhase;
  /** The paragraph as it streams in. */
  reasoning: string;
  notice: string | null;
  mode: string | null;
}

// Keep the planning run outside React so navigation does not cancel it.
// Screens subscribe to the same state, including streamed reasoning. The
// run saves its result even when no screen is mounted.

let state: AIPlanState = { phase: "idle", reasoning: "", notice: null, mode: null };
let inFlight: AbortController | null = null;
const listeners = new Set<() => void>();

function setState(next: AIPlanState) {
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function fallbackNotice(error: unknown): string | null {
  const fallback = "The planner hit a snag, so this plan was made on this device.";
  if (!(error instanceof AIError)) return fallback;

  if (error.code === "plan_limit") {
    return "Your plan's allowance for Pace is used up for now, so this plan was made on this device.";
  }
  if (error.code === "rate_limit") {
    return "Pace has planned a lot for this device today, so this plan was made on this device. The AI planner comes back tomorrow.";
  }
  if (error.code === "reauth") {
    return "Pace needs you to sign in again (Settings). This plan was made on this device.";
  }
  if (error.code === "no_provider") return null;
  if (error.code === "network" || error.code === "timeout") {
    return "Couldn't reach the planner, so this plan was made on this device.";
  }
  return fallback;
}

export function cancelAIPlan() {
  inFlight?.abort();
  inFlight = null;
}

export async function runPlan(localPlan: BuiltPlan | null, context: Omit<AIPlanContext, "profile" | "events">) {
  cancelAIPlan();
  if (localPlan) await savePlanForToday(localPlan);
  const controller = new AbortController();
  inFlight = controller;
  setState({ phase: "composing", reasoning: "", notice: null, mode: null });
  try {
    const today = todayISO();
    const [profile, events] = await Promise.all([getProfile(), listEventsBetween(today, today)]);
    const result = await runAIPlan(
      { ...context, profile, events },
      {
        signal: controller.signal,
        onReasoning: (text) => {
          if (state.phase === "composing" && inFlight === controller) setState({ ...state, reasoning: text });
        }
      }
    );
    if (controller.signal.aborted) return;
    if (result.plan.actions.length === 0) {
      setState({ phase: "fallback", reasoning: "", notice: "The planner came back empty, so today's plan was made on this device.", mode: result.mode });
      return;
    }
    await savePlanForToday(result.plan);
    setState({ phase: "done", reasoning: result.plan.reasoning ?? "", notice: null, mode: result.mode });
  } catch (error) {
    if (controller.signal.aborted) return;
    setState({ phase: "fallback", reasoning: "", notice: fallbackNotice(error), mode: "local" });
  } finally {
    if (inFlight === controller) inFlight = null;
  }
}

/** Subscribe a screen to the shared planning run. */
export function useAIPlan() {
  const snapshot = useSyncExternalStore(subscribe, () => state, () => state);
  const run = useCallback(runPlan, []);
  const cancel = useCallback(cancelAIPlan, []);
  return { state: snapshot, run, cancel, aiEnabled: true };
}
