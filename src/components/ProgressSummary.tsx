import { Chip } from "./ui";

export function ProgressSummary({
  stepsDone,
  tasksFinished
}: {
  stepsDone: number;
  tasksFinished: number;
}) {
  if (stepsDone === 0 && tasksFinished === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-[0.95rem] text-soft">
      <span className="font-medium text-ink">This week:</span>
      <Chip tone="good">
        {stepsDone} step{stepsDone === 1 ? "" : "s"} done
      </Chip>
      {tasksFinished > 0 && (
        <Chip tone="good">
          {tasksFinished} task{tasksFinished === 1 ? "" : "s"} finished
        </Chip>
      )}
    </div>
  );
}
