import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate } from "react-router-dom";
import { Feather, Sparkles } from "lucide-react";
import { CapacityPicker } from "../components/CapacityPicker";
import { EmptyState } from "../components/EmptyState";
import { PlanActionCard } from "../components/PlanActionCard";
import { useToast } from "../components/Toast";
import { Button, Card, Chip, ChipRadios, PageHeader } from "../components/ui";
import { db } from "../data/db";
import {
  getTodayCheckIn,
  listReflections,
  saveCheckIn,
  savePlanForToday
} from "../data/repo";
import type { CapacityLevel } from "../data/types";
import { minutesLabel } from "../lib/labels";
import { capacityMultiplier, multiplierLabel } from "../logic/adaptation";
import { generatePlan, totalPlanMinutes } from "../logic/scheduler";

const TIME_OPTIONS = [
  { value: 0, label: "No limit" },
  { value: 15, label: "15m" },
  { value: 30, label: "30m" },
  { value: 60, label: "1h" },
  { value: 90, label: "1.5h" },
  { value: 120, label: "2h" }
];

export function PlanBuilder() {
  const navigate = useNavigate();
  const toast = useToast();

  const allTasks = useLiveQuery(() => db.tasks.toArray(), []);
  const subtasks = useLiveQuery(() => db.subtasks.toArray(), []);
  const checkIn = useLiveQuery(async () => (await getTodayCheckIn()) ?? null, []);
  const reflections = useLiveQuery(() => listReflections(), []);

  const [capacity, setCapacity] = useState<CapacityLevel | null>(null);
  const [available, setAvailable] = useState<number>(0);
  const [shrink, setShrink] = useState(false);
  const seededFromCheckIn = useRef(false);

  useEffect(() => {
    if (checkIn && !seededFromCheckIn.current) {
      seededFromCheckIn.current = true;
      setCapacity((c) => c ?? checkIn.capacity);
      if (checkIn.availableMinutes) setAvailable(checkIn.availableMinutes);
    }
  }, [checkIn]);

  const multiplier = capacityMultiplier(reflections ?? []);
  const mLabel = multiplierLabel(multiplier);

  const activeTasks = useMemo(
    () => (allTasks ?? []).filter((t) => !t.archived),
    [allTasks]
  );
  const openCount = activeTasks.filter((t) => t.status !== "done").length;

  const preview = useMemo(() => {
    if (!capacity || allTasks === undefined || subtasks === undefined) return null;
    return generatePlan({
      tasks: activeTasks,
      subtasks,
      capacity,
      multiplier,
      availableMinutes: available || undefined,
      shrink
    });
  }, [capacity, activeTasks, subtasks, multiplier, available, shrink, allTasks]);

  if (allTasks === undefined || subtasks === undefined || checkIn === undefined) return null;

  async function pickCapacity(c: CapacityLevel) {
    setCapacity(c);
    await saveCheckIn(c, available || undefined);
  }

  async function usePlan() {
    if (!preview) return;
    await savePlanForToday(preview);
    toast("Plan ready — one step at a time");
    navigate("/");
  }

  if (openCount === 0) {
    return (
      <div className="space-y-5 lg:mx-auto lg:max-w-xl">
        <PageHeader title="Today's plan" />
        <EmptyState
          title="Nothing to plan yet"
          body="Add what's on your plate first — one line per thing is enough."
        >
          <Button size="lg" onClick={() => navigate("/tasks")}>
            Go to my tasks
          </Button>
        </EmptyState>
      </div>
    );
  }

  const planned = preview ? totalPlanMinutes(preview.actions) : 0;

  return (
    <div className="space-y-5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-6 lg:space-y-0">
      <div className="lg:col-span-2">
        <PageHeader
          title="Today's plan"
          subtitle="Built from your tasks and your capacity — nothing else."
        />
      </div>

      <div className="min-w-0 space-y-5">
        <Card>
          <CapacityPicker value={capacity ?? undefined} onChange={pickCapacity} />
        </Card>

        <Card>
          <ChipRadios
            legend="How much time do you actually have?"
            hint="Optional — caps the plan."
            name="available"
            options={TIME_OPTIONS}
            value={available}
            onChange={setAvailable}
          />
        </Card>
      </div>

      <div className="min-w-0 space-y-5">
      {preview && (
        <section aria-label="Plan preview" className="space-y-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip tone="brand">
              up to {minutesLabel(preview.budgetMinutes)}
            </Chip>
            {mLabel && (
              <Chip tone="brand" className="border border-brand-soft">
                adjusted {mLabel} from your reflections
              </Chip>
            )}
            {shrink && <Chip tone="good">smaller version</Chip>}
          </div>

          <div aria-live="polite" className="text-[0.9rem] text-soft">
            {preview.actions.length} step{preview.actions.length === 1 ? "" : "s"} ·{" "}
            {minutesLabel(planned)} planned
          </div>

          <div className="space-y-2">
            {preview.actions.map((a) => (
              <PlanActionCard key={a.id} action={a} readOnly />
            ))}
          </div>

          {preview.actions.length === 0 && (
            <p className="text-soft">
              Nothing fits this capacity right now — try "No limit" on time, or the smaller
              version below.
            </p>
          )}

          <div className="space-y-2">
            <Button size="lg" onClick={usePlan} disabled={preview.actions.length === 0}>
              <Sparkles aria-hidden="true" size={19} />
              Use this plan
            </Button>
            <Button variant="soft" size="lg" onClick={() => setShrink((s) => !s)}>
              <Feather aria-hidden="true" size={18} />
              {shrink ? "Back to full size" : "Make it smaller"}
            </Button>
          </div>
          <p className="text-[0.9rem] text-soft">
            Anything not in the plan stays safely in your task list. Finish early? You can always
            generate more.
          </p>
        </section>
      )}

      {!capacity && (
        <p className="text-center text-soft">Pick how today feels and the plan appears here.</p>
      )}
      </div>
    </div>
  );
}
