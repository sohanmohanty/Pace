// Describe the local plan in a short, deterministic paragraph. Use it as
// the initial explanation while AI streams and as the fallback when AI is
// off, so both paths provide an explanation.

import type { CheckIn, PlanAction, Task } from "../data/types";
import { daysUntil, formatShort } from "../lib/dates";
import { minutesLabel } from "../lib/labels";
import { dialLabel, WORK_TYPE_LABELS } from "./capacity";

export function narratePlan(input: {
  actions: PlanAction[];
  budgetMinutes: number;
  checkIn: Pick<CheckIn, "dial" | "capacity" | "heavy" | "windows"> | null;
  tasks: Task[];
  today?: string;
}): string {
  const { actions, budgetMinutes, checkIn, tasks } = input;
  const today = input.today;
  if (actions.length === 0) return "Nothing is planned yet.";

  const planned = actions.reduce((s, a) => s + a.estimatedMinutes, 0);
  const spare = Math.max(0, budgetMinutes - planned);
  const short = actions.filter((a) => a.estimatedMinutes <= 15).length;
  const blocks = actions.filter((a) => a.estimatedMinutes > 15);
  const taskById = new Map(tasks.map((t) => [t.id, t]));

  const sentences: string[] = [];

  // Opening: what kind of day and what the plan looks like.
  const dial = checkIn?.dial;
  const dayWord = checkIn?.capacity === "unsure"
    ? "an unsure day, so this starts gently"
    : dial !== undefined
      ? `${dialLabel(dial)}`
      : checkIn?.capacity === "low"
        ? "a low day"
        : checkIn?.capacity === "high"
          ? "a high-energy day"
          : "a medium day";

  const shape: string[] = [];
  if (short > 0) shape.push(`${numberWord(short)} short step${short === 1 ? "" : "s"}`);
  if (blocks.length > 0) {
    const longest = Math.max(...blocks.map((b) => b.estimatedMinutes));
    shape.push(
      blocks.length === 1
        ? `one ${longest}-minute block`
        : `${numberWord(blocks.length)} longer blocks (up to ${longest} minutes)`
    );
  }
  sentences.push(
    `Today reads as ${dayWord}: ${shape.join(" and ")}, about ${minutesLabel(planned)} in all${
      spare >= 10 ? `, with ${minutesLabel(spare)} spare` : ""
    }.`
  );

  // Why the first non-communication step leads.
  const lead = actions.find((a) => a.reason !== "communication") ?? actions[0];
  const leadTask = taskById.get(lead.taskId);
  if (leadTask) {
    const d = leadTask.dueDate ? daysUntil(leadTask.dueDate, today) : null;
    if (d !== null && d < 0) {
      sentences.push(`${leadTask.title} comes first because it was due ${formatShort(leadTask.dueDate!)}; a small restart counts.`);
    } else if (d === 0) {
      sentences.push(`${leadTask.title} comes first because it's due today.`);
    } else if (d !== null && d <= 2) {
      sentences.push(`${leadTask.title} comes first because it's due ${formatShort(leadTask.dueDate!)}.`);
    } else if (leadTask.importance >= 4) {
      sentences.push(`${leadTask.title} leads because you marked it important.`);
    }
  }

  // Communication steps.
  const comm = actions.filter((a) => a.reason === "communication");
  if (comm.length > 0) {
    sentences.push(
      comm.length === 1
        ? "One quick message is in here because it can unlock help faster than any amount of catching up."
        : `${numberWord(comm.length, true)} quick messages are in here because they can unlock help faster than catching up alone.`
    );
  }

  // Explain adjustments for work marked heavy.
  if (checkIn?.heavy && checkIn.heavy.length > 0) {
    const names = checkIn.heavy.map((h) => WORK_TYPE_LABELS[h].toLowerCase());
    sentences.push(`This plan keeps ${joinNatural(names)} light, as you asked.`);
  }

  // Explain which work was left out of this plan.
  const openIds = new Set(tasks.filter((t) => t.status !== "done" && !t.archived).map((t) => t.id));
  const inPlan = new Set(actions.map((a) => a.taskId));
  const left = [...openIds].filter((id) => !inPlan.has(id)).length;
  if (left > 0) {
    sentences.push(
      left === 1
        ? "One other task waits in your list; nothing is lost by leaving it for another day."
        : `${numberWord(left, true)} other tasks wait in your list; nothing is lost by leaving them for another day.`
    );
  }

  return sentences.join(" ");
}

function numberWord(n: number, capital = false): string {
  const words = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
  const w = n <= 10 ? words[n] : String(n);
  return capital ? w.charAt(0).toUpperCase() + w.slice(1) : w;
}

function joinNatural(items: string[]): string {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}
