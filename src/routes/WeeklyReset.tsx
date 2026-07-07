import { useLiveQuery } from "dexie-react-hooks";
import { Link, useNavigate } from "react-router-dom";
import { Archive, Mail } from "lucide-react";
import { useToast } from "../components/Toast";
import { Button, Card, Chip, PageHeader, SectionTitle } from "../components/ui";
import { db } from "../data/db";
import { archiveDoneTasks, listPlansSince } from "../data/repo";
import { addDaysISO, daysUntil, todayISO } from "../lib/dates";

export function WeeklyReset() {
  const navigate = useNavigate();
  const toast = useToast();

  const allTasks = useLiveQuery(() => db.tasks.toArray(), []);
  const weekPlans = useLiveQuery(() => listPlansSince(addDaysISO(todayISO(), -6)), []);

  if (allTasks === undefined || weekPlans === undefined) return null;

  const cutoff = addDaysISO(todayISO(), -6);
  const stepsDone = weekPlans.flatMap((p) => p.actions).filter((a) => a.completed).length;
  const tasksFinished = allTasks.filter(
    (t) => t.status === "done" && t.updatedAt.slice(0, 10) >= cutoff
  ).length;

  const open = allTasks.filter((t) => !t.archived && t.status !== "done");
  const overdue = open.filter((t) => t.dueDate && daysUntil(t.dueDate) < 0).length;
  const thisWeek = open.filter(
    (t) => t.dueDate && daysUntil(t.dueDate) >= 0 && daysUntil(t.dueDate) <= 7
  ).length;
  const later = open.filter((t) => !t.dueDate || daysUntil(t.dueDate) > 7).length;
  const needsComm = open.filter((t) => t.needsCommunication);
  const finishedUnarchived = allTasks.filter((t) => t.status === "done" && !t.archived).length;

  return (
    <div className="space-y-5 lg:mx-auto lg:max-w-2xl">
      <PageHeader
        title="Weekly reset"
        subtitle="Here's what changed this week. Let's choose the next realistic step."
      />

      <Card>
        <SectionTitle>What happened</SectionTitle>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Chip tone="good">
            {stepsDone} step{stepsDone === 1 ? "" : "s"} completed
          </Chip>
          <Chip tone="good">
            {tasksFinished} task{tasksFinished === 1 ? "" : "s"} finished
          </Chip>
        </div>
        {stepsDone === 0 && tasksFinished === 0 && (
          <p className="mt-2 text-soft">
            A quiet week is information, not a verdict. This week can start small.
          </p>
        )}
      </Card>

      <Card>
        <SectionTitle>What's left</SectionTitle>
        <ul className="mt-3 space-y-1.5 text-[0.98rem]">
          <li className="flex justify-between">
            <span>Catch-up (past due)</span>
            <span className="font-semibold">{overdue}</span>
          </li>
          <li className="flex justify-between">
            <span>Due this week</span>
            <span className="font-semibold">{thisWeek}</span>
          </li>
          <li className="flex justify-between">
            <span>Later or undated</span>
            <span className="font-semibold">{later}</span>
          </li>
        </ul>
      </Card>

      {needsComm.length > 0 && (
        <Card>
          <SectionTitle>Messages that would unlock things</SectionTitle>
          <ul className="mt-3 space-y-1.5">
            {needsComm.map((t) => (
              <li key={t.id}>
                <Link
                  to={`/message?course=${encodeURIComponent(t.course ?? "")}&about=${encodeURIComponent(t.title)}`}
                  className="flex items-center gap-2 rounded-xl border border-line px-3.5 py-2.5 font-medium text-brand-deep hover:bg-brand-soft"
                >
                  <Mail aria-hidden="true" size={17} />
                  {t.title}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="space-y-2">
        {finishedUnarchived > 0 && (
          <Button
            variant="soft"
            size="lg"
            onClick={async () => {
              const n = await archiveDoneTasks();
              toast(`Archived ${n} finished task${n === 1 ? "" : "s"}`);
            }}
          >
            <Archive aria-hidden="true" size={18} />
            Archive {finishedUnarchived} finished task{finishedUnarchived === 1 ? "" : "s"}
          </Button>
        )}
        <Button size="lg" onClick={() => navigate("/plan")}>
          Choose today's next step
        </Button>
      </div>
    </div>
  );
}
