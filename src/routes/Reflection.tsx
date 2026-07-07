import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate } from "react-router-dom";
import { useToast } from "../components/Toast";
import { Button, Card, ChipRadios, Field, PageHeader } from "../components/ui";
import { addReflection, getTodayPlan } from "../data/repo";
import type { Reflection as ReflectionType } from "../data/types";
import { todayISO } from "../lib/dates";

export function Reflection() {
  const navigate = useNavigate();
  const toast = useToast();
  const plan = useLiveQuery(async () => (await getTodayPlan()) ?? null, []);

  const [planFelt, setPlanFelt] = useState<ReflectionType["planFelt"]>("right");
  const [pref, setPref] = useState<ReflectionType["nextPlanPreference"]>("same");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  if (plan === undefined) return null;

  const doneCount = plan?.actions.filter((a) => a.completed).length ?? 0;

  async function save() {
    // A double-click would store two reflections and double-apply the
    // adaptation multiplier.
    if (saving) return;
    setSaving(true);
    await addReflection({
      date: todayISO(),
      planId: plan?.id,
      completedActionIds: plan?.actions.filter((a) => a.completed).map((a) => a.id) ?? [],
      planFelt,
      nextPlanPreference: pref,
      note: note.trim() || undefined
    });
    toast("Saved — tomorrow's plan will adapt");
    navigate("/");
  }

  return (
    <div className="space-y-5 lg:mx-auto lg:max-w-2xl">
      <PageHeader
        title="Wrap up"
        subtitle={
          doneCount > 0
            ? `You completed ${doneCount} step${doneCount === 1 ? "" : "s"} today. Steps count.`
            : "Showing up counts too. Tomorrow can start smaller."
        }
      />

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
          hint="This actually changes tomorrow's plan size."
          name="pref"
          options={[
            { value: "lighter" as const, label: "Lighter" },
            { value: "same" as const, label: "Similar" },
            { value: "heavier" as const, label: "Heavier" }
          ]}
          value={pref}
          onChange={setPref}
        />

        <Field label="Anything worth remembering?" hint="Optional — what helped you start?">
          <textarea
            className="input"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>

        <Button size="lg" onClick={save} disabled={saving}>
          Save and close the day
        </Button>
      </Card>
    </div>
  );
}
