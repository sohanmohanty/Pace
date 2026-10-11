import { useEffect, useMemo } from "react";
import { HelpCircle, Sparkles } from "lucide-react";
import type { Subtask, Task } from "../data/types";
import { DIAL_FOR, smoothBudgetForDial, tintHueForDial } from "../logic/capacity";
import { buildLocalPlan, taskOrderFor, type DraftCheckIn } from "../lib/usePlanner";
import { minutesLabel } from "../lib/labels";
import { CapacityDial } from "./CapacityDial";
import { DayDetails } from "./DayDetails";
import { DayLine } from "./DayLine";
import { Button } from "./ui";

/**
 * Shared check-in for Today, Adjust, and the landing demo. Each dial change
 * rebuilds the local plan and updates the Day Line.
 */
export function CheckInPanel({
  draft,
  onDraft,
  tasks,
  subtasks,
  multiplier,
  onUse,
  useLabel = "Make today's plan",
  busy = false,
  compact = false
}: {
  draft: DraftCheckIn;
  onDraft: (d: DraftCheckIn) => void;
  tasks: Task[];
  subtasks: Subtask[];
  multiplier: number;
  onUse: () => void;
  useLabel?: string;
  busy?: boolean;
  compact?: boolean;
}) {
  // Move the thumb in quarter steps, but rebuild the plan only at whole values.
  // This limits a full drag to about a hundred planner runs.
  const planDial = Math.round(draft.dial);
  const planDraft = useMemo(
    () => ({ ...draft, dial: planDial }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [planDial, draft.unsure, draft.windows, draft.heavy, draft.availableMinutes]
  );
  const preview = useMemo(
    () => buildLocalPlan(planDraft, tasks, subtasks, multiplier),
    [planDraft, tasks, subtasks, multiplier]
  );
  const taskOrder = useMemo(() => taskOrderFor(tasks), [tasks]);
  const planned = preview.actions.reduce((s, a) => s + a.estimatedMinutes, 0);
  // Use the unrounded curve for the horizon so it follows the thumb smoothly.
  // The plan still uses whole dial values.
  const displayBudget = Math.max(
    planned,
    preview.budgetMinutes * (smoothBudgetForDial(draft.dial) / Math.max(1, smoothBudgetForDial(planDial)))
  );

  // Update the capacity tint while the dial moves.
  useEffect(() => {
    document.documentElement.style.setProperty("--cap-h", String(Math.round(tintHueForDial(planDial))));
  }, [planDial]);

  return (
    <div className="space-y-4">
      <div className="card card-tint px-2 pb-2 pt-3 sm:px-3">
        <DayLine
          actions={preview.actions}
          budgetMinutes={displayBudget}
          windows={draft.windows.length > 0 ? draft.windows : undefined}
          taskOrder={taskOrder}
          size={compact ? "compact" : "large"}
          label={`Preview: ${preview.actions.length} steps, ${minutesLabel(planned)} of ${minutesLabel(preview.budgetMinutes)}.`}
        />
        <p aria-live="polite" className="tabular px-3 pb-1 text-center text-[0.9rem] text-soft">
          {preview.actions.length === 0 ? (
            "Nothing fits yet. Try a little more capacity, or add a task."
          ) : (
            <>
              <span className="font-semibold text-ink">{preview.actions.length}</span> step
              {preview.actions.length === 1 ? "" : "s"} ·{" "}
              <span className="font-semibold text-ink">{minutesLabel(planned)}</span> of{" "}
              {minutesLabel(preview.budgetMinutes)}
              {draft.unsure && " · gentle start"}
            </>
          )}
        </p>
      </div>

      <div className="card space-y-4 p-5">
        <CapacityDial
          value={draft.dial}
          onChange={(dial) => onDraft({ ...draft, dial, unsure: false })}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onDraft({ ...draft, dial: DIAL_FOR.unsure, unsure: !draft.unsure })}
            aria-pressed={draft.unsure}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border-[1.5px] px-3 text-[0.9rem] font-medium transition-colors ${
              draft.unsure
                ? "border-brand bg-brand text-on-brand"
                : "border-line bg-surface text-soft hover:border-line-strong hover:text-ink"
            }`}
          >
            <HelpCircle aria-hidden="true" size={15} />
            Not sure, start me gently
          </button>
        </div>
        <DayDetails
          windows={draft.windows}
          heavy={draft.heavy}
          availableMinutes={draft.availableMinutes}
          onChange={(patch) => onDraft({ ...draft, ...patch })}
        />
        <Button size="lg" onClick={onUse} disabled={busy || preview.actions.length === 0}>
          <Sparkles aria-hidden="true" size={19} />
          {useLabel}
        </Button>
      </div>
    </div>
  );
}
