// Deterministic responses for PACE_AI_MOCK=1. Exercise screens and
// end-to-end tests without network calls.

import type {
  BreakdownRequest,
  BreakdownResponse,
  ExtractRequest,
  ExtractResponse,
  MessageRequest,
  MessageResponse,
  PlanRequest,
  PlanResponse
} from "../../src/shared/schema.js";

export function mockPlan(req: PlanRequest): PlanResponse {
  const { limits, checkIn } = req;
  const open = req.tasks.filter((t) => t.status !== "done");
  const byUrgency = [...open].sort((a, b) => {
    const ad = a.daysUntilDue ?? 999;
    const bd = b.daysUntilDue ?? 999;
    if (ad !== bd) return ad - bd;
    return b.importance - a.importance;
  });
  const actions: PlanResponse["actions"] = [];
  const windows = checkIn.windows.length > 0 ? checkIn.windows : (["evening"] as const);
  let used = 0;
  let messages = 0;
  for (const t of byUrgency) {
    if (actions.length >= limits.maxActions) break;
    const next = t.steps.filter((s) => !s.done).sort((a, b) => a.order - b.order)[0];
    const minutes = Math.min(limits.maxBlock, Math.max(5, Math.round((next?.minutes ?? Math.min(t.estimatedMinutes, 25)) / 5) * 5));
    if (used + minutes > limits.budgetMinutes) continue;
    if (next?.type === "communication") {
      if (messages >= limits.maxMessages) continue;
      messages++;
    }
    used += minutes;
    const w = windows[Math.min(windows.length - 1, Math.floor((actions.length / Math.max(1, limits.maxActions)) * windows.length))];
    actions.push({
      taskId: t.id,
      subtaskId: next?.id ?? null,
      title: next ? specific(next.title, t) : `Open ${t.title} and do the first small piece`,
      minutes,
      window: w,
      why: t.daysUntilDue !== null && t.daysUntilDue < 0 ? "past due, a small restart counts" : t.daysUntilDue !== null && t.daysUntilDue <= 2 ? "due very soon" : t.importance >= 4 ? "high importance" : "steady progress",
      firstAction: `Open ${t.course ? `your ${t.course} folder` : "the assignment"} and find ${next ? next.title.toLowerCase() : "the instructions"}.`,
      workType: next?.workType ?? "writing"
    });
  }
  const deferred = open.filter((t) => !actions.some((a) => a.taskId === t.id)).slice(0, 3).map((t) => ({ taskId: t.id, reason: "fits better on a day with more room" }));
  const lead = actions[0];
  const leadTask = lead ? open.find((t) => t.id === lead.taskId) : undefined;
  const reasoning =
    actions.length === 0
      ? "Nothing fits in today's budget yet. Even five minutes on the first task would count."
      : `Today's capacity is ${label(checkIn.dial)}: ${actions.length} step${actions.length === 1 ? "" : "s"}, about ${used} minutes, inside your ${limits.budgetMinutes}-minute budget. ${leadTask ? `${leadTask.title} comes first because ${lead.why}.` : ""} ${deferred.length > 0 ? `${deferred.length} other task${deferred.length === 1 ? " waits" : "s wait"} for a day with more room; nothing is lost by leaving them.` : ""}`.trim();
  return { reasoning, actions, deferred };
}

function specific(title: string, t: PlanRequest["tasks"][number]): string {
  if (/^(read the prompt|open it|find the instructions)/i.test(title)) return `${title} for ${t.title}`;
  return title;
}

function label(dial: number): string {
  if (dial <= 30) return "a low day";
  if (dial <= 62) return "a medium day";
  return "a high-energy day";
}

export function mockBreakdown(req: BreakdownRequest): BreakdownResponse {
  const t = req.task;
  const subject = t.title.replace(/^(the|a|an)\s+/i, "");
  const steps: BreakdownResponse["steps"] = [
    { title: `Open ${subject} and write down exactly what is being asked`, minutes: 10, difficulty: 1, type: "starter", workType: "reading", firstAction: `Open the assignment for ${subject} and read the first paragraph.` },
    ...(t.needsCommunication ? [{ title: `Send your ${t.course ?? ""} teacher a two-line update`.replace("  ", " "), minutes: 5, difficulty: 2, type: "communication" as const, workType: "people" as const, firstAction: "Open email and type the teacher's name in the To field." }] : []),
    { title: `Gather notes and materials for ${subject}`, minutes: 15, difficulty: 2, type: "focus", workType: "reading", firstAction: "Make one list of what you have and what is missing." },
    { title: `Do the first real chunk of ${subject}`, minutes: 25, difficulty: 4, type: "focus", workType: "writing", firstAction: "Set a 25-minute timer and start with the easiest part." },
    { title: `Do the next chunk of ${subject}`, minutes: 25, difficulty: 4, type: "focus", workType: "writing", firstAction: "Reread the last thing you wrote, then continue." },
    { title: `Check ${subject} against the requirements`, minutes: 10, difficulty: 2, type: "review", workType: "reading", firstAction: "Tick off each requirement from your list." },
    { title: `Submit ${subject}`, minutes: 5, difficulty: 1, type: "submit", workType: "making", firstAction: "Open the portal and attach the file." }
  ];
  return { steps, totalMinutes: steps.reduce((s, x) => s + x.minutes, 0), note: "A small start, two working blocks, a check, and the hand-in." };
}

export function mockExtract(req: ExtractRequest): ExtractResponse {
  const text = req.text ?? "";
  const lines = text.split(/\n+/).map((l) => l.trim()).filter((l) => l.length > 3).slice(0, 8);
  const items: ExtractResponse["items"] = lines.map((line, i) => ({
    title: line.replace(/\s*(due|by)\s.*$/i, "").slice(0, 80) || `Item ${i + 1}`,
    course: req.knownCourses[i % Math.max(1, req.knownCourses.length)] ?? null,
    dueDate: /due|by/i.test(line) ? addDays(req.today, 2 + i) : null,
    estimatedMinutes: 45,
    estimateLow: 30,
    estimateHigh: 75,
    difficulty: 3,
    importance: 3,
    needsCommunication: false,
    confidence: { title: 0.9, dueDate: /due|by/i.test(line) ? 0.6 : 0.2, course: 0.4, estimate: 0.5 },
    sourceSpan: line,
    kind: /test|quiz|exam|practice|game|shift/i.test(line) ? "event" : "task"
  }));
  return { items, note: items.length === 0 ? "No assignments could be identified in the submitted content." : "Dates were read relative to today; check the ones marked uncertain." };
}

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d + n);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function mockMessage(req: MessageRequest): MessageResponse {
  const teacher = req.teacherName || "[Teacher name]";
  const student = req.studentName || "[Your name]";
  const course = req.course ? ` in ${req.course}` : "";
  const reason = req.reason ? ` ${req.reason}` : "";
  const asks = req.requests.length > 0 ? ` Would you be able to ${req.requests[0]}?` : "";
  const commit = req.commitment ? ` My plan is to ${req.commitment}.` : "";
  return {
    subject: req.course ? `Catching up in ${req.course}` : "Catching up",
    body: `Hi ${teacher},\n\nI'm catching up${reason} and wanted to give you a quick update${course}.${commit}${asks}\n\nThank you,\n${student}`
  };
}

/** Stream a JSON string in small chunks so the client's incremental parsing is exercised. */
export async function* chunked(text: string, size = 18, delayMs = 12): AsyncGenerator<string> {
  for (let i = 0; i < text.length; i += size) {
    await new Promise((r) => setTimeout(r, delayMs));
    yield text.slice(i, i + size);
  }
}
