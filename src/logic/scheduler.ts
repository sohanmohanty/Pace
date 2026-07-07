import type {
  CapacityLevel,
  Level,
  PlanAction,
  Subtask,
  SubtaskType,
  Task
} from "../data/types";
import { todayISO as computeTodayISO } from "../lib/dates";
import { uid } from "../lib/id";
import { reasonFor, scoreCandidate, whyText, type ScoreFactors } from "./scoring";

export interface CapacityParams {
  budgetMinutes: number;
  maxActions: number;
  maxBlock: number;
}

export const CAPACITY_PARAMS: Record<CapacityLevel, CapacityParams> = {
  low: { budgetMinutes: 30, maxActions: 3, maxBlock: 15 },
  medium: { budgetMinutes: 90, maxActions: 5, maxBlock: 35 },
  high: { budgetMinutes: 150, maxActions: 6, maxBlock: 60 },
  unsure: { budgetMinutes: 45, maxActions: 3, maxBlock: 20 }
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
  let b = Math.round((base * multiplier) / 5) * 5;
  b = Math.min(240, Math.max(15, b));
  if (availableMinutes && availableMinutes > 0) {
    b = Math.min(b, Math.max(10, Math.round(availableMinutes)));
  }
  return b;
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
    title: `Send a short update about ${task.title}`,
    minutes: 5,
    difficulty: 2,
    importance: task.importance,
    kind: "communication",
    dueDate: task.dueDate,
    virtual: true
  };
}

/**
 * Step 0 — eligibility. Only the earliest incomplete subtask of each task is a
 * candidate (templates encode real sequences); communication steps are exempt;
 * oversized work is chunked or turned into a starter step; at most 2
 * candidates per task; non-positive scores are dropped.
 */
export function buildCandidates(
  tasks: Task[],
  subtasks: Subtask[],
  capacity: CapacityLevel,
  todayISO: string
): Candidate[] {
  const params = CAPACITY_PARAMS[capacity];
  const byTask = new Map<string, Subtask[]>();
  for (const s of subtasks) {
    const list = byTask.get(s.taskId);
    if (list) list.push(s);
    else byTask.set(s.taskId, [s]);
  }

  const out: Candidate[] = [];
  for (const task of tasks) {
    if (task.status === "done" || task.archived) continue;
    const subs = (byTask.get(task.id) ?? []).slice().sort((a, b) => a.order - b.order);
    const open = subs.filter((s) => s.status !== "done");

    let next: Omit<Candidate, "score" | "factors"> | null = null;
    if (open.length > 0) {
      const first = open[0];
      if (first.estimatedMinutes <= params.maxBlock) {
        next = {
          taskId: task.id,
          subtaskId: first.id,
          title: first.title,
          minutes: first.estimatedMinutes,
          difficulty: first.difficulty,
          importance: task.importance,
          kind: first.type,
          dueDate: task.dueDate,
          virtual: false
        };
      } else if (capacity === "low") {
        next = starterStep(task);
      } else {
        next = {
          taskId: task.id,
          subtaskId: first.id,
          title: `Spend ${params.maxBlock} min on: ${first.title}`,
          minutes: params.maxBlock,
          difficulty: first.difficulty,
          importance: task.importance,
          kind: "focus",
          dueDate: task.dueDate,
          virtual: true
        };
      }
    } else if (subs.length === 0) {
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
    let comm: Omit<Candidate, "score" | "factors"> | null = null;
    const openComm = open.find((s) => s.type === "communication");
    if (openComm && next?.subtaskId !== openComm.id) {
      comm = {
        taskId: task.id,
        subtaskId: openComm.id,
        title: openComm.title,
        minutes: openComm.estimatedMinutes,
        difficulty: openComm.difficulty,
        importance: task.importance,
        kind: "communication",
        dueDate: task.dueDate,
        virtual: false
      };
    } else if (!openComm && task.needsCommunication && next?.kind !== "communication") {
      comm = virtualComm(task);
    }

    for (const c of [next, comm]) {
      if (!c) continue;
      const { total, factors } = scoreCandidate(c, capacity, todayISO);
      if (total <= 0) continue;
      out.push({ ...c, score: total, factors });
    }
  }

  // Deterministic order: score desc, then earlier due date, then title.
  out.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const ad = a.dueDate ?? "9999-12-31";
    const bd = b.dueDate ?? "9999-12-31";
    if (ad !== bd) return ad < bd ? -1 : 1;
    return a.title.localeCompare(b.title);
  });
  // Keep the DP small; 80 candidates is far beyond any realistic task list.
  return out.slice(0, 80);
}

/**
 * Step 5 — exact selection via bounded knapsack DP.
 * Maximize total score subject to the minute budget and the action cap.
 * dp[i][c][m] = best score using the first i candidates, ≤c actions, ≤m minutes.
 */
export function selectCandidates(
  cands: Candidate[],
  budgetMinutes: number,
  maxActions: number
): Candidate[] {
  const n = cands.length;
  if (n === 0 || budgetMinutes <= 0 || maxActions <= 0) return [];
  const B = Math.floor(budgetMinutes);
  const K = Math.min(maxActions, n);
  const width = B + 1;
  const W = cands.map((c) => Math.max(1, Math.round(c.minutes)));
  const V = cands.map((c) => Math.max(1, Math.round(c.score * 100)));

  const layers: Int32Array[] = [];
  let prev = new Int32Array((K + 1) * width);
  for (let i = 0; i < n; i++) {
    const cur = Int32Array.from(prev);
    const w = W[i];
    const v = V[i];
    for (let c = 1; c <= K; c++) {
      const prevRow = (c - 1) * width;
      const curRow = c * width;
      for (let m = w; m <= B; m++) {
        const withItem = prev[prevRow + m - w] + v;
        if (withItem > cur[curRow + m]) cur[curRow + m] = withItem;
      }
    }
    layers.push(cur);
    prev = cur;
  }

  // Walk backwards: if the value changed when item i arrived, i was taken.
  const chosen: number[] = [];
  let c = K;
  let m = B;
  for (let i = n - 1; i >= 0 && c > 0; i--) {
    const withI = layers[i][c * width + m];
    const withoutI = i === 0 ? 0 : layers[i - 1][c * width + m];
    if (withI !== withoutI) {
      chosen.push(i);
      c -= 1;
      m -= W[i];
    }
  }
  chosen.reverse();
  return chosen.map((i) => cands[i]);
}

export interface PlanInput {
  tasks: Task[];
  subtasks: Subtask[];
  capacity: CapacityLevel;
  multiplier?: number;
  availableMinutes?: number;
  /** "Make this plan smaller" — one capacity level down (low gets tinier still). */
  shrink?: boolean;
  /** Injectable for tests. */
  today?: string;
}

export interface BuiltPlan {
  actions: PlanAction[];
  budgetMinutes: number;
  multiplier: number;
  capacity: CapacityLevel;
}

export function generatePlan(input: PlanInput): BuiltPlan {
  const today = input.today ?? computeTodayISO();
  const multiplier = input.multiplier ?? 1;
  const effCapacity = input.shrink ? SHRINK_MAP[input.capacity] : input.capacity;
  const tinyLow = input.shrink && input.capacity === "low";
  const params = tinyLow
    ? { budgetMinutes: 15, maxActions: 2, maxBlock: 10 }
    : CAPACITY_PARAMS[effCapacity];

  const budget = computeBudget(
    effCapacity,
    multiplier,
    input.availableMinutes,
    tinyLow ? params.budgetMinutes : undefined
  );

  const candidates = buildCandidates(input.tasks, input.subtasks, effCapacity, today);
  let selected = selectCandidates(candidates, budget, params.maxActions);

  // Step 6 — never return nothing while tasks exist.
  if (selected.length === 0 && candidates.length > 0) {
    const smallest = [...candidates].sort((a, b) => a.minutes - b.minutes)[0];
    if (smallest.minutes <= budget) {
      selected = [smallest];
    } else {
      const task = input.tasks.find((t) => t.id === smallest.taskId);
      if (task) {
        const s = starterStep(task);
        const { total, factors } = scoreCandidate(s, effCapacity, today);
        selected = [{ ...s, score: total, factors }];
      }
    }
  }

  // Ordering: communication first, then urgency, then score.
  const comm = selected.filter((c) => c.kind === "communication");
  const rest = selected.filter((c) => c.kind !== "communication");
  comm.sort((a, b) => b.score - a.score);
  rest.sort((a, b) => {
    if (b.factors.urgency !== a.factors.urgency) return b.factors.urgency - a.factors.urgency;
    return b.score - a.score;
  });

  const actions: PlanAction[] = [...comm, ...rest].map((c) => ({
    id: uid(),
    taskId: c.taskId,
    subtaskId: c.subtaskId,
    title: c.title,
    estimatedMinutes: c.minutes,
    reason: reasonFor(c, c.factors, effCapacity),
    why: whyText(c.factors, c.kind),
    completed: false,
    virtual: c.virtual || undefined
  }));

  return { actions, budgetMinutes: budget, multiplier, capacity: input.capacity };
}

export function totalPlanMinutes(actions: PlanAction[]): number {
  return actions.reduce((sum, a) => sum + a.estimatedMinutes, 0);
}
