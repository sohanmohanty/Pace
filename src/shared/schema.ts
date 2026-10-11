// Shared Zod schemas for browser requests, server validation, model outputs,
// and strict JSON output formats. Structured outputs require every field
// and disallow extra keys, so absent values use null rather than optional fields.

import { z } from "zod";

export const WORK_TYPE = z.enum(["reading", "writing", "problems", "people", "making"]);
export const DAY_WINDOW = z.enum(["morning", "afternoon", "evening"]);
export const STEP_TYPE = z.enum(["starter", "focus", "review", "communication", "submit"]);
export const CAPACITY = z.enum(["low", "medium", "high", "unsure"]);

/* Planning */

export const PlanStepIn = z.object({
  id: z.string(),
  title: z.string(),
  minutes: z.number(),
  type: STEP_TYPE,
  done: z.boolean(),
  order: z.number(),
  workType: WORK_TYPE.nullable(),
  firstAction: z.string().nullable()
});

export const PlanTaskIn = z.object({
  id: z.string(),
  title: z.string(),
  course: z.string().nullable(),
  dueDate: z.string().nullable(),
  daysUntilDue: z.number().nullable(),
  estimatedMinutes: z.number(),
  difficulty: z.number(),
  importance: z.number(),
  status: z.enum(["not_started", "in_progress", "blocked", "done"]),
  needsCommunication: z.boolean(),
  steps: z.array(PlanStepIn)
});

export const PlanRequest = z.object({
  mode: z.enum(["plan", "replan"]),
  today: z.string(),
  /** "HH:MM" local time on the device. */
  now: z.string(),
  weekday: z.string(),
  checkIn: z.object({
    dial: z.number(),
    capacity: CAPACITY,
    windows: z.array(DAY_WINDOW),
    heavy: z.array(WORK_TYPE),
    availableMinutes: z.number().nullable()
  }),
  limits: z.object({
    budgetMinutes: z.number(),
    maxActions: z.number(),
    maxBlock: z.number(),
    maxMessages: z.number()
  }),
  tasks: z.array(PlanTaskIn).max(40),
  fixedEvents: z.array(z.object({ title: z.string(), start: z.string(), end: z.string() })),
  /** Plain-language facts the app learned, already rendered as sentences. */
  learned: z.array(z.string()),
  /** For replans: what is already done today, and what the student asked for. */
  doneToday: z.array(z.string()),
  instruction: z.string().nullable()
});
export type PlanRequest = z.infer<typeof PlanRequest>;

export const PlanActionOut = z.object({
  taskId: z.string(),
  /** An existing step id, or null when the model proposes a new step for a task with none. */
  subtaskId: z.string().nullable(),
  title: z.string(),
  minutes: z.number(),
  window: DAY_WINDOW,
  /** One short clause: why this, why now. */
  why: z.string(),
  /** Concrete action for the first minute. */
  firstAction: z.string(),
  workType: WORK_TYPE
});

export const PlanResponse = z.object({
  /** Two to four sentences in second person, under 80 words, without overstating the plan. */
  reasoning: z.string(),
  actions: z.array(PlanActionOut),
  deferred: z.array(z.object({ taskId: z.string(), reason: z.string() }))
});
export type PlanResponse = z.infer<typeof PlanResponse>;
export type PlanActionOut = z.infer<typeof PlanActionOut>;

/* Breakdown */

export const BreakdownRequest = z.object({
  task: z.object({
    id: z.string(),
    title: z.string(),
    course: z.string().nullable(),
    dueDate: z.string().nullable(),
    estimatedMinutes: z.number(),
    difficulty: z.number(),
    importance: z.number(),
    needsCommunication: z.boolean(),
    /** Pasted assignment text, only when the student chose to include it. */
    details: z.string().nullable()
  }),
  today: z.string(),
  learned: z.array(z.string())
});
export type BreakdownRequest = z.infer<typeof BreakdownRequest>;

export const BreakdownStepOut = z.object({
  title: z.string(),
  minutes: z.number(),
  difficulty: z.number(),
  type: STEP_TYPE,
  workType: WORK_TYPE,
  firstAction: z.string()
});

export const BreakdownResponse = z.object({
  steps: z.array(BreakdownStepOut).min(2).max(12),
  /** Total estimate for the task, in minutes. */
  totalMinutes: z.number(),
  note: z.string()
});
export type BreakdownResponse = z.infer<typeof BreakdownResponse>;

/* Extraction (Capture) */

export const ExtractRequest = z.object({
  text: z.string().nullable(),
  /** data: URL, image/* only. */
  image: z.string().nullable(),
  today: z.string(),
  knownCourses: z.array(z.string()),
  termEnd: z.string().nullable()
});
export type ExtractRequest = z.infer<typeof ExtractRequest>;

export const ExtractedTask = z.object({
  title: z.string(),
  course: z.string().nullable(),
  dueDate: z.string().nullable(),
  estimatedMinutes: z.number(),
  estimateLow: z.number(),
  estimateHigh: z.number(),
  difficulty: z.number(),
  importance: z.number(),
  needsCommunication: z.boolean(),
  /** 0 to 1 per field, so the preview can mark guesses. */
  confidence: z.object({ title: z.number(), dueDate: z.number(), course: z.number(), estimate: z.number() }),
  /** Verbatim snippet of the source this came from, for highlighting. Empty for images. */
  sourceSpan: z.string(),
  kind: z.enum(["task", "event"])
});

export const ExtractResponse = z.object({
  items: z.array(ExtractedTask).max(40),
  note: z.string()
});
export type ExtractResponse = z.infer<typeof ExtractResponse>;
export type ExtractedTask = z.infer<typeof ExtractedTask>;

/* Teacher message */

export const MessageRequest = z.object({
  teacherName: z.string().nullable(),
  course: z.string().nullable(),
  reason: z.string(),
  requests: z.array(z.string()),
  commitment: z.string().nullable(),
  tone: z.enum(["straightforward", "warm", "brief"]),
  studentName: z.string().nullable(),
  /** The teacher's reply, when drafting a follow-up. */
  replyTo: z.string().nullable(),
  relevantTasks: z.array(z.object({ title: z.string(), dueDate: z.string().nullable() }))
});
export type MessageRequest = z.infer<typeof MessageRequest>;

export const MessageResponse = z.object({
  subject: z.string(),
  body: z.string()
});
export type MessageResponse = z.infer<typeof MessageResponse>;

/* Health */

export interface HealthResponse {
  mode: "key" | "plan" | "mock" | "none";
  model: string;
  modelAvailable: boolean | null;
  connectedAs?: string | null;
  expiresAt?: string | null;
  availableModels?: string[];
  error?: string;
}

/* Transport */

/** Server-sent event names used by the streaming endpoints. */
export type StreamEvent =
  | { event: "delta"; text: string }
  | { event: "done"; result: unknown; mode: string; model: string }
  | { event: "error"; code: string; message: string };
