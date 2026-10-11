// Tag sample tasks with demo:1 so they can be cleared separately. Include
// varied tasks without teacher names or medical details.
import { db } from "./db";
import type { Subtask, Task } from "./types";
import { addDaysISO, todayISO } from "../lib/dates";
import { uid } from "../lib/id";

export async function hasDemoData(): Promise<boolean> {
  const tasks = await db.tasks.toArray();
  return tasks.some((t) => t.demo === 1);
}

export async function clearDemoData(): Promise<void> {
  await db.transaction("rw", db.tasks, db.subtasks, db.plans, async () => {
    const demoTasks = await db.tasks.filter((t) => t.demo === 1).toArray();
    const demoIds = new Set(demoTasks.map((t) => t.id));
    await db.subtasks.filter((s) => s.demo === 1 || demoIds.has(s.taskId)).delete();
    await db.tasks.filter((t) => t.demo === 1).delete();
    // Drop plans that reference sample tasks, since they'd point at nothing.
    await db.plans.filter((p) => p.actions.some((a) => demoIds.has(a.taskId))).delete();
  });
}

// Double-taps (or React StrictMode re-runs) must not race clear+insert and
// duplicate the sample tasks; concurrent calls share one in-flight load.
let demoLoadInFlight: Promise<void> | null = null;

export function loadDemoData(): Promise<void> {
  if (!demoLoadInFlight) {
    demoLoadInFlight = doLoadDemoData().finally(() => {
      demoLoadInFlight = null;
    });
  }
  return demoLoadInFlight;
}

async function doLoadDemoData(): Promise<void> {
  await clearDemoData();
  const today = todayISO();
  const nowIso = new Date().toISOString();
  const yesterdayIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const t = (
    title: string,
    course: string | undefined,
    dueOffset: number | null,
    estimatedMinutes: number,
    difficulty: 1 | 2 | 3 | 4 | 5,
    importance: 1 | 2 | 3 | 4 | 5,
    needsCommunication: boolean,
    status: Task["status"] = "not_started",
    updatedAt = nowIso
  ): Task => ({
    id: uid(),
    title,
    course,
    dueDate: dueOffset === null ? undefined : addDaysISO(today, dueOffset),
    estimatedMinutes,
    difficulty,
    importance,
    status,
    needsCommunication,
    demo: 1,
    createdAt: nowIso,
    updatedAt
  });

  const bioLab = t("Biology lab report", "Biology", -3, 120, 4, 5, false, "in_progress");
  const essay = t("English essay on The Great Gatsby", "English", 3, 170, 4, 4, false);
  const chem = t("Study for stoichiometry retake", "Chemistry", 5, 90, 5, 5, true);
  const math = t("Problem set 5.1–5.3", "Math", 1, 45, 3, 3, false);
  const history = t("Read chapter 12 and take notes", "History", 2, 40, 2, 3, false);
  const spanish = t("Vocab quiz prep", "Spanish", 4, 30, 2, 3, false);
  const counselor = t("Ask counselor for the missed-work list", undefined, null, 10, 1, 4, true);
  const pe = t("Turn in PE makeup form", "PE", 7, 10, 1, 2, false);
  const cs = t("CS project milestone 2", "Computer Science", 6, 120, 3, 4, false);
  const physics = t(
    "Physics worksheet 8",
    "Physics",
    -1,
    30,
    2,
    3,
    false,
    "done",
    yesterdayIso
  );

  const rawBioSubs: Array<
    Pick<Subtask, "title" | "estimatedMinutes" | "difficulty" | "type" | "status">
  > = [
    { title: "Find the lab instructions and rubric", estimatedMinutes: 10, difficulty: 1, type: "starter", status: "done" },
    { title: "Send a short update about the lab", estimatedMinutes: 5, difficulty: 2, type: "communication", status: "not_started" },
    { title: "Re-read the data table and notes", estimatedMinutes: 15, difficulty: 2, type: "review", status: "not_started" },
    { title: "Draft the results section", estimatedMinutes: 25, difficulty: 4, type: "focus", status: "not_started" },
    { title: "Draft the conclusion", estimatedMinutes: 20, difficulty: 3, type: "focus", status: "not_started" },
    { title: "Submit on the portal", estimatedMinutes: 5, difficulty: 1, type: "submit", status: "not_started" }
  ];
  const bioSubs: Subtask[] = rawBioSubs.map((s, i) => ({
    ...s,
    id: uid(),
    taskId: bioLab.id,
    order: i,
    demo: 1 as const
  }));

  await db.transaction("rw", db.tasks, db.subtasks, async () => {
    await db.tasks.bulkAdd([
      bioLab, essay, chem, math, history, spanish, counselor, pe, cs, physics
    ]);
    await db.subtasks.bulkAdd(bioSubs);
  });
}
