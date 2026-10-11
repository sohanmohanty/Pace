import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { addTask } from "../data/repo";
import { todayISO } from "../lib/dates";
import { parseQuickAdd } from "../logic/quickadd";
import { useToast } from "./Toast";
import { Button, Chip } from "./ui";

export function QuickAdd() {
  const [text, setText] = useState("");
  const [lastAdded, setLastAdded] = useState<{ id: string; title: string } | null>(null);
  const toast = useToast();

  const parsed = useMemo(
    () => (text.trim() ? parseQuickAdd(text, todayISO()) : null),
    [text]
  );

  // A held-down Enter key auto-repeats form submits; without a guard that
  // creates the same task several times.
  const inFlight = useRef(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (inFlight.current || !parsed || !parsed.title) return;
    inFlight.current = true;
    try {
      const id = await addTask({
        title: parsed.title,
        course: parsed.course,
        dueDate: parsed.dueDate,
        estimatedMinutes: parsed.estimatedMinutes ?? 30,
        difficulty: parsed.difficulty ?? 3,
        importance: parsed.importance ?? 3,
        needsCommunication: parsed.needsCommunication ?? false
      });
      setLastAdded({ id, title: parsed.title });
      setText("");
      toast("Added to your tasks");
    } finally {
      inFlight.current = false;
    }
  }

  return (
    <form onSubmit={submit}>
      <label className="block">
        <span className="font-medium">Quick add</span>
        <span className="mt-0.5 block text-[0.9rem] text-soft">One line is enough.</span>
        <input
          className="input mt-2 min-h-12"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What do you need to do?"
          autoComplete="off"
        />
      </label>
      <Button type="submit" aria-label="Add this task" className="mt-2 w-full" disabled={!parsed?.title}>
        Add
      </Button>
      <div aria-live="polite">
        {parsed && parsed.recognized.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {parsed.recognized.map((r) => (
              <Chip key={r} tone="brand">
                {r}
              </Chip>
            ))}
          </div>
        )}
        {lastAdded && !text && (
          <p className="mt-2 text-[0.9rem] text-soft">
            Added “{lastAdded.title}”.{" "}
            <Link className="font-medium text-brand-deep underline" to={`/task/${lastAdded.id}`}>
              Edit details
            </Link>
          </p>
        )}
      </div>
    </form>
  );
}
