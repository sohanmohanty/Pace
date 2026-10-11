import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DayLine } from "../components/DayLine";
import { useToast } from "../components/Toast";
import { Button, Card, ChipRadios, Field, PageHeader } from "../components/ui";
import { addReflection } from "../data/repo";
import type { Reflection as ReflectionType } from "../data/types";
import { todayISO } from "../lib/dates";
import { minutesLabel } from "../lib/labels";
import { taskOrderFor, usePlannerData } from "../lib/usePlanner";

export function Reflection() {
  const navigate = useNavigate();
  const toast = useToast();
  const data = usePlannerData();

  const [planFelt, setPlanFelt] = useState<ReflectionType["planFelt"]>("right");
  const [pref, setPref] = useState<ReflectionType["nextPlanPreference"]>("same");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const taskOrder = useMemo(() => taskOrderFor(data.activeTasks), [data.activeTasks]);

  if (!data.ready) return null;
  const plan = data.plan;

  const done = plan?.actions.filter((a) => a.completed) ?? [];
  const doneMinutes = done.reduce((s, a) => s + a.estimatedMinutes, 0);

  async function save() {
    if (saving) return;
    setSaving(true);
    await addReflection({
      date: todayISO(),
      planId: plan?.id,
      completedActionIds: done.map((a) => a.id),
      planFelt,
      nextPlanPreference: pref,
      note: note.trim() || undefined
    });
    toast("Saved. Tomorrow's plan will adapt");
    navigate("/");
  }

  return (
    <div className="space-y-5 lg:mx-auto lg:max-w-2xl">
      <PageHeader
        title="Wrap up"
        subtitle={
          done.length > 0
            ? `${done.length} step${done.length === 1 ? "" : "s"}, about ${minutesLabel(doneMinutes)} of real work. That counts.`
            : "Showing up counts too. Tomorrow can start smaller."
        }
      />

      {plan && (
        <div className="card card-tint px-2 pb-2 pt-2">
          <DayLine
            actions={plan.actions}
            budgetMinutes={plan.budgetMinutes}
            windows={data.checkIn?.windows}
            taskOrder={taskOrder}
            size="compact"
            showSpare={false}
          />
        </div>
      )}

      <Card className="space-y-5">
        <ChipRadios
          legend="How did today's plan feel?"
          name="felt"
          options={[
            { value: "too_light" as const, label: "Too light" },
            { value: "right" as const, label: "About right" },
            { value: "too_heavy" as const, label: "Too heavy" }
          ]}
          value={planFelt}
          onChange={setPlanFelt}
        />

        <ChipRadios
          legend="Tomorrow's plan should be…"
          name="pref"
          options={[
            { value: "lighter" as const, label: "Lighter" },
            { value: "same" as const, label: "Similar" },
            { value: "heavier" as const, label: "Heavier" }
          ]}
          value={pref}
          onChange={setPref}
        />

        <Field label="Anything worth remembering?" hint="Optional: what helped you start?">
          <textarea className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>

        <Button size="lg" onClick={save} disabled={saving}>
          Save and close the day
        </Button>
      </Card>
    </div>
  );
}
