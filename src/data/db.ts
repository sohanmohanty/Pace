import Dexie, { type Table } from "dexie";
import type { CheckIn, Plan, Reflection, Settings, Subtask, Task } from "./types";

class PaceDB extends Dexie {
  tasks!: Table<Task, string>;
  subtasks!: Table<Subtask, string>;
  checkIns!: Table<CheckIn, string>;
  plans!: Table<Plan, string>;
  reflections!: Table<Reflection, string>;
  settings!: Table<Settings, string>;

  constructor() {
    super("pace");
    this.version(1).stores({
      tasks: "id, status, dueDate, course",
      subtasks: "id, taskId, order",
      checkIns: "id, date",
      plans: "id, date",
      reflections: "id, date",
      settings: "id"
    });
  }
}

export const db = new PaceDB();

export const DEFAULT_SETTINGS: Settings = {
  id: "app",
  onboarded: false,
  largeText: false,
  highContrast: false,
  reduceMotion: false
};
