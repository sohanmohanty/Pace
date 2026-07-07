import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate } from "react-router-dom";
import { EmptyState } from "../components/EmptyState";
import { useToast } from "../components/Toast";
import { Button, Card, Chip } from "../components/ui";
import { db } from "../data/db";
import {
  completePlanAction,
  getTodayCheckIn,
  getTodayPlan,
  listReflections,
  saveCheckIn,
  savePlanForToday
} from "../data/repo";
import { minutesLabel } from "../lib/labels";
import { capacityMultiplier } from "../logic/adaptation";
import { generatePlan } from "../logic/scheduler";

export function LowCapacity() {
  const navigate = useNavigate();
  const toast = useToast();
  const [skip, setSkip] = useState(0);
  const initialized = useRef(false);
  const completing = useRef(false);

  const allTasks = useLiveQuery(() => db.tasks.toArray(), []);
  const subtasks = useLiveQuery(() => db.subtasks.toArray(), []);
  const checkIn = useLiveQuery(async () => (await getTodayCheckIn()) ?? null, []);
  const plan = useLiveQuery(async () => (await getTodayPlan()) ?? null, []);
  const reflections = useLiveQuery(() => listReflections(), []);

  const ready =
    allTasks !== undefined &&
    subtasks !== undefined &&
    checkIn !== undefined &&
    plan !== undefined &&
    reflections !== undefined;

  useEffect(() => {
    if (!ready || initialized.current) return;
    initialized.current = true;
    (async () => {
      if (checkIn?.capacity !== "low") await saveCheckIn("low");
      const active = allTasks!.filter((t) => !t.archived);
      const hasOpen = active.some((t) => t.status !== "done");
      if (hasOpen && (!plan || plan.capacity !== "low")) {
        const built = generatePlan({
          tasks: active,
          subtasks: subtasks!,
          capacity: "low",
          multiplier: capacityMultiplier(reflections!)
        });
        if (built.actions.length > 0) await savePlanForToday(built);
      }
    })();
  }, [ready, allTasks, subtasks, checkIn, plan, reflections]);

  if (!ready) return null;

  const openTasks = (allTasks ?? []).filter((t) => !t.archived && t.status !== "done");
  if (openTasks.length === 0 && !plan) {
    return (
      <div className="flex min-h-[70dvh] flex-col justify-center lg:mx-auto lg:max-w-xl">
        <EmptyState title="Nothing on your plate here" body="That's allowed. Rest counts too.">
          <Button size="lg" onClick={() => navigate("/")}>
            Back home
          </Button>
        </EmptyState>
      </div>
    );
  }

  const incomplete = plan?.actions.filter((a) => !a.completed) ?? [];
  const current = incomplete.length > 0 ? incomplete[skip % incomplete.length] : null;

  async function markDone() {
    if (!plan || !current || completing.current) return;
    completing.current = true;
    try {
      await completePlanAction(plan.id, current.id);
      setSkip(0);
      toast("That counts.");
    } finally {
      completing.current = false;
    }
  }

  return (
    <div className="flex min-h-[75dvh] flex-col justify-center space-y-5 lg:mx-auto lg:max-w-xl">
      <header className="text-center">
        <h1 className="text-[1.5rem] font-semibold tracking-tight">One step at a time.</h1>
        <p className="mt-1 text-soft">One useful step is enough for now.</p>
      </header>

      {current ? (
        <Card className="text-center">
          <Chip tone="brand">~{minutesLabel(current.estimatedMinutes)}</Chip>
          <p className="mt-3 text-[1.35rem] font-semibold leading-snug">{current.title}</p>
          {current.why && <p className="mt-2 text-[0.95rem] text-soft">{current.why}</p>}
          <div className="mt-6 space-y-2">
            <Button size="lg" onClick={markDone}>
              Done — that counts
            </Button>
            {incomplete.length > 1 && (
              <Button variant="ghost" size="lg" onClick={() => setSkip((s) => s + 1)}>
                Show me something else
              </Button>
            )}
            <Button variant="soft" size="lg" onClick={() => navigate("/reflect")}>
              That's enough for today
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="text-center">
          <p className="text-[1.35rem] font-semibold">You did what today needed.</p>
          <p className="mt-2 text-soft">
            {plan?.actions.length ?? 0} small step{(plan?.actions.length ?? 0) === 1 ? "" : "s"},
            finished. That's real progress.
          </p>
          <div className="mt-6 space-y-2">
            <Button size="lg" onClick={() => navigate("/reflect")}>
              Wrap up the day
            </Button>
            <Button variant="ghost" size="lg" onClick={() => navigate("/")}>
              Back home
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
