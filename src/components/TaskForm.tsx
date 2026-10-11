import { useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../data/db";
import type { Level, Task } from "../data/types";
import type { TaskDraft } from "../data/repo";
import { Button, ChipRadios, Field } from "./ui";

const LEVELS: { value: Level; label: string }[] = [
  { value: 1, label: "1 · light" },
  { value: 2, label: "2" },
  { value: 3, label: "3" },
  { value: 4, label: "4" },
  { value: 5, label: "5 · heavy" }
];

const EFFORT_CHIPS = [15, 30, 45, 60, 90, 120];

export function TaskForm({
  initial,
  onSubmit,
  submitLabel = "Save task"
}: {
  initial?: Task;
  onSubmit: (draft: TaskDraft) => void | Promise<void>;
  submitLabel?: string;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [course, setCourse] = useState(initial?.course ?? "");
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? "");
  const [minutes, setMinutes] = useState(initial?.estimatedMinutes ?? 30);
  const [difficulty, setDifficulty] = useState<Level>(initial?.difficulty ?? 3);
  const [importance, setImportance] = useState<Level>(initial?.importance ?? 3);
  const [needsComm, setNeedsComm] = useState(initial?.needsCommunication ?? false);
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const courses = useLiveQuery(async () => {
    const tasks = await db.tasks.toArray();
    return [...new Set(tasks.map((t) => t.course).filter(Boolean))] as string[];
  }, []);

  // Guards against double-submits (double-click or a held Enter key) creating
  // duplicate tasks before navigation happens.
  const inFlight = useRef(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (inFlight.current || !title.trim()) return;
    inFlight.current = true;
    try {
      await doSubmit();
    } finally {
      inFlight.current = false;
    }
  }

  async function doSubmit() {
    await onSubmit({
      title: title.trim(),
      course: course.trim() || undefined,
      dueDate: dueDate || undefined,
      estimatedMinutes: Math.max(5, Math.round(minutes)),
      difficulty,
      importance,
      needsCommunication: needsComm,
      notes: notes.trim() || undefined
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <Field label="What is it?">
        <input
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Biology lab report"
          required
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Class" hint="optional" className="min-w-0">
          <input
            className="input"
            value={course}
            onChange={(e) => setCourse(e.target.value)}
            list="course-options"
            placeholder="Biology"
          />
          <datalist id="course-options">
            {(courses ?? []).map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="Due date" hint="optional" className="min-w-0">
          <input
            className="input"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </Field>
      </div>

      <div>
        <Field label="How long might it take?" hint="A rough guess is fine.">
          <div className="mt-1.5 flex items-center gap-2">
            <input
              className="input mt-0 w-24"
              type="number"
              min={5}
              step={5}
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
              aria-label="Estimated minutes"
            />
            <span className="text-soft">min</span>
          </div>
        </Field>
        <div className="mt-2 flex flex-wrap gap-1.5" aria-hidden="true">
          {EFFORT_CHIPS.map((m) => (
            <button
              key={m}
              type="button"
              tabIndex={-1}
              onClick={() => setMinutes(m)}
              className={`rounded-full border-[1.5px] px-3 py-1 text-[0.85rem] font-medium ${
                minutes === m ? "border-brand bg-brand-soft text-brand-deep" : "border-line text-soft"
              }`}
            >
              {m >= 60 ? `${m / 60}h` : `${m}m`}
            </button>
          ))}
        </div>
      </div>

      <ChipRadios
        legend="How hard does it feel?"
        name="difficulty"
        options={LEVELS}
        value={difficulty}
        onChange={setDifficulty}
      />

      <ChipRadios
        legend="How much does it matter?"
        name="importance"
        options={LEVELS}
        value={importance}
        onChange={setImportance}
      />

      <label className="flex items-center justify-between gap-4">
        <span>
          <span className="font-medium">Needs a teacher update</span>
          <span className="block text-[0.9rem] text-soft">
            Pace will suggest sending a short message first.
          </span>
        </span>
        <input
          type="checkbox"
          className="toggle"
          checked={needsComm}
          onChange={(e) => setNeedsComm(e.target.checked)}
        />
      </label>

      <Field label="Notes" hint="optional">
        <textarea
          className="input"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </Field>

      <Button type="submit" size="lg">
        {submitLabel}
      </Button>
    </form>
  );
}
