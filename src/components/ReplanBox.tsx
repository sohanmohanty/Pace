import { useRef, useState } from "react";
import { ArrowUp, RefreshCw } from "lucide-react";

/** Replan from an instruction such as "Nothing with reading tonight, 40 minutes." Validate the result. */
export function ReplanBox({
  onReplan,
  busy,
  disabled = false
}: {
  onReplan: (instruction: string) => void | Promise<void>;
  busy: boolean;
  disabled?: boolean;
}) {
  const [text, setText] = useState("");
  const inFlight = useRef(false);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (inFlight.current || busy) return;
    inFlight.current = true;
    try {
      await onReplan(text.trim());
      setText("");
    } finally {
      inFlight.current = false;
    }
  }

  return (
    <form onSubmit={submit} className="card p-3">
      <label className="block">
        <span className="px-1 text-[0.85rem] font-medium text-soft">Change something, in your own words</span>
        <div className="mt-1.5 flex items-center gap-2">
          <input
            className="input mt-0 flex-1"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={busy ? "Replanning…" : "e.g. nothing with reading tonight, I have 40 minutes"}
            disabled={busy || disabled}
            autoComplete="off"
          />
          <button
            type="submit"
            disabled={busy || disabled}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-[0.875rem] bg-brand text-on-brand transition hover:bg-brand-deep disabled:opacity-50"
            aria-label={text.trim() ? "Replan with this change" : "Replan the rest of today"}
          >
            {busy ? (
              <RefreshCw aria-hidden="true" size={18} className="animate-spin" />
            ) : text.trim() ? (
              <ArrowUp aria-hidden="true" size={18} />
            ) : (
              <RefreshCw aria-hidden="true" size={18} />
            )}
          </button>
        </div>
      </label>
    </form>
  );
}
