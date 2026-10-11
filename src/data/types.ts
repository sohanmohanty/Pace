export type CapacityLevel = "low" | "medium" | "high" | "unsure";

export type TaskStatus = "not_started" | "in_progress" | "blocked" | "done";

export type Level = 1 | 2 | 3 | 4 | 5;

export type SubtaskType = "starter" | "focus" | "review" | "communication" | "submit";

/** What kind of effort a step mostly asks for. Used by "what feels heavy today". */
export type WorkType = "reading" | "writing" | "problems" | "people" | "making";

/** Coarse parts of the day a plan can place steps into. */
export type DayWindow = "morning" | "afternoon" | "evening";

export const DAY_WINDOWS: DayWindow[] = ["morning", "afternoon", "evening"];
export const WORK_TYPES: WorkType[] = ["reading", "writing", "problems", "people", "making"];

export interface Task {
  id: string;
  title: string;
  course?: string;
  /** ISO date (YYYY-MM-DD), parsed in local time through lib/dates. */
  dueDate?: string;
  estimatedMinutes: number;
  difficulty: Level;
  importance: Level;
  status: TaskStatus;
  needsCommunication: boolean;
  notes?: string;
  /** Hidden from the task list, kept for stats. */
  archived?: boolean;
  /** Sample-data flag (1/absent; booleans cannot be indexed in IndexedDB). */
  demo?: 1;
  /** Where the task came from. Absent means typed by the student. */
  source?: "user" | "quickadd" | "ai" | "feed";
  /** Stable id from a calendar feed, so re-syncs update instead of duplicate. */
  externalId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Subtask {
  id: string;
  taskId: string;
  title: string;
  estimatedMinutes: number;
  difficulty: Level;
  type: SubtaskType;
  status: TaskStatus;
  /** Position in the sequence; the scheduler respects this. */
  order: number;
  /** Concrete action for the first minute. */
  firstAction?: string;
  workType?: WorkType;
  source?: "template" | "ai" | "user";
  demo?: 1;
}

export interface CheckIn {
  id: string;
  /** One per day; re-checking replaces it. */
  date: string;
  capacity: CapacityLevel;
  /** Continuous capacity, 0 to 100. `capacity` is derived from it when present. */
  dial?: number;
  /** Available parts of the day. Absent means any. */
  windows?: DayWindow[];
  /** Kinds of work that feel heavy today; the planner steers around them. */
  heavy?: WorkType[];
  availableMinutes?: number;
  demo?: 1;
  createdAt: string;
}

export type PlanReason =
  | "urgent"
  | "quick_win"
  | "communication"
  | "low_capacity"
  | "deadline"
  | "momentum";

export interface PlanAction {
  id: string;
  taskId: string;
  subtaskId?: string;
  title: string;
  estimatedMinutes: number;
  reason: PlanReason;
  /** Human-readable factor summary ("Past due · high importance"). */
  why?: string;
  completed: boolean;
  /** Synthesized chunk/starter; completing it does not complete the subtask. */
  virtual?: boolean;
  /** Which part of the day this step is placed in. */
  window?: DayWindow;
  /** First action, when known. */
  firstAction?: string;
  workType?: WorkType;
}

export interface Plan {
  id: string;
  /** One plan per day; regenerating replaces it, preserving repeated steps. */
  date: string;
  capacity: CapacityLevel;
  /** Dial value the plan was built for, when known. */
  dial?: number;
  /** Minute budget after the adaptation multiplier. */
  budgetMinutes: number;
  /** Reflection-based budget multiplier, displayed in the UI. */
  multiplier: number;
  actions: PlanAction[];
  /** Which engine built it. Absent means the local engine. */
  source?: "local" | "ai";
  /** The planner's short explanation of today's plan. */
  reasoning?: string;
  createdAt: string;
  demo?: 1;
}

export interface Reflection {
  id: string;
  date: string;
  planId?: string;
  completedActionIds: string[];
  planFelt: "too_light" | "right" | "too_heavy";
  nextPlanPreference: "lighter" | "same" | "heavier";
  note?: string;
  createdAt: string;
}

/** One stretch of focused time on a step. Feeds estimate calibration. */
export interface FocusSession {
  id: string;
  date: string;
  taskId: string;
  subtaskId?: string;
  actionId?: string;
  startedAt: string;
  endedAt?: string;
  /** Actual minutes spent, rounded. */
  minutes?: number;
  outcome?: "done" | "stopped" | "longer";
  workType?: WorkType;
  course?: string;
  estimatedMinutes?: number;
}

/** A fixed block the planner must plan around (class, practice, shift, test). */
export interface FixedEvent {
  id: string;
  date: string;
  title: string;
  /** "HH:MM" local. */
  start: string;
  end: string;
  source: "manual" | "ics" | "feed";
  externalId?: string;
}

export type ThemeMode = "system" | "light" | "dark" | "hc";

export interface Settings {
  id: "app";
  onboarded: boolean;
  /** Optional, only used to sign generated messages. */
  studentName?: string;
  largeText: boolean;
  /** Kept for older records; `theme === "hc"` is the source of truth. */
  highContrast: boolean;
  /** Manual override; system preference is respected by default. */
  reduceMotion: boolean;
  theme?: ThemeMode;
  /** The single AI switch. Default on. */
  aiEnabled?: boolean;
}

/** Learned profile stored locally, shown in Insights, and resettable. */
export interface Profile {
  id: "me";
  /** actual/estimated ratio per course, with sample counts. */
  calibration: Record<string, { ratio: number; n: number }>;
  /** actual/estimated ratio per work type. */
  calibrationByType: Partial<Record<WorkType, { ratio: number; n: number }>>;
  /** Completion rate per day window, 0 to 1, with sample counts. */
  energy: Partial<Record<DayWindow, { rate: number; n: number }>>;
  /** Anonymous, random, never tied to identity. Used only for rate limits. */
  deviceToken: string;
  /** Pasted calendar feed URLs. Fetched through the serverless layer, never stored there. */
  feeds?: { id: string; url: string; label?: string; lastSyncedAt?: string }[];
  termEnd?: string;
}
