// Sample backlog for the landing demo, explainer, showreel, and onboarding.
// The demo uses the same scheduling code as the daily planner.

import type { Subtask, Task } from "../data/types";
import { addDaysISO, todayISO } from "./dates";
import { generatePlan, type BuiltPlan } from "../logic/scheduler";

const T = (
  id: string,
  title: string,
  course: string,
  dueOffset: number | null,
  estimatedMinutes: number,
  difficulty: 1 | 2 | 3 | 4 | 5,
  importance: 1 | 2 | 3 | 4 | 5,
  needsCommunication = false,
  today = todayISO()
): Task => ({
  id,
  title,
  course,
  dueDate: dueOffset === null ? undefined : addDaysISO(today, dueOffset),
  estimatedMinutes,
  difficulty,
  importance,
  status: "not_started",
  needsCommunication,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z"
});

const S = (taskId: string, i: number, title: string, minutes: number, type: Subtask["type"], difficulty: 1 | 2 | 3 | 4 | 5 = 3, firstAction?: string): Subtask => ({
  id: `${taskId}-${i}`,
  taskId,
  title,
  estimatedMinutes: minutes,
  difficulty,
  type,
  status: "not_started",
  order: i,
  firstAction
});

export function sampleTasks(today = todayISO()): { tasks: Task[]; subtasks: Subtask[] } {
  const tasks: Task[] = [
    T("bio", "Biology lab report", "Biology", -3, 120, 4, 5, true, today),
    T("eng", "Essay on The Great Gatsby", "English", 3, 170, 4, 4, false, today),
    T("math", "Problem set 5.1–5.3", "Math", 1, 45, 3, 3, false, today),
    T("hist", "Read chapter 12 and take notes", "History", 2, 40, 2, 3, false, today),
    T("chem", "Study for the stoichiometry retake", "Chemistry", 5, 90, 5, 5, false, today),
    T("span", "Vocab quiz prep", "Spanish", 4, 30, 2, 3, false, today)
  ];
  const subtasks: Subtask[] = [
    S("bio", 0, "Send a two-line update to Ms. Park", 5, "communication", 2, "Open email and type her name."),
    S("bio", 1, "Re-read the data table and your notes", 15, "review", 2, "Open the lab doc and scroll to the table."),
    S("bio", 2, "Draft the results section", 25, "focus", 4, "Write one sentence per row of the table."),
    S("bio", 3, "Draft the conclusion", 20, "focus", 3, "Answer: what did the data show?"),
    S("bio", 4, "Submit on the portal", 5, "submit", 1),
    S("eng", 0, "Reread the prompt and underline the two asks", 10, "starter", 2, "Open the prompt and find the verb."),
    S("eng", 1, "Rough outline: three claims about Gatsby's green light", 15, "focus", 3, "Write three bullets, one claim each."),
    S("eng", 2, "Find two quotes for claim one", 20, "focus", 3, "Open chapter 1 and search for 'green light'."),
    S("eng", 3, "Draft body paragraph 1", 25, "focus", 4, "Start with the quote, then explain it."),
    S("eng", 4, "Draft body paragraph 2", 25, "focus", 4),
    S("eng", 5, "Write the intro and conclusion", 25, "focus", 3),
    S("eng", 6, "Revise once, start to finish", 20, "review", 3),
    S("math", 0, "Do 5.1 problems 1–6", 20, "focus", 3, "Open the textbook to 5.1."),
    S("math", 1, "Do 5.2 and 5.3, skipping anything confusing", 20, "focus", 3),
    S("math", 2, "Mark the confusing ones to ask about", 5, "review", 1),
    S("hist", 0, "Skim the headings of chapter 12", 5, "starter", 1, "Open the book and read only the bold lines."),
    S("hist", 1, "Read the first half", 15, "focus", 2),
    S("hist", 2, "Read the second half and write five bullets", 20, "focus", 2),
    S("chem", 0, "List the topics the retake covers", 10, "starter", 2),
    S("chem", 1, "Rework the three problems you missed", 25, "focus", 5),
    S("chem", 2, "Do five fresh mole-ratio problems", 25, "focus", 4),
    S("chem", 3, "Mark what is still confusing", 10, "review", 2),
    S("span", 0, "Make flashcards for the new words", 15, "focus", 2),
    S("span", 1, "Run the deck twice", 15, "review", 2)
  ];
  return { tasks, subtasks };
}

/** Generate a sample day with the daily planner at the given dial setting. */
export function samplePlan(dial: number, opts: { windows?: BuiltPlan["windows"]; heavy?: Parameters<typeof generatePlan>[0]["heavy"] } = {}): BuiltPlan {
  const { tasks, subtasks } = sampleTasks();
  return generatePlan({ tasks, subtasks, capacity: "medium", dial, windows: opts.windows, heavy: opts.heavy });
}
