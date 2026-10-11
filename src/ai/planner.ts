// Build a bounded request, call the planner, and validate its proposal.
// Callers save a local draft first and keep it if the AI call fails.

import type { CheckIn, FixedEvent, Plan, Profile, Reflection, Subtask, Task } from "../data/types";
import { daysUntil } from "../lib/dates";
import { capacityForDial, clampDial, paramsForDial, remainingWindows } from "../logic/capacity";
import { learnedSentences } from "../logic/learning";
import { computeBudget, type BuiltPlan } from "../logic/scheduler";
import { validateProposal } from "../logic/validate";
import type { BreakdownRequest, PlanRequest } from "../shared/schema";
import { ai, nowHHMM, partialReasoning, todayISO, weekdayName, type StreamHandlers } from "./client";

export interface AIPlanContext {
  tasks: Task[];
  subtasks: Subtask[];
  checkIn: CheckIn;
  profile: Profile;
  reflections: Reflection[];
  multiplier: number;
  events?: FixedEvent[];
  /** For replans: the current plan, so done steps are kept out. */
  currentPlan?: Plan | null;
  instruction?: string;
  mode?: "plan" | "replan";
  /** Injectable for evals and tests; defaults to the device's today. */
  today?: string;
}

const MAX_TASKS = 40;

/** Build a bounded planning request without task notes. */
export function buildPlanRequest(context: AIPlanContext): { request: PlanRequest; budget: number; params: ReturnType<typeof paramsForDial>; capacity: "low" | "medium" | "high" | "unsure" } {
  const today = context.today ?? todayISO();
  const dial = clampDial(context.checkIn.dial ?? 55);
  const capacity = context.checkIn.capacity === "unsure" ? "unsure" : capacityForDial(dial);
  let params = paramsForDial(dial);
  if (capacity === "unsure") params = { ...params, maxBlock: Math.min(params.maxBlock, 20), maxChained: 0, maxActions: 3 };
  const budget = computeBudget(capacity, context.multiplier, context.checkIn.availableMinutes, params.budgetMinutes);

  const open = context.tasks
    .filter((t) => !t.archived && t.status !== "done")
    .sort((a, b) => {
      const firstDueDate = a.dueDate ?? "9999-12-31";
      const secondDueDate = b.dueDate ?? "9999-12-31";
      if (firstDueDate !== secondDueDate) return firstDueDate < secondDueDate ? -1 : 1;
      return b.importance - a.importance;
    })
    .slice(0, MAX_TASKS);

  const doneSubIds = new Set(
    (context.currentPlan?.actions ?? []).filter((a) => a.completed && a.subtaskId).map((a) => a.subtaskId as string)
  );

  const tasks: PlanRequest["tasks"] = open.map((t) => ({
    id: t.id,
    title: t.title,
    course: t.course ?? null,
    dueDate: t.dueDate ?? null,
    daysUntilDue: t.dueDate ? daysUntil(t.dueDate, today) : null,
    estimatedMinutes: t.estimatedMinutes,
    difficulty: t.difficulty,
    importance: t.importance,
    status: t.status,
    needsCommunication: t.needsCommunication,
    steps: context.subtasks
      .filter((s) => s.taskId === t.id)
      .sort((a, b) => a.order - b.order)
      .map((s) => ({
        id: s.id,
        title: s.title,
        minutes: s.estimatedMinutes,
        type: s.type,
        done: s.status === "done" || doneSubIds.has(s.id),
        order: s.order,
        workType: s.workType ?? null,
        firstAction: s.firstAction ?? null
      }))
  }));

  const windows = context.checkIn.windows && context.checkIn.windows.length > 0 ? context.checkIn.windows : remainingWindows();
  const doneToday = (context.currentPlan?.actions ?? []).filter((a) => a.completed).map((a) => a.title);

  const request: PlanRequest = {
    mode: context.mode ?? (doneToday.length > 0 || context.instruction ? "replan" : "plan"),
    today,
    now: nowHHMM(),
    weekday: weekdayName(),
    checkIn: {
      dial,
      capacity,
      windows,
      heavy: context.checkIn.heavy ?? [],
      availableMinutes: context.checkIn.availableMinutes ?? null
    },
    limits: {
      budgetMinutes: budget,
      maxActions: params.maxActions + params.maxChained,
      maxBlock: params.maxBlock,
      maxMessages: capacity === "high" ? 2 : 1
    },
    tasks,
    fixedEvents: (context.events ?? []).filter((e) => e.date === today).map((e) => ({ title: e.title, start: e.start, end: e.end })),
    learned: learnedSentences(context.profile, context.reflections, context.multiplier),
    doneToday,
    instruction: context.instruction?.trim() || null
  };
  return { request, budget, params, capacity };
}

export interface AIPlanOutcome {
  plan: BuiltPlan;
  repairs: string[];
  mode: string;
  model: string;
}

/** Call the planner, stream the paragraph, validate, and shape a BuiltPlan. */
export async function runAIPlan(
  context: AIPlanContext,
  handlers: { onReasoning?: (text: string) => void; signal?: AbortSignal } = {}
): Promise<AIPlanOutcome> {
  const { request, budget, params, capacity } = buildPlanRequest(context);
  const streamHandlers: StreamHandlers = {
    signal: handlers.signal,
    onDelta: handlers.onReasoning ? (acc) => handlers.onReasoning?.(partialReasoning(acc)) : undefined
  };
  const { result, mode, model } = await ai.plan(request, streamHandlers);
  const doneSubIds = new Set(
    (context.currentPlan?.actions ?? []).filter((a) => a.completed && a.subtaskId).map((a) => a.subtaskId as string)
  );
  const validated = validateProposal({
    proposal: result,
    tasks: context.tasks,
    subtasks: context.subtasks,
    budgetMinutes: budget,
    params,
    capacity,
    windows: request.checkIn.windows,
    today: request.today,
    doneSubtaskIds: doneSubIds
  });
  const plan: BuiltPlan = {
    actions: validated.actions,
    budgetMinutes: budget,
    multiplier: context.multiplier,
    capacity: context.checkIn.capacity,
    dial: request.checkIn.dial,
    windows: request.checkIn.windows,
    source: "ai",
    reasoning: validated.reasoning
  };
  return { plan, repairs: validated.repairs, mode, model };
}

/** Task-specific steps from the model, shaped as subtasks. */
export async function runAIBreakdown(
  task: Task,
  profile: Profile,
  reflections: Reflection[],
  multiplier: number,
  details?: string
): Promise<{ steps: Omit<Subtask, "id" | "taskId" | "status" | "order">[]; totalMinutes: number; note: string }> {
  const request: BreakdownRequest = {
    task: {
      id: task.id,
      title: task.title,
      course: task.course ?? null,
      dueDate: task.dueDate ?? null,
      estimatedMinutes: task.estimatedMinutes,
      difficulty: task.difficulty,
      importance: task.importance,
      needsCommunication: task.needsCommunication,
      details: details?.trim() || null
    },
    today: todayISO(),
    learned: learnedSentences(profile, reflections, multiplier)
  };
  const { result } = await ai.breakdown(request);
  const steps = result.steps.map((s) => ({
    title: s.title.trim().slice(0, 140),
    estimatedMinutes: Math.min(60, Math.max(5, Math.round(s.minutes / 5) * 5)),
    difficulty: Math.min(5, Math.max(1, Math.round(s.difficulty))) as Subtask["difficulty"],
    type: s.type,
    firstAction: s.firstAction.trim().slice(0, 160),
    workType: s.workType,
    source: "ai" as const,
    demo: task.demo
  }));
  return { steps, totalMinutes: result.totalMinutes, note: result.note };
}
