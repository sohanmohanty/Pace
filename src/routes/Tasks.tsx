import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Plus } from "lucide-react";
import { EmptyState } from "../components/EmptyState";
import { QuickAdd } from "../components/QuickAdd";
import { TaskCard } from "../components/TaskCard";
import { useToast } from "../components/Toast";
import { Button, Card, PageHeader } from "../components/ui";
import { db } from "../data/db";
import { loadDemoData } from "../data/demo";
import type { Subtask, Task } from "../data/types";
import { daysUntil } from "../lib/dates";

type Filter = "all" | "quick" | "message" | "hard";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "quick", label: "Quick (≤20m)" },
  { id: "message", label: "Needs message" },
  { id: "hard", label: "Feels hard" }
];

function matches(task: Task, filter: Filter): boolean {
  if (filter === "quick") return task.estimatedMinutes <= 20;
  if (filter === "message") return task.needsCommunication;
  if (filter === "hard") return task.difficulty >= 4;
  return true;
}

function Group({
  title,
  hint,
  tasks,
  subsByTask
}: {
  title: string;
  hint?: string;
  tasks: Task[];
  subsByTask: Map<string, Subtask[]>;
}) {
  if (tasks.length === 0) return null;
  return (
    <section aria-label={title}>
      <div className="mb-2 flex items-baseline gap-2">
        <h2 className="font-semibold">{title}</h2>
        {hint && <p className="text-[0.85rem] text-soft">{hint}</p>}
      </div>
      <div className="space-y-2">
        {tasks.map((t) => (
          <TaskCard key={t.id} task={t} subtasks={subsByTask.get(t.id) ?? []} />
        ))}
      </div>
    </section>
  );
}

export function TasksPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const navigate = useNavigate();
  const toast = useToast();

  const allTasks = useLiveQuery(() => db.tasks.toArray(), []);
  const subtasks = useLiveQuery(() => db.subtasks.toArray(), []);

  if (allTasks === undefined || subtasks === undefined) return null;

  const subsByTask = new Map<string, Subtask[]>();
  for (const s of subtasks) {
    const list = subsByTask.get(s.taskId);
    if (list) list.push(s);
    else subsByTask.set(s.taskId, [s]);
  }

  const active = allTasks.filter((t) => !t.archived);
  const open = active
    .filter((t) => t.status !== "done" && matches(t, filter))
    .sort((a, b) => {
      const ad = a.dueDate ?? "9999-12-31";
      const bd = b.dueDate ?? "9999-12-31";
      if (ad !== bd) return ad < bd ? -1 : 1;
      return b.importance - a.importance;
    });
  const finished = active.filter((t) => t.status === "done");

  const overdue = open.filter((t) => t.dueDate && daysUntil(t.dueDate) < 0);
  const thisWeek = open.filter(
    (t) => t.dueDate && daysUntil(t.dueDate) >= 0 && daysUntil(t.dueDate) <= 7
  );
  const later = open.filter((t) => t.dueDate && daysUntil(t.dueDate) > 7);
  const someday = open.filter((t) => !t.dueDate);

  return (
    <div className="space-y-5 lg:grid lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start lg:gap-x-6 lg:space-y-0">
      <div className="lg:col-span-2">
        <PageHeader
          title="Tasks"
          subtitle="Everything in one place, no shame attached."
          action={
            <Button onClick={() => navigate("/add")}>
              <Plus aria-hidden="true" size={20} />
              Add
            </Button>
          }
        />
      </div>

      <Card className="lg:hidden">
        <QuickAdd />
      </Card>

      <div className="min-w-0 space-y-5">
      {active.length === 0 ? (
        <EmptyState
          title="Nothing here yet"
          body="Add what's on your plate, or load an example to see how Pace works."
        >
          <Button
            variant="soft"
            size="lg"
            onClick={async () => {
              await loadDemoData();
              toast("Example tasks loaded");
            }}
          >
            Load example tasks
          </Button>
        </EmptyState>
      ) : (
        <>
          <div role="group" aria-label="Filter tasks" className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                aria-pressed={filter === f.id}
                onClick={() => setFilter(f.id)}
                className={`rounded-full border-[1.5px] px-3 py-1.5 text-[0.9rem] font-medium transition-colors ${
                  filter === f.id
                    ? "border-brand bg-brand text-white"
                    : "border-line bg-surface text-ink hover:bg-bg"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <Group
            title="Catch-up"
            hint="past due; these can restart small"
            tasks={overdue}
            subsByTask={subsByTask}
          />
          <Group title="This week" tasks={thisWeek} subsByTask={subsByTask} />
          <Group title="Later" tasks={later} subsByTask={subsByTask} />
          <Group title="No date yet" tasks={someday} subsByTask={subsByTask} />
          <Group title="Finished" tasks={finished} subsByTask={subsByTask} />

          {open.length === 0 && filter !== "all" && (
            <p className="text-center text-soft">Nothing matches this filter right now.</p>
          )}
        </>
      )}
      </div>

      <aside className="hidden space-y-5 lg:block">
        <Card>
          <QuickAdd />
        </Card>
        <Link
          to="/reset"
          className="flex items-center justify-between rounded-2xl border border-line bg-surface p-4 font-medium"
        >
          Weekly reset: see what changed
          <ArrowRight aria-hidden="true" size={20} />
        </Link>
      </aside>

      <Link
        to="/reset"
        className="flex items-center justify-between rounded-2xl border border-line bg-surface p-4 font-medium lg:hidden"
      >
        Weekly reset: see what changed
        <ArrowRight aria-hidden="true" size={20} />
      </Link>
    </div>
  );
}
