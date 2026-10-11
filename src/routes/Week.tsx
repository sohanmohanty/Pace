import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Link, useNavigate } from "react-router-dom";
import { Archive, Mail } from "lucide-react";
import { DayLine } from "../components/DayLine";
import { useToast } from "../components/Toast";
import { Button, Card, Chip, Eyebrow, PageHeader, SectionTitle } from "../components/ui";
import { db } from "../data/db";
import { archiveDoneTasks, listEventsBetween, listPlansSince, listSessionsSince } from "../data/repo";
import type { Plan } from "../data/types";
import { addDaysISO, daysUntil, formatShort, parseISODate, todayISO } from "../lib/dates";
import { minutesLabel } from "../lib/labels";
import { taskOrderFor } from "../lib/usePlanner";
import { budgetForDial } from "../logic/capacity";

// Seven Day Lines: three past days, today, and three ahead. Past days show
// plans and completion; future days show deadlines. Avoid red indicators
// and streaks, including on days with no activity.

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function Week() {
  const navigate = useNavigate();
  const toast = useToast();
  const today = todayISO();
  const from = addDaysISO(today, -3);
  const to = addDaysISO(today, 10);

  const allTasks = useLiveQuery(() => db.tasks.toArray(), []);
  const plans = useLiveQuery(() => listPlansSince(from), [from]);
  const events = useLiveQuery(() => listEventsBetween(from, to), [from, to]);
  const sessions = useLiveQuery(() => listSessionsSince(addDaysISO(today, -6)), [today]);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysISO(today, i - 3)), [today]);

  if (allTasks === undefined || plans === undefined || events === undefined || sessions === undefined) return null;

  const active = allTasks.filter((t) => !t.archived);
  const open = active.filter((t) => t.status !== "done");
  const taskOrder = taskOrderFor(active);
  const planByDate = new Map<string, Plan>();
  for (const p of plans) {
    const prev = planByDate.get(p.date);
    if (!prev || prev.createdAt < p.createdAt) planByDate.set(p.date, p);
  }

  const weekCutoff = addDaysISO(today, -6);
  const stepsDone = plans.filter((p) => p.date >= weekCutoff).flatMap((p) => p.actions).filter((a) => a.completed).length;
  const minutesFocused = sessions.reduce((s, x) => s + (x.minutes ?? 0), 0);
  const tasksFinished = allTasks.filter((t) => t.status === "done" && t.updatedAt.slice(0, 10) >= weekCutoff).length;

  // The week ahead: due minutes vs. a realistic capacity from recent dials.
  const recentDials = plans.filter((p) => p.dial !== undefined).map((p) => p.dial as number);
  const typicalDial = recentDials.length > 0 ? Math.round(recentDials.reduce((s, d) => s + d, 0) / recentDials.length) : 55;
  const dueSoon = open.filter((t) => t.dueDate && daysUntil(t.dueDate, today) >= 0 && daysUntil(t.dueDate, today) <= 7);
  const dueMinutes = dueSoon.reduce((s, t) => s + t.estimatedMinutes, 0);
  const likelyCapacity = budgetForDial(typicalDial) * 7;
  const needsComm = open.filter((t) => t.needsCommunication);
  const finishedUnarchived = allTasks.filter((t) => t.status === "done" && !t.archived).length;

  return (
    <div className="space-y-6">
      <PageHeader title="The week" />

      <section aria-label="Seven days" className="card overflow-hidden p-2 sm:p-3">
        <div className="grid grid-cols-7 gap-1 sm:gap-2">
          {days.map((d) => {
            const plan = planByDate.get(d);
            const isToday = d === today;
            const isPast = d < today;
            const due = open.filter((t) => t.dueDate === d);
            const dayEvents = events.filter((e) => e.date === d);
            const dt = parseISODate(d);
            return (
              <Link
                key={d}
                to={isToday ? "/" : `/tasks`}
                className={`flex min-w-0 flex-col rounded-[0.9rem] px-1 py-2 text-center transition-colors hover:bg-surface-2 ${
                  isToday ? "bg-tint" : ""
                }`}
                aria-label={`${WD[dt.getDay()]} ${formatShort(d)}${plan ? `, ${plan.actions.filter((a) => a.completed).length} of ${plan.actions.length} steps done` : ""}${due.length ? `, ${due.length} due` : ""}`}
              >
                <span className={`text-[0.7rem] font-semibold uppercase tracking-wider ${isToday ? "text-tint-ink" : "text-soft"}`}>
                  {WD[dt.getDay()]}
                </span>
                <span className={`tabular text-[1.05rem] ${isToday ? "font-semibold" : ""}`}>{dt.getDate()}</span>
                <div className="mt-1 h-10">
                  {plan ? (
                    <DayLine actions={plan.actions} budgetMinutes={plan.budgetMinutes} size="thumb" taskOrder={taskOrder} showSpare={false} showWindows={false} />
                  ) : (
                    <div className="mx-auto mt-4 h-[2px] w-3/4 rounded-full bg-line" aria-hidden="true" />
                  )}
                </div>
                <div className="mt-1 flex min-h-5 flex-wrap justify-center gap-0.5">
                  {due.slice(0, 3).map((t) => (
                    <span key={t.id} className={`h-1.5 w-1.5 rounded-full ${isPast ? "bg-line-strong" : "bg-brand"}`} title={t.title} />
                  ))}
                  {dayEvents.slice(0, 2).map((e) => (
                    <span key={e.id} className="h-1.5 w-1.5 rounded-sm bg-soft" title={e.title} />
                  ))}
                </div>
              </Link>
            );
          })}
        </div>
        <p className="mt-2 px-2 text-[0.8rem] text-soft">
          <span className="mr-3 inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-brand" /> due</span>
          <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-sm bg-soft" /> fixed event</span>
        </p>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <SectionTitle>What happened</SectionTitle>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Chip tone="good">{stepsDone} step{stepsDone === 1 ? "" : "s"} done</Chip>
            <Chip tone="good">{tasksFinished} task{tasksFinished === 1 ? "" : "s"} finished</Chip>
            {minutesFocused > 0 && <Chip>{minutesLabel(minutesFocused)} in focus</Chip>}
          </div>
          <p className="mt-3 text-soft">
            {stepsDone === 0 && tasksFinished === 0
              ? "A quiet week is information, not a verdict. This week can start small."
              : "Every one of these was a real start on a real day."}
          </p>
        </Card>

        <Card>
          <SectionTitle>What the week needs</SectionTitle>
          <div className="mt-3 space-y-2 text-[0.98rem]">
            <div className="flex justify-between">
              <span>Due in the next 7 days</span>
              <span className="tabular font-semibold">{dueSoon.length} task{dueSoon.length === 1 ? "" : "s"} · {minutesLabel(dueMinutes)}</span>
            </div>
            <div className="flex justify-between">
              <span>Your typical week, at a {typicalDial} dial</span>
              <span className="tabular font-semibold">about {minutesLabel(likelyCapacity)}</span>
            </div>
          </div>
          <p className="mt-3 text-soft">
            {dueMinutes <= likelyCapacity * 0.7
              ? "This fits with room to spare. A message or two could still make it lighter."
              : dueMinutes <= likelyCapacity
                ? "This fits if the week goes roughly to plan. Worth asking about one deadline."
                : "More is due than a typical week holds. That is a reason to send a message, not a reason to push harder."}
          </p>
        </Card>
      </div>

      {needsComm.length > 0 && (
        <Card>
          <div className="flex items-baseline justify-between">
            <SectionTitle>Messages that would unlock things</SectionTitle>
            <Eyebrow>{needsComm.length}</Eyebrow>
          </div>
          <ul className="mt-3 space-y-1.5">
            {needsComm.map((t) => (
              <li key={t.id}>
                <Link
                  to={`/message?course=${encodeURIComponent(t.course ?? "")}&about=${encodeURIComponent(t.title)}`}
                  className="flex items-center gap-2 rounded-[0.875rem] border border-line px-3.5 py-2.5 font-medium text-brand-deep hover:bg-brand-soft"
                >
                  <Mail aria-hidden="true" size={17} />
                  {t.title}
                  {t.dueDate && <span className="ml-auto text-[0.85rem] font-normal text-soft">{formatShort(t.dueDate)}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        {finishedUnarchived > 0 && (
          <Button
            variant="soft"
            onClick={async () => {
              const n = await archiveDoneTasks();
              toast(`Archived ${n} finished task${n === 1 ? "" : "s"}`);
            }}
          >
            <Archive aria-hidden="true" size={17} />
            Archive {finishedUnarchived} finished
          </Button>
        )}
        <Button onClick={() => navigate("/")}>Back to today</Button>
      </div>
    </div>
  );
}
