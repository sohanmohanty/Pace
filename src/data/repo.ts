import { db, DEFAULT_SETTINGS } from "./db";
import { importedCount, sanitizeImport } from "./importValidate";
import type {
  CapacityLevel,
  CheckIn,
  Level,
  Plan,
  PlanAction,
  Reflection,
  Settings,
  Subtask,
  Task
} from "./types";
import { todayISO } from "../lib/dates";
import { uid } from "../lib/id";
import type { BuiltPlan } from "../logic/scheduler";

const now = () => new Date().toISOString();

// ---- Settings ---------------------------------------------------------------

export async function getSettings(): Promise<Settings> {
  return (await db.settings.get("app")) ?? DEFAULT_SETTINGS;
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  // Read-modify-write inside one transaction — concurrent toggles can't clobber
  // each other.
  await db.transaction("rw", db.settings, async () => {
    const current = (await db.settings.get("app")) ?? DEFAULT_SETTINGS;
    await db.settings.put({ ...current, ...patch, id: "app" });
  });
}

// ---- Tasks ------------------------------------------------------------------

export interface TaskDraft {
  title: string;
  course?: string;
  dueDate?: string;
  estimatedMinutes: number;
  difficulty: Level;
  importance: Level;
  needsCommunication: boolean;
  notes?: string;
  demo?: 1;
}

export async function addTask(draft: TaskDraft): Promise<string> {
  const id = uid();
  await db.tasks.add({
    id,
    ...draft,
    status: "not_started",
    createdAt: now(),
    updatedAt: now()
  });
  return id;
}

export async function updateTask(id: string, patch: Partial<Task>): Promise<void> {
  await db.tasks.update(id, { ...patch, updatedAt: now() });
}

export async function deleteTask(id: string): Promise<void> {
  await db.transaction("rw", db.tasks, db.subtasks, async () => {
    await db.subtasks.where("taskId").equals(id).delete();
    await db.tasks.delete(id);
  });
}

export async function setTaskStatus(id: string, status: Task["status"]): Promise<void> {
  await updateTask(id, { status });
}

export async function listActiveTasks(): Promise<Task[]> {
  const all = await db.tasks.toArray();
  return all.filter((t) => !t.archived);
}

export async function archiveDoneTasks(): Promise<number> {
  const done = await db.tasks.where("status").equals("done").toArray();
  const active = done.filter((t) => !t.archived);
  await Promise.all(active.map((t) => db.tasks.update(t.id, { archived: true, updatedAt: now() })));
  return active.length;
}

// ---- Subtasks ---------------------------------------------------------------

export async function addSubtasks(subtasks: Subtask[]): Promise<void> {
  await db.subtasks.bulkAdd(subtasks);
}

export async function addSubtask(taskId: string, title: string, demo?: 1): Promise<void> {
  const existing = await db.subtasks.where("taskId").equals(taskId).toArray();
  const maxOrder = existing.reduce((m, s) => Math.max(m, s.order), -1);
  await db.subtasks.add({
    id: uid(),
    taskId,
    title,
    estimatedMinutes: 15,
    difficulty: 2,
    type: "focus",
    status: "not_started",
    order: maxOrder + 1,
    demo
  });
}

export async function updateSubtask(id: string, patch: Partial<Subtask>): Promise<void> {
  await db.subtasks.update(id, patch);
}

export async function deleteSubtask(id: string): Promise<void> {
  await db.subtasks.delete(id);
}

export async function moveSubtask(id: string, direction: -1 | 1): Promise<void> {
  const sub = await db.subtasks.get(id);
  if (!sub) return;
  const siblings = (await db.subtasks.where("taskId").equals(sub.taskId).toArray()).sort(
    (a, b) => a.order - b.order
  );
  const idx = siblings.findIndex((s) => s.id === id);
  const swapWith = siblings[idx + direction];
  if (!swapWith) return;
  await db.transaction("rw", db.subtasks, async () => {
    await db.subtasks.update(sub.id, { order: swapWith.order });
    await db.subtasks.update(swapWith.id, { order: sub.order });
  });
}

/** Toggle a subtask; auto-complete the task when every subtask is done. */
export async function toggleSubtaskDone(id: string): Promise<void> {
  await db.transaction("rw", db.subtasks, db.tasks, async () => {
    const sub = await db.subtasks.get(id);
    if (!sub) return;
    const nowDone = sub.status !== "done";
    await db.subtasks.update(id, { status: nowDone ? "done" : "not_started" });
    const siblings = await db.subtasks.where("taskId").equals(sub.taskId).toArray();
    const allDone = siblings.every((s) => (s.id === id ? nowDone : s.status === "done"));
    const task = await db.tasks.get(sub.taskId);
    if (!task) return;
    if (allDone) {
      await db.tasks.update(task.id, { status: "done", updatedAt: now() });
    } else if (task.status === "done" || task.status === "not_started") {
      await db.tasks.update(task.id, { status: "in_progress", updatedAt: now() });
    }
  });
}

// ---- Check-ins ----------------------------------------------------------------

export async function getTodayCheckIn(): Promise<CheckIn | undefined> {
  const list = await db.checkIns.where("date").equals(todayISO()).toArray();
  return list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
}

export async function saveCheckIn(
  capacity: CapacityLevel,
  availableMinutes?: number
): Promise<void> {
  const date = todayISO();
  await db.transaction("rw", db.checkIns, async () => {
    await db.checkIns.where("date").equals(date).delete();
    await db.checkIns.add({ id: uid(), date, capacity, availableMinutes, createdAt: now() });
  });
}

// ---- Plans --------------------------------------------------------------------

export async function getTodayPlan(): Promise<Plan | undefined> {
  const list = await db.plans.where("date").equals(todayISO()).toArray();
  return list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
}

/**
 * Save today's plan, replacing any existing one. Regenerating never erases
 * progress: repeated steps keep their completion, and steps completed earlier
 * today that aren't in the new plan are carried over as finished items.
 */
export async function savePlanForToday(built: BuiltPlan): Promise<Plan> {
  const date = todayISO();
  const key = (a: PlanAction) => a.subtaskId ?? `${a.taskId}:${a.title}`;

  return db.transaction("rw", db.plans, async () => {
    const existing = (await db.plans.where("date").equals(date).toArray()).sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : -1
    );
    const completedKeys = new Set(
      existing.flatMap((p) => p.actions.filter((a) => a.completed).map(key))
    );
    const newKeys = new Set(built.actions.map(key));
    const carried = existing[0]
      ? existing[0].actions.filter((a) => a.completed && !newKeys.has(key(a)))
      : [];
    const actions = [
      ...carried,
      ...built.actions.map((a) => (completedKeys.has(key(a)) ? { ...a, completed: true } : a))
    ];
    await db.plans.where("date").equals(date).delete();
    const plan: Plan = {
      id: uid(),
      date,
      capacity: built.capacity,
      budgetMinutes: built.budgetMinutes,
      multiplier: built.multiplier,
      actions,
      createdAt: now()
    };
    await db.plans.add(plan);
    return plan;
  });
}

/**
 * Apply a completion state to a plan action and sync the underlying work:
 * - real subtask → subtask done/undone (task auto-completes when all done);
 * - whole-task action → task done/undone;
 * - virtual starter/chunk → task marked in-progress (progress still counts);
 * - virtual communication → the task's "needs communication" flag turns off.
 * Must run inside a rw transaction over plans, subtasks, and tasks.
 */
async function applyPlanActionCompletion(
  plan: Plan,
  action: PlanAction,
  nowCompleted: boolean
): Promise<void> {
  const actions = plan.actions.map((a) =>
    a.id === action.id ? { ...a, completed: nowCompleted } : a
  );
  await db.plans.update(plan.id, { actions });

  const task = await db.tasks.get(action.taskId);
  if (!task) return; // task was deleted (e.g. sample data cleared) — plan still renders

  if (action.virtual) {
    if (action.reason === "communication" && !action.subtaskId) {
      // Sending the update is the communication — the flag turns off.
      await db.tasks.update(task.id, { needsCommunication: !nowCompleted, updatedAt: now() });
    }
    if (nowCompleted && task.status === "not_started") {
      await db.tasks.update(task.id, { status: "in_progress", updatedAt: now() });
    }
    return;
  }

  if (action.subtaskId) {
    const sub = await db.subtasks.get(action.subtaskId);
    if (!sub) return;
    if ((sub.status === "done") !== nowCompleted) {
      await db.subtasks.update(sub.id, { status: nowCompleted ? "done" : "not_started" });
      const siblings = await db.subtasks.where("taskId").equals(sub.taskId).toArray();
      const allDone = siblings.every((s) => s.status === "done");
      if (allDone) {
        await db.tasks.update(task.id, { status: "done", updatedAt: now() });
      } else if (task.status !== "in_progress") {
        await db.tasks.update(task.id, { status: "in_progress", updatedAt: now() });
      }
    }
    return;
  }

  // Whole-task action.
  await db.tasks.update(task.id, {
    status: nowCompleted ? "done" : "in_progress",
    updatedAt: now()
  });
}

export async function togglePlanAction(planId: string, actionId: string): Promise<void> {
  await db.transaction("rw", db.plans, db.subtasks, db.tasks, async () => {
    const plan = await db.plans.get(planId);
    if (!plan) return;
    const action = plan.actions.find((a) => a.id === actionId);
    if (!action) return;
    await applyPlanActionCompletion(plan, action, !action.completed);
  });
}

/**
 * Idempotent "mark done" — a double-tap on a Done button must never
 * un-complete the step the way a second toggle would.
 */
export async function completePlanAction(planId: string, actionId: string): Promise<void> {
  await db.transaction("rw", db.plans, db.subtasks, db.tasks, async () => {
    const plan = await db.plans.get(planId);
    if (!plan) return;
    const action = plan.actions.find((a) => a.id === actionId);
    if (!action || action.completed) return;
    await applyPlanActionCompletion(plan, action, true);
  });
}

export async function listPlansSince(fromISO: string): Promise<Plan[]> {
  return db.plans.where("date").aboveOrEqual(fromISO).toArray();
}

// ---- Reflections ---------------------------------------------------------------

export async function addReflection(
  input: Omit<Reflection, "id" | "createdAt">
): Promise<void> {
  await db.reflections.add({ ...input, id: uid(), createdAt: now() });
}

export async function listReflections(): Promise<Reflection[]> {
  return db.reflections.toArray();
}

// ---- Privacy: export / delete ----------------------------------------------------

export async function exportAll(): Promise<Record<string, unknown>> {
  const [tasks, subtasks, checkIns, plans, reflections, settings] = await Promise.all([
    db.tasks.toArray(),
    db.subtasks.toArray(),
    db.checkIns.toArray(),
    db.plans.toArray(),
    db.reflections.toArray(),
    db.settings.toArray()
  ]);
  return {
    app: "Pace",
    version: 1,
    exportedAt: new Date().toISOString(),
    note: "Your data. Pace stores everything locally on your device.",
    tasks,
    subtasks,
    checkIns,
    plans,
    reflections,
    settings
  };
}

/**
 * Merge a Pace export file into this device. Nothing is deleted: unrelated
 * records are untouched, records with the same id are updated to the file's
 * version, and new records are added. Validation happens before any write,
 * and all writes share one transaction — a bad file can't half-import.
 */
export async function importData(raw: unknown): Promise<number> {
  const payload = sanitizeImport(raw);
  await db.transaction(
    "rw",
    [db.tasks, db.subtasks, db.checkIns, db.plans, db.reflections, db.settings],
    async () => {
      await db.tasks.bulkPut(payload.tasks);
      await db.subtasks.bulkPut(payload.subtasks);
      await db.checkIns.bulkPut(payload.checkIns);
      await db.plans.bulkPut(payload.plans);
      await db.reflections.bulkPut(payload.reflections);
      if (payload.settings) await db.settings.put(payload.settings);
    }
  );
  return importedCount(payload);
}

/** Full wipe. The database is deleted and the app returns to onboarding. */
export async function deleteAllData(): Promise<void> {
  await db.delete();
}
