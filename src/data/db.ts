import Dexie, { type Table } from "dexie";
import type {
  CheckIn,
  FixedEvent,
  FocusSession,
  Plan,
  Profile,
  Reflection,
  Settings,
  Subtask,
  Task
} from "./types";

class PaceDB extends Dexie {
  tasks!: Table<Task, string>;
  subtasks!: Table<Subtask, string>;
  checkIns!: Table<CheckIn, string>;
  plans!: Table<Plan, string>;
  reflections!: Table<Reflection, string>;
  settings!: Table<Settings, string>;
  sessions!: Table<FocusSession, string>;
  events!: Table<FixedEvent, string>;
  profile!: Table<Profile, string>;

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
    // Add focus sessions, fixed events, and the learned profile.
    // Existing tables keep their indexes; new fields on them are optional,
    // so older records read back unchanged.
    this.version(2).stores({
      tasks: "id, status, dueDate, course, externalId",
      subtasks: "id, taskId, order",
      checkIns: "id, date",
      plans: "id, date",
      reflections: "id, date",
      settings: "id",
      sessions: "id, date, taskId, subtaskId",
      events: "id, date, externalId",
      profile: "id"
    });
  }
}

export const db = new PaceDB();

export const DEFAULT_SETTINGS: Settings = {
  id: "app",
  onboarded: false,
  largeText: false,
  highContrast: false,
  reduceMotion: false,
  theme: "dark",
  aiEnabled: true
};

export const DEFAULT_PROFILE: Omit<Profile, "deviceToken"> = {
  id: "me",
  calibration: {},
  calibrationByType: {},
  energy: {}
};
