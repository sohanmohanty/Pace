import type { Level, Subtask, SubtaskType, Task } from "../data/types";
import { uid } from "../lib/id";

export type TemplateKey = "essay" | "test" | "reading" | "project" | "communication" | "generic";

interface TemplateStep {
  title: string;
  minutes: number;
  difficulty: Level;
  type: SubtaskType;
}

export const TEMPLATES: Record<TemplateKey, { label: string; steps: TemplateStep[] }> = {
  essay: {
    label: "Essay / paper",
    steps: [
      { title: "Read the prompt carefully", minutes: 10, difficulty: 2, type: "starter" },
      { title: "Create a rough outline", minutes: 15, difficulty: 3, type: "focus" },
      { title: "Write a working thesis", minutes: 10, difficulty: 3, type: "focus" },
      { title: "Find evidence or quotes", minutes: 20, difficulty: 3, type: "focus" },
      { title: "Draft body paragraph 1", minutes: 25, difficulty: 4, type: "focus" },
      { title: "Draft body paragraph 2", minutes: 25, difficulty: 4, type: "focus" },
      { title: "Write the intro", minutes: 15, difficulty: 3, type: "focus" },
      { title: "Write the conclusion", minutes: 15, difficulty: 3, type: "focus" },
      { title: "Revise once, start to finish", minutes: 20, difficulty: 3, type: "review" },
      { title: "Submit", minutes: 5, difficulty: 1, type: "submit" }
    ]
  },
  test: {
    label: "Test / quiz catch-up",
    steps: [
      { title: "Identify the topics you missed", minutes: 10, difficulty: 2, type: "starter" },
      { title: "Collect notes and materials", minutes: 15, difficulty: 2, type: "starter" },
      { title: "Ask the teacher what to prioritize", minutes: 5, difficulty: 2, type: "communication" },
      { title: "Review the first topic for 15 minutes", minutes: 15, difficulty: 3, type: "review" },
      { title: "Do 5 practice problems", minutes: 20, difficulty: 4, type: "focus" },
      { title: "Mark what's still confusing", minutes: 10, difficulty: 2, type: "review" },
      { title: "Confirm the retake or next steps", minutes: 5, difficulty: 2, type: "communication" }
    ]
  },
  reading: {
    label: "Reading assignment",
    steps: [
      { title: "Open the text and skim the headings", minutes: 5, difficulty: 1, type: "starter" },
      { title: "Read the first section", minutes: 15, difficulty: 2, type: "focus" },
      { title: "Write a 3-bullet summary", minutes: 10, difficulty: 2, type: "review" },
      { title: "Mark the confusing part", minutes: 5, difficulty: 1, type: "review" },
      { title: "Finish the remaining pages", minutes: 25, difficulty: 3, type: "focus" },
      { title: "Submit notes or response", minutes: 5, difficulty: 1, type: "submit" }
    ]
  },
  project: {
    label: "Project / lab / report",
    steps: [
      { title: "Find the instructions and rubric", minutes: 10, difficulty: 1, type: "starter" },
      { title: "List what's done vs. missing", minutes: 10, difficulty: 2, type: "review" },
      { title: "Gather data, notes, or materials", minutes: 15, difficulty: 2, type: "focus" },
      { title: "Draft the first section", minutes: 25, difficulty: 4, type: "focus" },
      { title: "Draft the remaining sections", minutes: 30, difficulty: 4, type: "focus" },
      { title: "Final check against the rubric", minutes: 10, difficulty: 2, type: "review" },
      { title: "Submit", minutes: 5, difficulty: 1, type: "submit" }
    ]
  },
  communication: {
    label: "Message / ask for help",
    steps: [
      { title: "Decide who to contact", minutes: 3, difficulty: 1, type: "starter" },
      { title: "Pick a reason phrase, no details needed", minutes: 3, difficulty: 1, type: "starter" },
      { title: "Write what you need and your plan", minutes: 5, difficulty: 2, type: "communication" },
      { title: "Send it", minutes: 2, difficulty: 1, type: "communication" }
    ]
  },
  generic: {
    label: "General assignment",
    steps: [
      { title: "Open it and find the requirements", minutes: 10, difficulty: 1, type: "starter" },
      { title: "Do the first 15-minute chunk", minutes: 15, difficulty: 3, type: "focus" },
      { title: "Mark anything confusing", minutes: 5, difficulty: 1, type: "review" },
      { title: "Do the next chunk", minutes: 20, difficulty: 3, type: "focus" },
      { title: "Wrap up: submit or save progress", minutes: 10, difficulty: 2, type: "submit" }
    ]
  }
};

/** Keyword-based template detection from the task title. Order matters. */
export function detectTemplate(title: string): TemplateKey {
  const t = title.toLowerCase();
  if (/\b(email|e-mail|message|contact|reach out|talk to|ask)\b/.test(t)) return "communication";
  if (/\b(test|quiz|exam|midterm|final|study|retake)\b/.test(t)) return "test";
  if (/\b(lab|report|project|presentation|slides|poster)\b/.test(t)) return "project";
  if (/\b(essay|paper|composition|write|writing)\b/.test(t)) return "essay";
  if (/\b(read|reading|chapter|chapters|pages|book|novel|article)\b/.test(t)) return "reading";
  return "generic";
}

const roundTo5 = (m: number) => Math.max(5, Math.round(m / 5) * 5);

/**
 * Generate ordered subtasks for a task from a template, scaled so the total
 * roughly matches the task's own effort estimate (clamped ×0.5–×2.5, steps
 * kept between 5 and 60 minutes).
 */
export function generateSubtasks(task: Task, key?: TemplateKey): Subtask[] {
  const templateKey = key ?? detectTemplate(task.title);
  const template = TEMPLATES[templateKey];

  const templateTotal = template.steps.reduce((s, st) => s + st.minutes, 0);
  const scale =
    task.estimatedMinutes > 0 && templateTotal > 0
      ? Math.min(2.5, Math.max(0.5, task.estimatedMinutes / templateTotal))
      : 1;

  const steps: TemplateStep[] = [...template.steps];
  const hasComm = steps.some((s) => s.type === "communication");
  if (task.needsCommunication && !hasComm) {
    steps.unshift({
      title: `Send a short update about ${task.title}`,
      minutes: 5,
      difficulty: 2,
      type: "communication"
    });
  }

  return steps.map((step, i) => ({
    id: uid(),
    taskId: task.id,
    title: step.title,
    // Communication and submit steps don't grow with assignment size.
    estimatedMinutes:
      step.type === "communication" || step.type === "submit"
        ? step.minutes
        : Math.min(60, roundTo5(step.minutes * scale)),
    difficulty: step.difficulty,
    type: step.type,
    status: "not_started",
    order: i,
    demo: task.demo
  }));
}
