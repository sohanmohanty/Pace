import { db, DEFAULT_PROFILE, DEFAULT_SETTINGS } from "./db";
import { importedCount, sanitizeImport } from "./importValidate";
import type {
  CapacityLevel,
  CheckIn,
  DayWindow,
  FixedEvent,
  FocusSession,
  Level,
  Plan,
  PlanAction,
  Profile,
  Reflection,
  Settings,
  Subtask,
  Task,
  WorkType
} from "./types";
import { todayISO } from "../lib/dates";
import { uid } from "../lib/id";
import { capacityForDial, clampDial } from "../logic/capacity";
import type { BuiltPlan } from "../logic/scheduler";

const now = () => new Date().toISOString();

// Settings

export async function getSettings(): Promise<Settings> {
  const stored = await db.settings.get("app");
  if (!stored) return DEFAULT_SETTINGS;
  // Older records predate `theme` and `aiEnabled`; fill them in without writing.
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    theme: stored.theme ?? (stored.highContrast ? "hc" : "dark"),
    aiEnabled: stored.aiEnabled ?? true
  };
}

// Profile (what Pace has learned; local, visible, deletable)

export async function getProfile(): Promise<Profile> {
  const stored = await db.profile.get("me");
  if (stored) return { ...DEFAULT_PROFILE, ...stored };
  const fresh: Profile = { ...DEFAULT_PROFILE, deviceToken: uid() };
  await db.profile.put(fresh);
  return fresh;
}

export async function updateProfile(patch: Partial<Profile>): Promise<void> {
  await db.transaction("rw", db.profile, async () => {
    const current = (await db.profile.get("me")) ?? { ...DEFAULT_PROFILE, deviceToken: uid() };
    await db.profile.put({ ...current, ...patch, id: "me" });
  });
}

/** Forget everything learned, keep the device token. */
export async function resetLearning(): Promise<void> {
  await updateProfile({ calibration: {}, calibrationByType: {}, energy: {} });
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  // Read-modify-write inside one transaction, so concurrent toggles cannot overwrite
  // each other.
  await db.transaction("rw", db.settings, async () => {
    const current = (await db.settings.get("app")) ?? DEFAULT_SETTINGS;
    await db.settings.put({ ...current, ...patch, id: "app" });
  });
}

// Tasks

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

// Subtasks

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

// Check-ins

export async function getTodayCheckIn(): Promise<CheckIn | undefined> {
  const list = await db.checkIns.where("date").equals(todayISO()).toArray();
  return list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
}

export interface CheckInInput {
  dial?: number;
  capacity?: CapacityLevel;
  windows?: DayWindow[];
  heavy?: WorkType[];
  availableMinutes?: number;
}

/** Save or replace today's check-in. Accept capacity/minutes arguments or a dial-based input. */
export async function saveCheckIn(
  input: CapacityLevel | CheckInInput,
  availableMinutes?: number
): Promise<void> {
  const date = todayISO();
  const data: CheckInInput =
    typeof input === "string" ? { capacity: input, availableMinutes } : input;
  const dial = data.dial !== undefined ? clampDial(data.dial) : undefined;
  const capacity: CapacityLevel =
    data.capacity === "unsure"
      ? "unsure"
      : dial !== undefined
        ? capacityForDial(dial)
        : (data.capacity ?? "medium");
  await db.transaction("rw", db.checkIns, async () => {
    await db.checkIns.where("date").equals(date).delete();
    await db.checkIns.add({
      id: uid(),
      date,
      capacity,
      dial,
      windows: data.windows && data.windows.length > 0 ? data.windows : undefined,
      heavy: data.heavy && data.heavy.length > 0 ? data.heavy : undefined,
      availableMinutes: data.availableMinutes,
      createdAt: now()
    });
  });
}

/** Patch today's check-in in place (used by the adjust controls). */
export async function updateTodayCheckIn(patch: CheckInInput): Promise<void> {
  const current = await getTodayCheckIn();
  await saveCheckIn({
    dial: current?.dial,
    capacity: current?.capacity,
    windows: current?.windows,
    heavy: current?.heavy,
    availableMinutes: current?.availableMinutes,
    ...patch
  });
}

// Plans

export async function getTodayPlan(): Promise<Plan | undefined> {
  const list = await db.plans.where("date").equals(todayISO()).toArray();
  return list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
}

/**
 * Replace today's plan while preserving progress. Repeated steps keep their
 * completion state; completed steps omitted from the new plan are carried over.
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
    // Preserve IDs for surviving steps to avoid remounts and lost focus, allow
    // layout animation, and keep in-flight toggles pointed at the same action.
    const previousByKey = new Map(existing[0]?.actions.map((a) => [key(a), a]) ?? []);
    const actions = [
      ...carried,
      ...built.actions.map((a) => {
        const prev = previousByKey.get(key(a));
        const completed = completedKeys.has(key(a));
        return prev ? { ...a, id: prev.id, completed } : completed ? { ...a, completed: true } : a;
      })
    ];
    await db.plans.where("date").equals(date).delete();
    const plan: Plan = {
      id: uid(),
      date,
      capacity: built.capacity,
      dial: built.dial,
      budgetMinutes: built.budgetMinutes,
      multiplier: built.multiplier,
      actions,
      source: built.source,
      reasoning: built.reasoning,
      createdAt: now()
    };
    await db.plans.add(plan);
    return plan;
  });
}

/** Reorder or re-window today's plan actions without regenerating. */
export async function updatePlanActions(planId: string, actions: PlanAction[]): Promise<void> {
  await db.plans.update(planId, { actions });
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
  if (!task) return; // task was deleted (e.g. sample data cleared); plan still renders

  if (action.virtual) {
    if (action.reason === "communication" && !action.subtaskId) {
      // Sending the update is the communication; the flag turns off.
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

/** Mark done idempotently so a double-tap cannot undo completion. */
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

// Reflections

export async function addReflection(
  input: Omit<Reflection, "id" | "createdAt">
): Promise<void> {
  await db.reflections.add({ ...input, id: uid(), createdAt: now() });
}

export async function listReflections(): Promise<Reflection[]> {
  return db.reflections.toArray();
}

// Focus sessions

export async function startSession(input: {
  taskId: string;
  subtaskId?: string;
  actionId?: string;
  estimatedMinutes?: number;
  workType?: WorkType;
  course?: string;
}): Promise<string> {
  const id = uid();
  await db.sessions.add({
    id,
    date: todayISO(),
    startedAt: now(),
    ...input
  });
  return id;
}

export async function endSession(
  id: string,
  outcome: NonNullable<FocusSession["outcome"]>
): Promise<FocusSession | undefined> {
  return db.transaction("rw", db.sessions, async () => {
    const s = await db.sessions.get(id);
    if (!s || s.endedAt) return s;
    const endedAt = now();
    const minutes = Math.max(
      1,
      Math.round((new Date(endedAt).getTime() - new Date(s.startedAt).getTime()) / 60000)
    );
    const done: FocusSession = { ...s, endedAt, minutes, outcome };
    await db.sessions.put(done);
    return done;
  });
}

export async function listSessionsSince(fromISO: string): Promise<FocusSession[]> {
  return db.sessions.where("date").aboveOrEqual(fromISO).toArray();
}

/** Minutes actually spent today on each plan action id. */
export async function minutesByAction(date = todayISO()): Promise<Record<string, number>> {
  const list = await db.sessions.where("date").equals(date).toArray();
  const out: Record<string, number> = {};
  for (const s of list) {
    if (!s.actionId || !s.minutes) continue;
    out[s.actionId] = (out[s.actionId] ?? 0) + s.minutes;
  }
  return out;
}

// Fixed events

export async function addEvent(e: Omit<FixedEvent, "id">): Promise<string> {
  const id = uid();
  await db.events.add({ ...e, id });
  return id;
}

export async function deleteEvent(id: string): Promise<void> {
  await db.events.delete(id);
}

export async function listEventsBetween(fromISO: string, toISO: string): Promise<FixedEvent[]> {
  return db.events.where("date").between(fromISO, toISO, true, true).toArray();
}

// Privacy: export / delete

export async function exportAll(): Promise<Record<string, unknown>> {
  const [tasks, subtasks, checkIns, plans, reflections, settings, sessions, events, profile] =
    await Promise.all([
      db.tasks.toArray(),
      db.subtasks.toArray(),
      db.checkIns.toArray(),
      db.plans.toArray(),
      db.reflections.toArray(),
      db.settings.toArray(),
      db.sessions.toArray(),
      db.events.toArray(),
      db.profile.toArray()
    ]);
  return {
    app: "Pace",
    version: 2,
    exportedAt: new Date().toISOString(),
    note: "Your data. Pace stores everything locally on your device.",
    tasks,
    subtasks,
    checkIns,
    plans,
    reflections,
    settings,
    sessions,
    events,
    profile
  };
}

/**
 * Merge a backup: update matching IDs, add new records, and leave unrelated
 * records intact. Validate before writing and use one transaction to avoid
 * a partial import.
 */
export async function importData(raw: unknown): Promise<number> {
  const payload = sanitizeImport(raw);
  await db.transaction(
    "rw",
    [db.tasks, db.subtasks, db.checkIns, db.plans, db.reflections, db.settings, db.sessions, db.events],
    async () => {
      await db.tasks.bulkPut(payload.tasks);
      await db.subtasks.bulkPut(payload.subtasks);
      await db.checkIns.bulkPut(payload.checkIns);
      await db.plans.bulkPut(payload.plans);
      await db.reflections.bulkPut(payload.reflections);
      await db.sessions.bulkPut(payload.sessions);
      await db.events.bulkPut(payload.events);
      if (payload.settings) await db.settings.put(payload.settings);
    }
  );
  return importedCount(payload);
}

/** Full wipe. The database is deleted and the app returns to onboarding. */
export async function deleteAllData(): Promise<void> {
  await db.delete();
}
