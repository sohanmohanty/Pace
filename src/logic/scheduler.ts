import type {
  CapacityLevel,
  DayWindow,
  Level,
  PlanAction,
  Subtask,
  SubtaskType,
  Task,
  WorkType
} from "../data/types";
import { todayISO as computeTodayISO } from "../lib/dates";
import { uid } from "../lib/id";
import { capacityForDial, clampDial, guessWorkType, paramsForDial } from "./capacity";
import { reasonFor, scoreCandidate, whyText, type ScoreFactors } from "./scoring";

/** Lower scores for work marked heavy today without excluding it. */
const HEAVY_PENALTY = 4;

function heavyAdjust(
  base: { title: string; kind: SubtaskType | "task" },
  total: number,
  heavy?: WorkType[]
): { total: number; workType: WorkType } {
  const workType = guessWorkType(base.title, base.kind);
  if (heavy && heavy.length > 0 && heavy.includes(workType)) {
    return { total: total - HEAVY_PENALTY, workType };
  }
  return { total, workType };
}

export interface CapacityParams {
  budgetMinutes: number;
  /** Cap on distinct starting points; the knapsack never exceeds it. */
  maxActions: number;
  maxBlock: number;
  /**
   * Extra slots for follow-on steps from tasks already selected. Templates
   * have many 5 to 15 minute steps; without these slots, a high-capacity day
   * can reach the action cap after 45 minutes of a 150-minute budget.
   */
  maxChained: number;
}

export const CAPACITY_PARAMS: Record<CapacityLevel, CapacityParams> = {
  low: { budgetMinutes: 30, maxActions: 3, maxBlock: 15, maxChained: 0 },
  medium: { budgetMinutes: 90, maxActions: 5, maxBlock: 35, maxChained: 3 },
  high: { budgetMinutes: 150, maxActions: 6, maxBlock: 60, maxChained: 4 },
  unsure: { budgetMinutes: 45, maxActions: 3, maxBlock: 20, maxChained: 0 }
};

const SHRINK_MAP: Record<CapacityLevel, CapacityLevel> = {
  high: "medium",
  medium: "low",
  unsure: "low",
  low: "low"
};

export interface Candidate {
  taskId: string;
  subtaskId?: string;
  title: string;
  minutes: number;
  difficulty: Level;
  importance: Level;
  kind: SubtaskType | "task";
  dueDate?: string;
  virtual: boolean;
  /** Subtask position, so chained steps of one task stay in sequence. */
  order?: number;
  /** Added by the fill pass: follows an earlier step of the same task. */
  chained?: boolean;
  workType?: WorkType;
  score: number;
  factors: ScoreFactors;
}

/** Budget after the reflection multiplier and the optional "time I have today" cap. */
export function computeBudget(
  capacity: CapacityLevel,
  multiplier = 1,
  availableMinutes?: number,
  baseOverride?: number
): number {
  const base = baseOverride ?? CAPACITY_PARAMS[capacity].budgetMinutes;
  let budget = Math.round((base * multiplier) / 5) * 5;
  budget = Math.min(240, Math.max(15, budget));
  if (availableMinutes && availableMinutes > 0) {
    budget = Math.min(budget, Math.max(10, Math.round(availableMinutes)));
  }
  return budget;
}

function starterStep(task: Task): Omit<Candidate, "score" | "factors"> {
  return {
    taskId: task.id,
    title: `Open “${task.title}” and do the first small piece`,
    minutes: 10,
    difficulty: 1,
    importance: task.importance,
    kind: "starter",
    dueDate: task.dueDate,
    virtual: true
  };
}

function virtualComm(task: Task): Omit<Candidate, "score" | "factors"> {
  return {
    taskId: task.id,
    title: task.course
      ? `Send your ${task.course} teacher a short update`
      : `Send a short update about ${task.title}`,
    minutes: 5,
    difficulty: 2,
    importance: task.importance,
    kind: "communication",
    dueDate: task.dueDate,
    virtual: true
  };
}

function groupSubtasks(subtasks: Subtask[]): Map<string, Subtask[]> {
  const byTask = new Map<string, Subtask[]>();
  for (const subtask of subtasks) {
    const list = byTask.get(subtask.taskId);
    if (list) list.push(subtask);
    else byTask.set(subtask.taskId, [subtask]);
  }
  for (const list of byTask.values()) list.sort((a, b) => a.order - b.order);
  return byTask;
}

function fromSubtask(task: Task, subtask: Subtask): Omit<Candidate, "score" | "factors"> {
  return {
    taskId: task.id,
    subtaskId: subtask.id,
    title: subtask.title,
    minutes: subtask.estimatedMinutes,
    difficulty: subtask.difficulty,
    importance: task.importance,
    kind: subtask.type,
    dueDate: task.dueDate,
    virtual: false,
    order: subtask.order
  };
}

/**
 * Consider the earliest unfinished work step per task. Communication steps
 * ignore sequence and do not block later work. Chunk oversized work or use
 * a starter, keep at most two candidates per task, and drop non-positive scores.
 */
export function buildCandidates(
  tasks: Task[],
  subtasks: Subtask[],
  capacity: CapacityLevel,
  todayISO: string,
  options: { params?: CapacityParams; heavy?: WorkType[]; maxComm?: number } = {}
): Candidate[] {
  const params = options.params ?? CAPACITY_PARAMS[capacity];
  const subtasksByTask = groupSubtasks(subtasks);

  const candidates: Candidate[] = [];
  for (const task of tasks) {
    if (task.status === "done" || task.archived) continue;
    const taskSteps = subtasksByTask.get(task.id) ?? [];
    const unfinishedSteps = taskSteps.filter((s) => s.status !== "done");
    const firstWork = unfinishedSteps.find((s) => s.type !== "communication");

    let next: Omit<Candidate, "score" | "factors"> | null = null;
    if (firstWork) {
      if (firstWork.estimatedMinutes <= params.maxBlock) {
        next = fromSubtask(task, firstWork);
      } else if (capacity === "low") {
        next = starterStep(task);
      } else {
        next = {
          ...fromSubtask(task, firstWork),
          title: `Spend ${params.maxBlock} min on: ${firstWork.title}`,
          minutes: params.maxBlock,
          kind: "focus",
          virtual: true
        };
      }
    } else if (taskSteps.length === 0) {
      if (task.estimatedMinutes <= params.maxBlock) {
        next = {
          taskId: task.id,
          title: task.title,
          minutes: task.estimatedMinutes,
          difficulty: task.difficulty,
          importance: task.importance,
          kind: "task",
          dueDate: task.dueDate,
          virtual: false
        };
      } else if (capacity === "low") {
        next = starterStep(task);
      } else {
        next = {
          taskId: task.id,
          title: `Spend ${params.maxBlock} min on ${task.title}`,
          minutes: params.maxBlock,
          difficulty: task.difficulty,
          importance: task.importance,
          kind: "focus",
          dueDate: task.dueDate,
          virtual: true
        };
      }
    }
    // (subs exist but all done → repo auto-completes the task; nothing to add)

    // Communication is exempt from ordering: it can always surface.
    let messageCandidate: Omit<Candidate, "score" | "factors"> | null = null;
    const messageStep = unfinishedSteps.find((s) => s.type === "communication");
    if (messageStep) {
      messageCandidate = fromSubtask(task, messageStep);
    } else if (task.needsCommunication && next?.kind !== "communication") {
      messageCandidate = virtualComm(task);
    }

    for (const c of [next, messageCandidate]) {
      if (!c) continue;
      const scored = scoreCandidate(c, capacity, todayISO);
      const { total, workType } = heavyAdjust(c, scored.total, options.heavy);
      if (total <= 0) continue;
      candidates.push({ ...c, score: total, factors: scored.factors, workType });
    }
  }

  // Deterministic order: score desc, then earlier due date, then title.
  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const ad = a.dueDate ?? "9999-12-31";
    const bd = b.dueDate ?? "9999-12-31";
    if (ad !== bd) return ad < bd ? -1 : 1;
    return a.title.localeCompare(b.title);
  });

  // Cap short message steps with boosted scores at one, or two on high days, so they do
  // not fill the plan. Remaining messages can appear on later days.
  const maxComm = options.maxComm ?? (capacity === "high" ? 2 : 1);
  let messageCount = 0;
  const capped = candidates.filter((c) => {
    if (c.kind !== "communication") return true;
    messageCount += 1;
    return messageCount <= maxComm;
  });

  // Limit the DP to 80 candidates, well above a typical task list.
  return capped.slice(0, 80);
}

/**
 * Exact bounded knapsack selection under the minute budget and action cap.
 * dp[i][c][m] is the best score using the first i candidates with at most
 * c actions and m minutes.
 */
export function selectCandidates(
  candidates: Candidate[],
  budgetMinutes: number,
  maxActions: number
): Candidate[] {
  const n = candidates.length;
  if (n === 0 || budgetMinutes <= 0 || maxActions <= 0) return [];
  const minuteLimit = Math.floor(budgetMinutes);
  const actionLimit = Math.min(maxActions, n);
  const width = minuteLimit + 1;
  const costs = candidates.map((c) => Math.max(1, Math.round(c.minutes)));
  const scores = candidates.map((c) => Math.max(1, Math.round(c.score * 100)));

  const layers: Int32Array[] = [];
  let previousLayer = new Int32Array((actionLimit + 1) * width);
  for (let i = 0; i < n; i++) {
    const currentLayer = Int32Array.from(previousLayer);
    const w = costs[i];
    const v = scores[i];
    for (let c = 1; c <= actionLimit; c++) {
      const previousRow = (c - 1) * width;
      const currentRow = c * width;
      for (let m = w; m <= minuteLimit; m++) {
        const withItem = previousLayer[previousRow + m - w] + v;
        if (withItem > currentLayer[currentRow + m]) currentLayer[currentRow + m] = withItem;
      }
    }
    layers.push(currentLayer);
    previousLayer = currentLayer;
  }

  // Walk backwards: if the value changed when item i arrived, i was taken.
  const chosen: number[] = [];
  let c = actionLimit;
  let m = minuteLimit;
  for (let i = n - 1; i >= 0 && c > 0; i--) {
    const scoreWithItem = layers[i][c * width + m];
    const scoreWithoutItem = i === 0 ? 0 : layers[i - 1][c * width + m];
    if (scoreWithItem !== scoreWithoutItem) {
      chosen.push(i);
      c -= 1;
      m -= costs[i];
    }
  }
  chosen.reverse();
  return chosen.map((i) => candidates[i]);
}

/**
 * Select starting points across tasks before adding follow-on work. Otherwise,
 * a few tasks with short steps can produce a 30-minute plan for a 150-minute
 * budget. Add each selected task's next step in score order while budget and
 * maxChained slots remain. Apply the same block limit, and never chain after
 * a chunk or starter because it leaves the underlying step unfinished.
 */
export function fillWithNextSteps(
  selected: Candidate[],
  tasks: Task[],
  subtasks: Subtask[],
  capacity: CapacityLevel,
  params: CapacityParams,
  budgetMinutes: number,
  todayISO: string,
  heavy?: WorkType[]
): Candidate[] {
  const subtasksByTask = groupSubtasks(subtasks);
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const usedStepIds = new Set(selected.flatMap((c) => (c.subtaskId ? [c.subtaskId] : [])));
  const planCandidates = [...selected];
  let minutes = planCandidates.reduce((sum, c) => sum + c.minutes, 0);

  while (planCandidates.length < params.maxActions + params.maxChained) {
    let best: Candidate | null = null;
    for (const [taskId, taskSteps] of subtasksByTask) {
      const task = taskById.get(taskId);
      if (!task || task.status === "done" || task.archived) continue;
      const chain = planCandidates.filter(
        (c) => c.taskId === taskId && !c.virtual && c.kind !== "communication" && c.order !== undefined
      );
      if (chain.length === 0) continue;
      const lastOrder = Math.max(...chain.map((c) => c.order as number));
      const nextStep = taskSteps.find(
        (s) =>
          s.order > lastOrder &&
          s.status !== "done" &&
          s.type !== "communication" &&
          !usedStepIds.has(s.id)
      );
      if (!nextStep) continue;
      if (nextStep.estimatedMinutes > params.maxBlock) continue;
      if (minutes + nextStep.estimatedMinutes > budgetMinutes) continue;
      const base = { ...fromSubtask(task, nextStep), chained: true };
      const scored = scoreCandidate(base, capacity, todayISO);
      const { total, workType } = heavyAdjust(base, scored.total, heavy);
      if (total <= 0) continue;
      if (!best || total > best.score) {
        best = { ...base, score: total, factors: scored.factors, workType };
      }
    }
    if (!best) break;
    planCandidates.push(best);
    usedStepIds.add(best.subtaskId as string);
    minutes += best.minutes;
  }
  return planCandidates;
}

export interface PlanInput {
  tasks: Task[];
  subtasks: Subtask[];
  capacity: CapacityLevel;
  /**
   * Continuous capacity 0 to 100. When present it drives the budget, the block
   * size, and the action cap; `capacity` is then only used for "unsure".
   */
  dial?: number;
  /** Parts of the day the student has. Steps are placed into these in order. */
  windows?: DayWindow[];
  /** Kinds of work that feel heavy today. Lowers their score, never bans them. */
  heavy?: WorkType[];
  multiplier?: number;
  availableMinutes?: number;
  /** "Make this plan smaller": one capacity level down (low gets tinier still). */
  shrink?: boolean;
  /** Injectable for tests. */
  today?: string;
}

export interface BuiltPlan {
  actions: PlanAction[];
  budgetMinutes: number;
  multiplier: number;
  capacity: CapacityLevel;
  dial?: number;
  windows?: DayWindow[];
  source: "local" | "ai";
  reasoning?: string;
}

/**
 * Place steps into the day's windows, in plan order, sharing minutes out
 * proportionally. Communication steps go first wherever the first window is.
 * With one window (or none given) everything lands in it.
 */
export function placeInWindows(
  actions: PlanAction[],
  windows: DayWindow[] | undefined
): PlanAction[] {
  const order: DayWindow[] = ["morning", "afternoon", "evening"];
  const availableWindows = (windows && windows.length > 0 ? [...windows] : order).sort(
    (a, b) => order.indexOf(a) - order.indexOf(b)
  );
  if (availableWindows.length === 1) return actions.map((a) => ({ ...a, window: availableWindows[0] }));
  const total = actions.reduce((s, a) => s + a.estimatedMinutes, 0) || 1;
  const perWindow = total / availableWindows.length;
  let elapsedMinutes = 0;
  return actions.map((a) => {
    const windowIndex = Math.min(availableWindows.length - 1, Math.floor(elapsedMinutes / perWindow));
    elapsedMinutes += a.estimatedMinutes;
    return { ...a, window: availableWindows[windowIndex] };
  });
}

export function generatePlan(input: PlanInput): BuiltPlan {
  const today = input.today ?? computeTodayISO();
  const multiplier = input.multiplier ?? 1;

  // Resolve the effective capacity label and the parameter set.
  let effectiveCapacity: CapacityLevel;
  let params: CapacityParams;
  let dial: number | undefined;
  const minimalLowPlan = input.shrink && input.capacity === "low" && input.dial === undefined;

  if (input.dial !== undefined) {
    dial = clampDial(input.shrink ? input.dial - 25 : input.dial);
    params = paramsForDial(dial);
    effectiveCapacity = input.capacity === "unsure" && !input.shrink ? "unsure" : capacityForDial(dial);
    if (effectiveCapacity === "unsure") {
      // "Not sure" uses a moderate time budget with short step limits.
      params = { ...params, maxBlock: Math.min(params.maxBlock, 20), maxChained: 0, maxActions: 3 };
    }
  } else {
    effectiveCapacity = input.shrink ? SHRINK_MAP[input.capacity] : input.capacity;
    params = minimalLowPlan
      ? { budgetMinutes: 15, maxActions: 2, maxBlock: 10, maxChained: 0 }
      : CAPACITY_PARAMS[effectiveCapacity];
  }

  const budget = computeBudget(
    effectiveCapacity,
    multiplier,
    input.availableMinutes,
    minimalLowPlan || dial !== undefined ? params.budgetMinutes : undefined
  );

  const candidates = buildCandidates(input.tasks, input.subtasks, effectiveCapacity, today, {
    params,
    heavy: input.heavy
  });
  let selected = selectCandidates(candidates, budget, params.maxActions);

  // If selection is empty but candidates exist, try the smallest step or a starter.
  if (selected.length === 0 && candidates.length > 0) {
    const smallest = [...candidates].sort((a, b) => a.minutes - b.minutes)[0];
    if (smallest.minutes <= budget) {
      selected = [smallest];
    } else {
      const task = input.tasks.find((t) => t.id === smallest.taskId);
      if (task) {
        const starter = starterStep(task);
        const { total, factors } = scoreCandidate(starter, effectiveCapacity, today);
        selected = [{ ...starter, score: total, factors }];
      }
    }
  }

  selected = fillWithNextSteps(
    selected,
    input.tasks,
    input.subtasks,
    effectiveCapacity,
    params,
    budget,
    today,
    input.heavy
  );

  // Ordering: communication first, then urgency, then score. Steps of the same
  // task stay together, in sequence, where that task first appears.
  const messages = selected.filter((c) => c.kind === "communication");
  const workCandidates = selected.filter((c) => c.kind !== "communication");
  messages.sort((a, b) => b.score - a.score);
  workCandidates.sort((a, b) => {
    if (b.factors.urgency !== a.factors.urgency) return b.factors.urgency - a.factors.urgency;
    return b.score - a.score;
  });
  const orderedWork: Candidate[] = [];
  const seenTaskIds = new Set<string>();
  for (const c of workCandidates) {
    if (seenTaskIds.has(c.taskId)) continue;
    seenTaskIds.add(c.taskId);
    orderedWork.push(
      ...workCandidates
        .filter((r) => r.taskId === c.taskId)
        .sort((a, b) => (a.order ?? -1) - (b.order ?? -1))
    );
  }

  const unplacedActions: PlanAction[] = [...messages, ...orderedWork].map((c) => ({
    id: uid(),
    taskId: c.taskId,
    subtaskId: c.subtaskId,
    title: c.title,
    estimatedMinutes: c.minutes,
    reason: reasonFor(c, c.factors, effectiveCapacity),
    why: whyText(c.factors, c.kind, c.chained),
    completed: false,
    virtual: c.virtual || undefined,
    workType: c.workType ?? guessWorkType(c.title, c.kind)
  }));
  const actions = placeInWindows(unplacedActions, input.windows);

  return {
    actions,
    budgetMinutes: budget,
    multiplier,
    capacity: input.capacity,
    dial,
    windows: input.windows,
    source: "local"
  };
}

export function totalPlanMinutes(actions: PlanAction[]): number {
  return actions.reduce((sum, a) => sum + a.estimatedMinutes, 0);
}
