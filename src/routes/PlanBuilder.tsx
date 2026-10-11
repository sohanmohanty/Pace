import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Feather } from "lucide-react";
import { CheckInPanel } from "../components/CheckInPanel";
import { EmptyState } from "../components/EmptyState";
import { StepCard } from "../components/StepCard";
import { useToast } from "../components/Toast";
import { Button, Chip, PageHeader, SectionTitle } from "../components/ui";
import { getTodayCheckIn, saveCheckIn } from "../data/repo";
import { minutesLabel } from "../lib/labels";
import {
  buildLocalPlan,
  draftFromCheckIn,
  taskOrderFor,
  usePlannerData,
  type DraftCheckIn
} from "../lib/usePlanner";
import { multiplierLabel } from "../logic/adaptation";
import { useAIPlan } from "../lib/useAIPlan";

/** Adjust today's plan: the same dial and line as the first check-in, plus the preview list. */
export function PlanBuilder() {
  const navigate = useNavigate();
  const toast = useToast();
  const data = usePlannerData();
  const [draft, setDraft] = useState<DraftCheckIn | null>(null);
  const [shrink, setShrink] = useState(false);
  const [busy, setBusy] = useState(false);
  const aiPlan = useAIPlan();

  useEffect(() => {
    if (data.ready && draft === null) setDraft(draftFromCheckIn(data.checkIn));
  }, [data.ready, data.checkIn, draft]);

  const preview = useMemo(
    () =>
      draft ? buildLocalPlan(draft, data.activeTasks, data.subtasks, data.multiplier, shrink) : null,
    [draft, data.activeTasks, data.subtasks, data.multiplier, shrink]
  );
  const taskOrder = useMemo(() => taskOrderFor(data.activeTasks), [data.activeTasks]);

  if (!data.ready || draft === null || preview === null) return null;

  const mLabel = multiplierLabel(data.multiplier);

  if (data.openTasks.length === 0) {
    return (
      <div className="space-y-5 lg:mx-auto lg:max-w-xl">
        <PageHeader title="Today's plan" />
        <EmptyState title="Nothing to plan yet" body="Add your tasks first. One line per task is enough.">
          <Button size="lg" onClick={() => navigate("/tasks")}>
            Go to my tasks
          </Button>
        </EmptyState>
      </div>
    );
  }

  async function usePlan() {
    if (!draft || busy) return;
    setBusy(true);
    try {
      await saveCheckIn({
        dial: Math.round(draft.dial),
        capacity: draft.unsure ? "unsure" : undefined,
        windows: draft.windows,
        heavy: draft.heavy,
        availableMinutes: draft.availableMinutes || undefined
      });
      const saved = await getTodayCheckIn();
      void aiPlan.run(preview!, {
        tasks: data.activeTasks,
        subtasks: data.subtasks,
        checkIn: saved!,
        reflections: data.reflections,
        multiplier: data.multiplier,
        currentPlan: data.plan,
        mode: "plan"
      });
      toast("Plan updated. Completed steps kept");
      navigate("/");
    } finally {
      setBusy(false);
    }
  }

  const planned = preview.actions.reduce((s, a) => s + a.estimatedMinutes, 0);

  return (
    <div className="space-y-6 lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-start lg:gap-x-8 lg:space-y-0">
      <div className="lg:col-span-2">
        <PageHeader
          title="Shape today"
          subtitle="Built from your tasks and how today feels, nothing else. Completed steps are always kept."
        />
      </div>

      <div className="min-w-0">
        <CheckInPanel
          draft={draft}
          onDraft={setDraft}
          tasks={data.activeTasks}
          subtasks={data.subtasks}
          multiplier={data.multiplier}
          onUse={usePlan}
          useLabel={shrink ? "Use the smaller plan" : "Use this plan"}
          busy={busy}
          compact
        />
      </div>

      <section aria-label="Plan preview" className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <SectionTitle className="mr-auto">Preview</SectionTitle>
          <Chip tone="brand">up to {minutesLabel(preview.budgetMinutes)}</Chip>
          {mLabel && <Chip tone="brand">adjusted {mLabel} from your reflections</Chip>}
          {shrink && <Chip tone="good">smaller version</Chip>}
        </div>
        <p aria-live="polite" className="text-[0.9rem] text-soft">
          {preview.actions.length} step{preview.actions.length === 1 ? "" : "s"} · {minutesLabel(planned)} planned
        </p>
        <div className="space-y-2">
          {preview.actions.map((a) => (
            <StepCard
              key={a.id}
              action={a}
              taskTitle={data.taskById.get(a.taskId)?.title}
              taskOrder={taskOrder}
              readOnly
            />
          ))}
        </div>
        {preview.actions.length === 0 && (
          <p className="text-soft">Nothing fits this capacity right now. Try a little more, or the smaller version.</p>
        )}
        <Button variant="soft" size="lg" onClick={() => setShrink((s) => !s)}>
          <Feather aria-hidden="true" size={18} />
          {shrink ? "Back to full size" : "Make it smaller"}
        </Button>
      </section>
    </div>
  );
}
