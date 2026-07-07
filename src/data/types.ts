export type CapacityLevel = "low" | "medium" | "high" | "unsure";

export type TaskStatus = "not_started" | "in_progress" | "blocked" | "done";

export type Level = 1 | 2 | 3 | 4 | 5;

export type SubtaskType = "starter" | "focus" | "review" | "communication" | "submit";

export interface Task {
  id: string;
  title: string;
  course?: string;
  /** ISO date (YYYY-MM-DD), always parsed as LOCAL time via lib/dates. */
  dueDate?: string;
  estimatedMinutes: number;
  difficulty: Level;
  importance: Level;
  status: TaskStatus;
  needsCommunication: boolean;
  notes?: string;
  /** Hidden from the task list, kept for stats. */
  archived?: boolean;
  /** Sample-data flag (1/absent — booleans aren't indexable in IndexedDB). */
  demo?: 1;
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
  /** Position in the sequence — the scheduler respects this. */
  order: number;
  demo?: 1;
}

export interface CheckIn {
  id: string;
  /** One per day; re-checking replaces it. */
  date: string;
  capacity: CapacityLevel;
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
  /** Synthesized chunk/starter — completing it does not complete the subtask. */
  virtual?: boolean;
}

export interface Plan {
  id: string;
  /** One plan per day; regenerating replaces it, preserving repeated steps. */
  date: string;
  capacity: CapacityLevel;
  /** Minute budget after the adaptation multiplier. */
  budgetMinutes: number;
  /** Reflection-driven multiplier, shown transparently in the UI. */
  multiplier: number;
  actions: PlanAction[];
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

export interface Settings {
  id: "app";
  onboarded: boolean;
  /** Optional, only used to sign generated messages. */
  studentName?: string;
  largeText: boolean;
  highContrast: boolean;
  /** Manual override; system preference is respected by default. */
  reduceMotion: boolean;
}
