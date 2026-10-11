// Validate backups without database access so validation can be tested
// separately. Skip malformed records; reject invalid file structure with
// a readable error.
import type {
  CheckIn,
  FixedEvent,
  FocusSession,
  Plan,
  Reflection,
  Settings,
  Subtask,
  Task
} from "./types";

export interface ImportPayload {
  tasks: Task[];
  subtasks: Subtask[];
  checkIns: CheckIn[];
  plans: Plan[];
  reflections: Reflection[];
  /** Empty when importing a backup that predates these tables. */
  sessions: FocusSession[];
  events: FixedEvent[];
  settings?: Settings;
}

const NOT_PACE = "That file doesn't look like a Pace export.";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function pickValid<T>(v: unknown, check: (r: Record<string, unknown>) => boolean): T[] {
  if (!Array.isArray(v)) return [];
  return v.filter((r): r is T => isRecord(r) && typeof r.id === "string" && check(r));
}

export function sanitizeImport(data: unknown): ImportPayload {
  if (!isRecord(data)) throw new Error(NOT_PACE);
  const looksLikePace =
    data.app === "Pace" || Array.isArray(data.tasks) || Array.isArray(data.plans);
  if (!looksLikePace) throw new Error(NOT_PACE);

  const tasks = pickValid<Task>(
    data.tasks,
    (r) => typeof r.title === "string" && typeof r.estimatedMinutes === "number"
  );
  const subtasks = pickValid<Subtask>(
    data.subtasks,
    (r) => typeof r.taskId === "string" && typeof r.title === "string"
  );
  const checkIns = pickValid<CheckIn>(data.checkIns, (r) => typeof r.date === "string");
  const plans = pickValid<Plan>(
    data.plans,
    (r) => typeof r.date === "string" && Array.isArray(r.actions)
  );
  const reflections = pickValid<Reflection>(data.reflections, (r) => typeof r.date === "string");
  const sessions = pickValid<FocusSession>(
    data.sessions,
    (r) => typeof r.date === "string" && typeof r.taskId === "string"
  );
  const events = pickValid<FixedEvent>(
    data.events,
    (r) => typeof r.date === "string" && typeof r.title === "string"
  );

  let settings: Settings | undefined;
  const rawSettings = Array.isArray(data.settings) ? data.settings[0] : data.settings;
  if (isRecord(rawSettings) && rawSettings.id === "app") {
    // Keep the importing user onboarded even if the backup has a stale flag.
    settings = { ...(rawSettings as unknown as Settings), onboarded: true };
  }

  const payload: ImportPayload = {
    tasks,
    subtasks,
    checkIns,
    plans,
    reflections,
    sessions,
    events,
    settings
  };
  if (importedCount(payload) === 0 && !settings) {
    throw new Error("That file doesn't contain any Pace data.");
  }
  return payload;
}

export function importedCount(p: ImportPayload): number {
  return (
    p.tasks.length +
    p.subtasks.length +
    p.checkIns.length +
    p.plans.length +
    p.reflections.length +
    p.sessions.length +
    p.events.length
  );
}
