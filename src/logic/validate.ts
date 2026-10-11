// Validate model proposals locally before they reach the screen. Accept
// only supplied IDs and enforce planner limits. Return repair counts for
// evals without showing repair details to students.

import type { DayWindow, PlanAction, Subtask, Task, WorkType } from "../data/types";
import { uid } from "../lib/id";
import type { PlanResponse } from "../shared/schema";
import { guessWorkType } from "./capacity";
import { placeInWindows, selectCandidates, type Candidate, type CapacityParams } from "./scheduler";
import { reasonFor, scoreCandidate } from "./scoring";

export interface ValidateInput {
  proposal: PlanResponse;
  tasks: Task[];
  subtasks: Subtask[];
  budgetMinutes: number;
  params: CapacityParams;
  capacity: "low" | "medium" | "high" | "unsure";
  windows?: DayWindow[];
  today: string;
  /** Steps already completed today (subtask ids and action titles), kept out of the proposal. */
  doneSubtaskIds?: Set<string>;
}

export interface ValidateResult {
  actions: PlanAction[];
  reasoning: string;
  /** Machine-readable repair notes for evals and logs. Never rendered. */
  repairs: string[];
  rejectedCount: number;
}

const MIN_STEP = 5;

function roundTo5(m: number): number {
  return Math.max(MIN_STEP, Math.round(m / 5) * 5);
}

export function validateProposal(input: ValidateInput): ValidateResult {
  const { proposal, tasks, subtasks, budgetMinutes, params, capacity, today } = input;
  const repairs: string[] = [];
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const subtaskById = new Map(subtasks.map((s) => [s.id, s]));
  const subtasksByTask = new Map<string, Subtask[]>();
  for (const s of subtasks) {
    const list = subtasksByTask.get(s.taskId) ?? [];
    list.push(s);
    subtasksByTask.set(s.taskId, list);
  }
  for (const list of subtasksByTask.values()) list.sort((a, b) => a.order - b.order);
  const completedStepIds = input.doneSubtaskIds ?? new Set<string>();

  // 1. Drop unknown IDs, finished work, and archived tasks.
  type Accepted = {
    taskId: string;
    subtaskId?: string;
    title: string;
    minutes: number;
    window: DayWindow;
    why: string;
    firstAction: string;
    workType: WorkType;
    kind: Candidate["kind"];
    order?: number;
    difficulty: Task["difficulty"];
    importance: Task["importance"];
    dueDate?: string;
    virtual: boolean;
  };
  const accepted: Accepted[] = [];
  const seenStepIds = new Set<string>();
  let rejectedCount = 0;

  for (const a of proposal.actions) {
    const task = taskById.get(a.taskId);
    if (!task || task.archived || task.status === "done") {
      repairs.push(`drop: unknown or finished task ${a.taskId}`);
      rejectedCount++;
      continue;
    }
    let subtask: Subtask | undefined;
    if (a.subtaskId) {
      subtask = subtaskById.get(a.subtaskId);
      if (!subtask || subtask.taskId !== task.id) {
        repairs.push(`drop: unknown step ${a.subtaskId} on ${task.title}`);
        rejectedCount++;
        continue;
      }
      if (subtask.status === "done" || completedStepIds.has(subtask.id)) {
        repairs.push(`drop: step already done ${subtask.title}`);
        rejectedCount++;
        continue;
      }
      if (seenStepIds.has(subtask.id)) {
        repairs.push(`drop: duplicate step ${subtask.title}`);
        rejectedCount++;
        continue;
      }
      seenStepIds.add(subtask.id);
    }
    const title = (a.title || subtask?.title || task.title).trim().slice(0, 140);
    const minutes = Math.min(params.maxBlock, roundTo5(a.minutes || subtask?.estimatedMinutes || 15));
    if (minutes !== a.minutes) repairs.push(`clamp: ${title} ${a.minutes} → ${minutes} min`);
    const kind: Candidate["kind"] = subtask ? subtask.type : task.estimatedMinutes <= params.maxBlock ? "task" : "focus";
    accepted.push({
      taskId: task.id,
      subtaskId: subtask?.id,
      title,
      minutes,
      window: a.window,
      why: a.why.trim().slice(0, 160),
      firstAction: a.firstAction.trim().slice(0, 160),
      workType: a.workType ?? guessWorkType(title, kind),
      kind,
      order: subtask?.order,
      difficulty: subtask?.difficulty ?? task.difficulty,
      importance: task.importance,
      dueDate: task.dueDate,
      virtual: !subtask && kind !== "task",
    });
  }

  // 2. Sequence: a real step may only appear if every earlier incomplete work
  //    step of its task is done, or appears earlier in this plan.
  const placedSubs = new Set<string>();
  const inOrder: Accepted[] = [];
  for (const a of accepted) {
    if (a.subtaskId) {
      const siblings = subtasksByTask.get(a.taskId) ?? [];
      const currentStep = subtaskById.get(a.subtaskId)!;
      const blockers = siblings.filter(
        (s) =>
          s.order < currentStep.order &&
          s.status !== "done" &&
          !completedStepIds.has(s.id) &&
          s.type !== "communication" &&
          !placedSubs.has(s.id)
      );
      if (currentStep.type !== "communication" && blockers.length > 0) {
        repairs.push(`drop: ${a.title} skips ${blockers[0].title}`);
        rejectedCount++;
        continue;
      }
      placedSubs.add(a.subtaskId);
    }
    inOrder.push(a);
  }

  // 3. Message cap.
  const messageLimit = capacity === "high" ? 2 : 1;
  let messageCount = 0;
  const capped = inOrder.filter((a) => {
    if (a.kind !== "communication") return true;
    messageCount++;
    if (messageCount > messageLimit) {
      repairs.push(`drop: extra message ${a.title}`);
      rejectedCount++;
      return false;
    }
    return true;
  });

  // 4. Trim proposals that exceed the budget or action cap with the exact
  // solver. Select the best feasible subset, using model order as a tie-breaker.
  const proposedMinutes = capped.reduce((s, a) => s + a.minutes, 0);
  let kept = capped;
  if (proposedMinutes > budgetMinutes || capped.length > params.maxActions + params.maxChained) {
    const candidates: Candidate[] = capped.map((a, i) => {
      const { total: baseScore, factors } = scoreCandidate(
        { minutes: a.minutes, difficulty: a.difficulty, importance: a.importance, kind: a.kind, dueDate: a.dueDate },
        capacity,
        today
      );
      // Earlier in the model's list means the model cared more.
      const orderBonus = (capped.length - i) * 0.5;
      return {
        taskId: a.taskId,
        subtaskId: a.subtaskId,
        title: a.title,
        minutes: a.minutes,
        difficulty: a.difficulty,
        importance: a.importance,
        kind: a.kind,
        dueDate: a.dueDate,
        virtual: a.virtual,
        order: a.order,
        workType: a.workType,
        score: baseScore + orderBonus,
        factors
      };
    });
    const selected = selectCandidates(candidates, budgetMinutes, params.maxActions + params.maxChained);
    const keepIds = new Set(selected.map((c) => `${c.taskId}:${c.subtaskId ?? c.title}`));
    kept = capped.filter((a) => keepIds.has(`${a.taskId}:${a.subtaskId ?? a.title}`));
    repairs.push(`trim: ${proposedMinutes} → ${kept.reduce((s, a) => s + a.minutes, 0)} min for a ${budgetMinutes} min budget`);
    // Trimming can reopen a sequence gap; re-run the order check once.
    const placed = new Set<string>();
    kept = kept.filter((a) => {
      if (!a.subtaskId) return true;
      const currentStep = subtaskById.get(a.subtaskId)!;
      const siblings = subtasksByTask.get(a.taskId) ?? [];
      const blocked = siblings.some(
        (s) => s.order < currentStep.order && s.status !== "done" && !completedStepIds.has(s.id) && s.type !== "communication" && !placed.has(s.id)
      );
      if (currentStep.type !== "communication" && blocked) {
        repairs.push(`drop after trim: ${a.title}`);
        return false;
      }
      placed.add(a.subtaskId);
      return true;
    });
  }

  // 5. Windows: only the ones the student has.
  const allowedWindows = input.windows && input.windows.length > 0 ? input.windows : undefined;
  let actions: PlanAction[] = kept.map((a) => {
    const { factors } = scoreCandidate(
      { minutes: a.minutes, difficulty: a.difficulty, importance: a.importance, kind: a.kind, dueDate: a.dueDate },
      capacity,
      today
    );
    return {
      id: uid(),
      taskId: a.taskId,
      subtaskId: a.subtaskId,
      title: a.title,
      estimatedMinutes: a.minutes,
      reason: reasonFor({ minutes: a.minutes, difficulty: a.difficulty, importance: a.importance, kind: a.kind, dueDate: a.dueDate }, factors, capacity),
      why: a.why || undefined,
      completed: false,
      virtual: a.virtual || undefined,
      window: allowedWindows && !allowedWindows.includes(a.window) ? undefined : a.window,
      firstAction: a.firstAction || undefined,
      workType: a.workType
    };
  });
  if (actions.some((a) => !a.window)) {
    repairs.push("rewindow: model used a window the student doesn't have");
    actions = placeInWindows(actions, allowedWindows);
  }

  const reasoning = proposal.reasoning.trim().slice(0, 600);
  return { actions, reasoning, repairs, rejectedCount };
}
