import { ChevronDown } from "lucide-react";
import { DAY_WINDOWS, WORK_TYPES, type DayWindow, type WorkType } from "../data/types";
import { WINDOW_LABELS, WORK_TYPE_LABELS } from "../logic/capacity";
import { ChipChecks, ChipRadios } from "./ui";

const TIME_OPTIONS = [
  { value: 0, label: "No cap" },
  { value: 20, label: "20m" },
  { value: 30, label: "30m" },
  { value: 45, label: "45m" },
  { value: 60, label: "1h" },
  { value: 90, label: "1.5h" },
  { value: 120, label: "2h" }
];

/**
 * Optional windows, heavy work types, and a hard time cap. Collapsed by
 * default to keep check-in short; each choice takes one tap when expanded.
 */
export function DayDetails({
  windows,
  heavy,
  availableMinutes,
  onChange,
  defaultOpen = false
}: {
  windows: DayWindow[];
  heavy: WorkType[];
  availableMinutes: number;
  onChange: (patch: {
    windows?: DayWindow[];
    heavy?: WorkType[];
    availableMinutes?: number;
  }) => void;
  defaultOpen?: boolean;
}) {
  const summary: string[] = [];
  if (windows.length > 0 && windows.length < 3)
    summary.push(windows.map((w) => WINDOW_LABELS[w].title.toLowerCase()).join(" + "));
  if (heavy.length > 0) summary.push(`${heavy.length} thing${heavy.length === 1 ? "" : "s"} feel heavy`);
  if (availableMinutes > 0) summary.push(`${availableMinutes} min cap`);

  return (
    <details className="group" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-[0.75rem] py-2 text-[0.95rem] font-medium text-brand-deep [&::-webkit-details-marker]:hidden">
        <span>
          More about today
          {summary.length > 0 && (
            <span className="ml-2 font-normal text-soft">{summary.join(" · ")}</span>
          )}
        </span>
        <ChevronDown
          aria-hidden="true"
          size={18}
          className="shrink-0 transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="space-y-5 pb-1 pt-2">
        <ChipChecks
          legend="When do you actually have time?"
          hint="Leave all off for 'whenever'."
          options={DAY_WINDOWS.map((w) => ({
            value: w,
            label: `${WINDOW_LABELS[w].title}`
          }))}
          value={windows}
          onChange={(v) => onChange({ windows: v })}
        />
        <ChipChecks
          legend="What feels heavy today?"
          hint="Pace steers around these. It never bans them."
          options={WORK_TYPES.map((t) => ({ value: t, label: WORK_TYPE_LABELS[t] }))}
          value={heavy}
          onChange={(v) => onChange({ heavy: v })}
        />
        <ChipRadios
          legend="Hard time cap"
          hint="Optional. The plan never goes past this."
          name="available"
          size="sm"
          options={TIME_OPTIONS}
          value={availableMinutes}
          onChange={(v) => onChange({ availableMinutes: v })}
        />
      </div>
    </details>
  );
}
