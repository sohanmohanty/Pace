import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../data/db";
import { getTodayCheckIn, getTodayPlan, listReflections } from "../data/repo";
import type { CheckIn, DayWindow, Plan, Subtask, Task, WorkType } from "../data/types";
import { capacityMultiplier } from "../logic/adaptation";
import { DIAL_FOR, remainingWindows } from "../logic/capacity";
import { generatePlan, type BuiltPlan } from "../logic/scheduler";

/** Shared planner subscriptions for Today, Adjust, and Focus. */
export function usePlannerData() {
  const allTasks = useLiveQuery(() => db.tasks.toArray(), []);
  const subtasks = useLiveQuery(() => db.subtasks.toArray(), []);
  const checkIn = useLiveQuery(async () => (await getTodayCheckIn()) ?? null, []);
  const plan = useLiveQuery(async () => (await getTodayPlan()) ?? null, []);
  const reflections = useLiveQuery(() => listReflections(), []);

  const ready =
    allTasks !== undefined &&
    subtasks !== undefined &&
    checkIn !== undefined &&
    plan !== undefined &&
    reflections !== undefined;

  const activeTasks = useMemo(() => (allTasks ?? []).filter((t) => !t.archived), [allTasks]);
  const openTasks = useMemo(() => activeTasks.filter((t) => t.status !== "done"), [activeTasks]);
  const multiplier = useMemo(() => capacityMultiplier(reflections ?? []), [reflections]);
  const taskById = useMemo(() => new Map(activeTasks.map((t) => [t.id, t])), [activeTasks]);

  return {
    ready,
    allTasks: allTasks ?? [],
    activeTasks,
    openTasks,
    subtasks: subtasks ?? [],
    checkIn: (checkIn ?? null) as CheckIn | null,
    plan: (plan ?? null) as Plan | null,
    reflections: reflections ?? [],
    multiplier,
    taskById
  };
}

export interface DraftCheckIn {
  dial: number;
  unsure: boolean;
  windows: DayWindow[];
  heavy: WorkType[];
  availableMinutes: number;
}

export function draftFromCheckIn(checkIn: CheckIn | null): DraftCheckIn {
  return {
    dial: checkIn?.dial ?? (checkIn ? DIAL_FOR[checkIn.capacity] : DIAL_FOR.medium),
    unsure: checkIn?.capacity === "unsure",
    windows: checkIn?.windows ?? [],
    heavy: checkIn?.heavy ?? [],
    availableMinutes: checkIn?.availableMinutes ?? 0
  };
}

/** Build a local plan from a draft check-in; safe to run on each slider tick. */
export function buildLocalPlan(
  draft: DraftCheckIn,
  tasks: Task[],
  subtasks: Subtask[],
  multiplier: number,
  shrink = false
): BuiltPlan {
  return generatePlan({
    tasks,
    subtasks,
    capacity: draft.unsure ? "unsure" : "medium",
    dial: draft.dial,
    // No windows chosen means "the rest of today", not "all day".
    windows: draft.windows.length > 0 ? draft.windows : remainingWindows(),
    heavy: draft.heavy.length > 0 ? draft.heavy : undefined,
    multiplier,
    availableMinutes: draft.availableMinutes || undefined,
    shrink
  });
}

/** Order tasks by due date and title to keep colors consistent. */
export function taskOrderFor(tasks: Task[]): string[] {
  return [...tasks]
    .sort((a, b) => {
      const firstDueDate = a.dueDate ?? "9999-12-31";
      const secondDueDate = b.dueDate ?? "9999-12-31";
      if (firstDueDate !== secondDueDate) return firstDueDate < secondDueDate ? -1 : 1;
      return a.title.localeCompare(b.title);
    })
    .map((t) => t.id);
}
