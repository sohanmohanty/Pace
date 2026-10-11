import { useEffect, useState } from "react";
import { Play } from "lucide-react";
import { motion } from "motion/react";
import type { PlanAction } from "../data/types";
import { TASK_HUES, colorIndexFor } from "../logic/dayline";
import { minutesLabel, REASON_LABELS, REASON_TONES } from "../lib/labels";
import { stopColor } from "./DayLine";
import { Chip } from "./ui";

/**
 * A planned step whose left rail matches its Day Line stop. "Why now" uses
 * a disclosure so it works on touch screens and with screen readers.
 */
export function StepCard({
  action,
  taskTitle,
  taskOrder,
  onToggle,
  onStart,
  selected = false,
  readOnly = false,
  minutesSpent,
  id
}: {
  action: PlanAction;
  taskTitle?: string;
  taskOrder: string[];
  onToggle?: (id: string) => void;
  onStart?: (id: string) => void;
  selected?: boolean;
  readOnly?: boolean;
  minutesSpent?: number;
  id?: string;
}) {
  const hue = TASK_HUES[colorIndexFor(action.taskId, taskOrder)];
  // Update the checkbox immediately, then reconcile with the live query.
  // Otherwise the controlled input can snap back for a frame.
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  useEffect(() => setOptimistic(null), [action.completed]);
  const checked = optimistic ?? action.completed;
  return (
    <motion.div
      id={id}
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className={`card relative flex gap-3 p-4 pl-5 transition-[border-color,box-shadow] ${
        selected ? "border-line-strong shadow-md" : ""
      } ${action.completed ? "border-dashed" : ""}`}
    >
      <span
        aria-hidden="true"
        className="absolute bottom-3 left-0 top-3 w-1 rounded-r-full"
        style={{ background: stopColor(hue, true) }}
      />
      {!readOnly && (
        <input
          type="checkbox"
          className="checkbox mt-0.5"
          checked={checked}
          onChange={() => {
            setOptimistic(!checked);
            onToggle?.(action.id);
          }}
          aria-label={`Mark “${action.title}” ${checked ? "not done" : "done"}`}
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {taskTitle && taskTitle !== action.title && (
              <p className="truncate text-[0.8rem] font-medium text-soft">{taskTitle}</p>
            )}
            <p
              className={`font-medium leading-snug ${
                action.completed ? "text-soft line-through decoration-2" : ""
              }`}
            >
              {action.title}
            </p>
          </div>
          {!readOnly && onStart && !action.completed && (
            <button
              type="button"
              onClick={() => onStart(action.id)}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-tint text-tint-ink transition hover:brightness-95 active:scale-95"
              aria-label={`Start “${action.title}”`}
            >
              <Play aria-hidden="true" size={17} className="translate-x-px" fill="currentColor" />
            </button>
          )}
        </div>
        {action.firstAction && !action.completed && (
          <p className="mt-1 text-[0.92rem] text-soft">
            <span className="font-medium text-ink">First: </span>
            {action.firstAction}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Chip>
            {minutesLabel(action.estimatedMinutes)}
            {minutesSpent ? ` · ${minutesSpent} spent` : ""}
          </Chip>
          <Chip tone={REASON_TONES[action.reason]}>{REASON_LABELS[action.reason]}</Chip>
          {action.window && <Chip className="capitalize">{action.window}</Chip>}
        </div>
        {action.why && (
          <details className="mt-1.5">
            <summary className="cursor-pointer text-[0.9rem] font-medium text-brand-deep">
              Why now?
            </summary>
            <p className="mt-1 text-[0.9rem] text-soft">{action.why}</p>
          </details>
        )}
      </div>
    </motion.div>
  );
}
