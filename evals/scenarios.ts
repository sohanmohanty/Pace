// Golden planner scenarios based on student workloads and capacity.

import type { CapacityLevel, DayWindow, FixedEvent, Subtask, Task, WorkType } from "../src/data/types";
import type { BuiltPlan } from "../src/logic/scheduler";
import { sampleTasks } from "../src/lib/sampleDay";

export interface Scenario {
  name: string;
  today: string;
  tasks: Task[];
  subtasks: Subtask[];
  checkIn: { dial?: number; capacity?: CapacityLevel; windows?: DayWindow[]; heavy?: WorkType[]; availableMinutes?: number };
  multiplier?: number;
  calibration?: Record<string, { ratio: number; n: number }>;
  events?: FixedEvent[];
  instruction?: string;
  expectLocal?: ((plan: BuiltPlan) => void)[];
}

const TODAY = "2026-10-05";
const base = sampleTasks(TODAY);

const task = (id: string, patch: Partial<Task>): Task => ({
  id,
  title: id,
  estimatedMinutes: 60,
  difficulty: 3,
  importance: 3,
  status: "not_started",
  needsCommunication: false,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  ...patch
});

export const SCENARIOS: Scenario[] = [
  {
    name: "pile-up after an absence, low day",
    today: TODAY,
    tasks: base.tasks,
    subtasks: base.subtasks,
    checkIn: { dial: 18 },
    expectLocal: [
      (p) => {
        if (p.actions.length > 3) throw new Error("low day should have at most 3 steps");
        for (const a of p.actions) if (a.estimatedMinutes > 15) throw new Error("low day step too long");
      }
    ]
  },
  {
    name: "medium day, evening only, reading feels heavy",
    today: TODAY,
    tasks: base.tasks,
    subtasks: base.subtasks,
    checkIn: { dial: 55, windows: ["evening"], heavy: ["reading"] },
    expectLocal: [(p) => p.actions.forEach((a) => { if (a.window !== "evening") throw new Error("must be evening"); })]
  },
  {
    name: "high day with a hard 60-minute cap",
    today: TODAY,
    tasks: base.tasks,
    subtasks: base.subtasks,
    checkIn: { dial: 90, availableMinutes: 60 },
    expectLocal: [(p) => { if (p.budgetMinutes > 60) throw new Error("cap not honored"); }]
  },
  {
    name: "not sure, start gently",
    today: TODAY,
    tasks: base.tasks,
    subtasks: base.subtasks,
    checkIn: { dial: 35, capacity: "unsure" },
    expectLocal: [(p) => { if (p.actions.length > 3) throw new Error("unsure should be gentle"); }]
  },
  {
    name: "exam week: three tests, nothing broken down",
    today: TODAY,
    tasks: [
      task("t1", { title: "AP Chem unit test", course: "Chemistry", dueDate: "2026-10-07", estimatedMinutes: 120, importance: 5, difficulty: 5 }),
      task("t2", { title: "Precalc quiz on logs", course: "Math", dueDate: "2026-10-06", estimatedMinutes: 45, importance: 4 }),
      task("t3", { title: "History DBQ practice", course: "History", dueDate: "2026-10-09", estimatedMinutes: 90, importance: 4 }),
      task("t4", { title: "Spanish oral prep", course: "Spanish", dueDate: "2026-10-08", estimatedMinutes: 30, importance: 3 })
    ],
    subtasks: [],
    checkIn: { dial: 62 }
  },
  {
    name: "everything is a message waiting to happen",
    today: TODAY,
    tasks: [
      task("m1", { title: "Missed lab, need makeup slot", course: "Biology", dueDate: "2026-10-03", needsCommunication: true, importance: 5 }),
      task("m2", { title: "Ask about essay extension", course: "English", dueDate: "2026-10-06", needsCommunication: true, importance: 4 }),
      task("m3", { title: "Get notes from the week I missed", course: "History", needsCommunication: true }),
      task("m4", { title: "Problem set 6", course: "Math", dueDate: "2026-10-08", estimatedMinutes: 40 })
    ],
    subtasks: [],
    checkIn: { dial: 50 },
    expectLocal: [(p) => { if (p.actions.filter((a) => a.reason === "communication").length > 1) throw new Error("message cap"); }]
  },
  {
    name: "one giant project and nothing else",
    today: TODAY,
    tasks: [task("g1", { title: "Science fair project", course: "Physics", dueDate: "2026-10-20", estimatedMinutes: 600, importance: 5, difficulty: 4 })],
    subtasks: [],
    checkIn: { dial: 70 }
  },
  {
    name: "replan at 7pm with two done and an instruction",
    today: TODAY,
    tasks: base.tasks,
    subtasks: base.subtasks.map((s) => (s.id === "bio-0" || s.id === "bio-1" ? { ...s, status: "done" as const } : s)),
    checkIn: { dial: 50, windows: ["evening"] },
    instruction: "nothing with reading tonight, I have 40 minutes"
  },
  {
    name: "calibration says biology runs 1.6x",
    today: TODAY,
    tasks: base.tasks,
    subtasks: base.subtasks,
    checkIn: { dial: 60 },
    calibration: { Biology: { ratio: 1.6, n: 5 } }
  },
  {
    name: "a fixed event eats the afternoon",
    today: TODAY,
    tasks: base.tasks,
    subtasks: base.subtasks,
    checkIn: { dial: 65, windows: ["afternoon", "evening"] },
    events: [{ id: "e1", date: TODAY, title: "Soccer practice", start: "15:30", end: "17:30", source: "manual" }]
  },
  {
    name: "nothing due, light maintenance",
    today: TODAY,
    tasks: [task("n1", { title: "Organize notes binder", estimatedMinutes: 30, importance: 2 }), task("n2", { title: "Start reading the next novel", course: "English", estimatedMinutes: 60, importance: 3 })],
    subtasks: [],
    checkIn: { dial: 45 }
  },
  {
    name: "reflections said lighter twice",
    today: TODAY,
    tasks: base.tasks,
    subtasks: base.subtasks,
    checkIn: { dial: 60 },
    multiplier: 0.72
  }
];
