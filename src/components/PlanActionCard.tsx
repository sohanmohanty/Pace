import type { PlanAction } from "../data/types";
import { minutesLabel, REASON_LABELS, REASON_TONES } from "../lib/labels";
import { Chip } from "./ui";

export function PlanActionCard({
  action,
  onToggle,
  readOnly = false
}: {
  action: PlanAction;
  onToggle?: (id: string) => void;
  readOnly?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border border-line bg-surface p-4 transition-colors ${
        action.completed ? "opacity-70" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        {!readOnly && (
          <input
            type="checkbox"
            className="checkbox mt-0.5"
            checked={action.completed}
            onChange={() => onToggle?.(action.id)}
            aria-label={`Mark “${action.title}” ${action.completed ? "not done" : "done"}`}
          />
        )}
        <div className="min-w-0 flex-1">
          <p className={`font-medium ${action.completed ? "line-through decoration-2" : ""}`}>
            {action.title}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Chip>{minutesLabel(action.estimatedMinutes)}</Chip>
            <Chip tone={REASON_TONES[action.reason]}>{REASON_LABELS[action.reason]}</Chip>
          </div>
          {action.why && (
            <details className="mt-1.5">
              <summary className="cursor-pointer text-[0.9rem] font-medium text-brand-deep">
                Why this?
              </summary>
              <p className="mt-1 text-[0.9rem] text-soft">{action.why}</p>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
