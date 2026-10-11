import { Link } from "react-router-dom";
import { Mail } from "lucide-react";
import type { Subtask, Task } from "../data/types";
import { daysUntil, formatDueLabel } from "../lib/dates";
import { minutesLabel } from "../lib/labels";
import { Chip } from "./ui";

export function TaskCard({ task, subtasks }: { task: Task; subtasks: Subtask[] }) {
  const done = subtasks.filter((s) => s.status === "done").length;
  const overdue = task.dueDate ? daysUntil(task.dueDate) < 0 : false;
  const isDone = task.status === "done";

  return (
    <Link
      to={`/task/${task.id}`}
      className={`block rounded-[1rem] border border-line bg-surface p-4 transition-colors hover:border-brand ${
        isDone ? "border-dashed" : ""
      }`}
    >
      <p className={`font-medium ${isDone ? "text-soft line-through decoration-2" : ""}`}>{task.title}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {task.course && <Chip>{task.course}</Chip>}
        {task.dueDate && (
          <Chip tone={overdue && !isDone ? "warn" : "neutral"}>
            {formatDueLabel(task.dueDate)}
          </Chip>
        )}
        <Chip>{minutesLabel(task.estimatedMinutes)}</Chip>
        {subtasks.length > 0 && (
          <Chip tone={done > 0 ? "good" : "neutral"}>
            {done}/{subtasks.length} steps
          </Chip>
        )}
        {task.needsCommunication && (
          <Chip tone="brand">
            <Mail aria-hidden="true" size={13} /> needs update
          </Chip>
        )}
      </div>
    </Link>
  );
}
