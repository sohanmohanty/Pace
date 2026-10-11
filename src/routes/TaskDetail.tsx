import { useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ChevronDown, ChevronUp, Mail, Plus, Sparkles, Trash2 } from "lucide-react";
import { runAIBreakdown } from "../ai/planner";
import { capacityMultiplier } from "../logic/adaptation";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { TaskForm } from "../components/TaskForm";
import { useToast } from "../components/Toast";
import { Button, Card, Chip, PageHeader, SectionTitle } from "../components/ui";
import { db } from "../data/db";
import {
  addSubtask,
  addSubtasks,
  deleteSubtask,
  deleteTask,
  getProfile,
  listReflections,
  moveSubtask,
  setTaskStatus,
  toggleSubtaskDone,
  updateTask,
  type TaskDraft
} from "../data/repo";
import { uid } from "../lib/id";
import { daysUntil, formatDueLabel } from "../lib/dates";
import { minutesLabel } from "../lib/labels";
import { detectTemplate, generateSubtasks, TEMPLATES, type TemplateKey } from "../logic/breakdown";

export function TaskDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newStep, setNewStep] = useState("");
  const [template, setTemplate] = useState<TemplateKey | null>(null);
  const [breaking, setBreaking] = useState(false);
  const [details, setDetails] = useState("");
  const [breakNote, setBreakNote] = useState<string | null>(null);
  const addingStep = useRef(false);
  const aiOn = true;

  const task = useLiveQuery(async () => (id ? ((await db.tasks.get(id)) ?? null) : null), [id]);
  const subtasks = useLiveQuery(
    async () =>
      id ? (await db.subtasks.where("taskId").equals(id).toArray()).sort((a, b) => a.order - b.order) : [],
    [id]
  );

  if (task === undefined || subtasks === undefined) return null;
  if (task === null) {
    return (
      <div className="space-y-4 lg:mx-auto lg:max-w-2xl">
        <PageHeader title="This task isn't here anymore" />
        <Button onClick={() => navigate("/tasks")}>Back to my tasks</Button>
      </div>
    );
  }

  const overdue = task.dueDate ? daysUntil(task.dueDate) < 0 : false;
  const isDone = task.status === "done";
  const selectedTemplate = template ?? detectTemplate(task.title);

  async function saveEdits(draft: TaskDraft) {
    await updateTask(task!.id, draft);
    toast("Saved");
  }

  async function breakDown(useAI: boolean) {
    // Double-click would generate the whole step list twice.
    if (breaking) return;
    setBreaking(true);
    setBreakNote(null);
    try {
      if (useAI) {
        try {
          const [profile, reflections] = await Promise.all([getProfile(), listReflections()]);
          const out = await runAIBreakdown(task!, profile, reflections, capacityMultiplier(reflections), details);
          await addSubtasks(
            out.steps.map((s, i) => ({ ...s, id: uid(), taskId: task!.id, status: "not_started" as const, order: i }))
          );
          if (Math.abs(out.totalMinutes - task!.estimatedMinutes) >= 20) {
            await updateTask(task!.id, { estimatedMinutes: out.totalMinutes });
            setBreakNote(`${out.note} Estimate updated to about ${out.totalMinutes} minutes.`);
          } else {
            setBreakNote(out.note);
          }
          toast("Broken into steps. Edit them freely");
          return;
        } catch {
          toast("The planner was unavailable, so Pace used a template");
        }
      }
      await addSubtasks(generateSubtasks(task!, selectedTemplate));
      toast("Broken into steps. Edit them freely");
    } finally {
      setBreaking(false);
    }
  }

  async function addStep(e: React.FormEvent) {
    e.preventDefault();
    if (addingStep.current || !newStep.trim()) return;
    addingStep.current = true;
    try {
      await addSubtask(task!.id, newStep.trim(), task!.demo);
      setNewStep("");
    } finally {
      addingStep.current = false;
    }
  }

  return (
    <div className="space-y-5 lg:mx-auto lg:max-w-2xl">
      <PageHeader
        title={task.title}
        subtitle={
          <span className="mt-1.5 flex flex-wrap gap-1.5">
            {task.course && <Chip>{task.course}</Chip>}
            {task.dueDate && (
              <Chip tone={overdue && !isDone ? "warn" : "neutral"}>
                {formatDueLabel(task.dueDate)}
              </Chip>
            )}
            <Chip>{minutesLabel(task.estimatedMinutes)}</Chip>
            {isDone && <Chip tone="good">finished</Chip>}
          </span>
        }
      />

      <Card>
        <SectionTitle>Steps</SectionTitle>
        {subtasks.length === 0 ? (
          <div className="mt-3 space-y-3">
            <p className="text-soft">
              Big tasks are easier to start when they're small. Pace can break this one down into
              steps specific to this assignment.
            </p>
            {aiOn && (
              <>
                <label className="block">
                  <span className="font-medium">Paste the assignment, if you have it</span>
                  <span className="mt-0.5 block text-[0.9rem] text-soft">
                    Optional. Only sent when you break it down. Makes the steps much more specific.
                  </span>
                  <textarea
                    className="input"
                    rows={3}
                    value={details}
                    onChange={(e) => setDetails(e.target.value)}
                    placeholder="e.g. the rubric, the prompt, or the email from your teacher"
                  />
                </label>
                <Button size="lg" onClick={() => breakDown(true)} disabled={breaking}>
                  <Sparkles aria-hidden="true" size={18} />
                  {breaking ? "Breaking it down…" : "Break it down"}
                </Button>
                <p className="text-center text-[0.85rem] text-soft">or use a template, no AI</p>
              </>
            )}
            <label className="block">
              <span className="font-medium">Template</span>
              <select
                className="input"
                value={selectedTemplate}
                onChange={(e) => setTemplate(e.target.value as TemplateKey)}
              >
                {Object.entries(TEMPLATES).map(([key, t]) => (
                  <option key={key} value={key}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <Button size="lg" variant={aiOn ? "soft" : "primary"} onClick={() => breakDown(false)} disabled={breaking}>
              {aiOn ? "Use the template" : "Break it down"}
            </Button>
          </div>
        ) : (
          <>
            {breakNote && <p className="mt-2 text-[0.9rem] text-soft">{breakNote}</p>}
            <ul className="mt-3 space-y-1.5">
              {subtasks.map((s, i) => (
                <li
                  key={s.id}
                  className="flex items-center gap-2.5 rounded-xl border border-line bg-surface px-3 py-2"
                >
                  <input
                    type="checkbox"
                    className="checkbox"
                    checked={s.status === "done"}
                    onChange={() => toggleSubtaskDone(s.id)}
                    aria-label={`Mark “${s.title}” ${s.status === "done" ? "not done" : "done"}`}
                  />
                  <span
                    className={`min-w-0 flex-1 ${
                      s.status === "done" ? "line-through decoration-2 opacity-70" : ""
                    }`}
                  >
                    {s.title}
                    <span className="ml-2 text-[0.85rem] text-soft">
                      {minutesLabel(s.estimatedMinutes)}
                    </span>
                    {s.firstAction && s.status !== "done" && (
                      <span className="block text-[0.85rem] text-soft">First: {s.firstAction}</span>
                    )}
                  </span>
                  <span className="flex shrink-0 items-center">
                    <button
                      className="grid h-9 w-9 place-items-center rounded-lg text-soft hover:bg-bg disabled:opacity-30"
                      onClick={() => moveSubtask(s.id, -1)}
                      disabled={i === 0}
                      aria-label={`Move “${s.title}” up`}
                    >
                      <ChevronUp aria-hidden="true" size={18} />
                    </button>
                    <button
                      className="grid h-9 w-9 place-items-center rounded-lg text-soft hover:bg-bg disabled:opacity-30"
                      onClick={() => moveSubtask(s.id, 1)}
                      disabled={i === subtasks.length - 1}
                      aria-label={`Move “${s.title}” down`}
                    >
                      <ChevronDown aria-hidden="true" size={18} />
                    </button>
                    <button
                      className="grid h-9 w-9 place-items-center rounded-lg text-soft hover:bg-danger-soft hover:text-danger"
                      onClick={() => deleteSubtask(s.id)}
                      aria-label={`Delete step “${s.title}”`}
                    >
                      <Trash2 aria-hidden="true" size={17} />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
            <form onSubmit={addStep} className="mt-3 flex gap-2">
              <input
                className="input mt-0 flex-1"
                value={newStep}
                onChange={(e) => setNewStep(e.target.value)}
                placeholder="Add a step"
                aria-label="New step"
              />
              <Button type="submit" variant="soft" disabled={!newStep.trim()}>
                <Plus aria-hidden="true" size={18} />
                Add
              </Button>
            </form>
          </>
        )}
      </Card>

      {task.needsCommunication && (
        <Link
          to={`/message?course=${encodeURIComponent(task.course ?? "")}&about=${encodeURIComponent(task.title)}`}
          className="flex items-center gap-2 rounded-2xl border border-line bg-brand-soft p-4 font-medium text-brand-deep"
        >
          <Mail aria-hidden="true" size={19} />
          Draft a teacher update, no details required
        </Link>
      )}

      <Card>
        <details>
          <summary className="cursor-pointer text-[1.05rem] font-semibold">Edit details</summary>
          <div className="mt-4">
            <TaskForm initial={task} onSubmit={saveEdits} submitLabel="Save changes" />
          </div>
        </details>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button
          variant={isDone ? "ghost" : "soft"}
          onClick={async () => {
            await setTaskStatus(task.id, isDone ? "in_progress" : "done");
            toast(isDone ? "Reopened" : "Task finished. That counts");
          }}
        >
          {isDone ? "Reopen" : "Mark done"}
        </Button>
        <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
          <Trash2 aria-hidden="true" size={17} />
          Delete
        </Button>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this task?"
        body="This removes the task and its steps from this device. There's no undo."
        confirmLabel="Delete"
        onConfirm={async () => {
          await deleteTask(task.id);
          toast("Deleted");
          navigate("/tasks");
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
