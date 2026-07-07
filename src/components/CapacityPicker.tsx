import type { CapacityLevel } from "../data/types";
import { CAPACITY_LABELS } from "../lib/labels";

const ORDER: CapacityLevel[] = ["low", "medium", "high", "unsure"];

export function CapacityPicker({
  value,
  onChange,
  legend = "What kind of day is this?"
}: {
  value?: CapacityLevel;
  onChange: (c: CapacityLevel) => void;
  legend?: string;
}) {
  return (
    <fieldset>
      <legend className="text-[1.15rem] font-semibold tracking-tight">{legend}</legend>
      <p className="mt-0.5 text-[0.9rem] text-soft">
        There's no wrong answer — the plan adjusts to you.
      </p>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {ORDER.map((c) => {
          const checked = value === c;
          const { title, hint } = CAPACITY_LABELS[c];
          return (
            <label key={c} className="cursor-pointer">
              <input
                type="radio"
                name="capacity"
                className="peer visually-hidden"
                checked={checked}
                onChange={() => onChange(c)}
              />
              <span
                className={`block rounded-2xl border-[1.5px] p-4 transition-colors peer-focus-visible:outline peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink ${
                  checked
                    ? "border-brand bg-brand-soft"
                    : "border-line bg-surface hover:bg-bg"
                }`}
              >
                <span className={`block font-semibold ${checked ? "text-brand-deep" : ""}`}>
                  {title}
                </span>
                <span className="block text-[0.9rem] text-soft">{hint}</span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
