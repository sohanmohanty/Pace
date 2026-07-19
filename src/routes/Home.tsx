import { useLiveQuery } from "dexie-react-hooks";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Feather } from "lucide-react";
import { CapacityPicker } from "../components/CapacityPicker";
import { EmptyState } from "../components/EmptyState";
import { PlanActionCard } from "../components/PlanActionCard";
import { ProgressSummary } from "../components/ProgressSummary";
import { QuickAdd } from "../components/QuickAdd";
import { useToast } from "../components/Toast";
import { Button, Card, Chip, SectionTitle } from "../components/ui";
import { db } from "../data/db";
import { clearDemoData, hasDemoData, loadDemoData } from "../data/demo";
import {
  getTodayCheckIn,
  getTodayPlan,
  listPlansSince,
  listReflections,
  saveCheckIn,
  savePlanForToday,
  togglePlanAction
} from "../data/repo";
import { addDaysISO, formatLongDate, todayISO } from "../lib/dates";
import { CAPACITY_LABELS, greeting, minutesLabel } from "../lib/labels";
import { capacityMultiplier } from "../logic/adaptation";
import { generatePlan, totalPlanMinutes } from "../logic/scheduler";

export function Home() {
  const navigate = useNavigate();
  const toast = useToast();

  const allTasks = useLiveQuery(() => db.tasks.toArray(), []);
  const subtasks = useLiveQuery(() => db.subtasks.toArray(), []);
  const checkIn = useLiveQuery(async () => (await getTodayCheckIn()) ?? null, []);
  const plan = useLiveQuery(async () => (await getTodayPlan()) ?? null, []);
  const reflections = useLiveQuery(() => listReflections(), []);
  const demo = useLiveQuery(() => hasDemoData(), []);
  const weekPlans = useLiveQuery(() => listPlansSince(addDaysISO(todayISO(), -6)), []);

  if (
    allTasks === undefined ||
    subtasks === undefined ||
    checkIn === undefined ||
    plan === undefined
  ) {
    return null;
  }

  const activeTasks = allTasks.filter((t) => !t.archived);
  const openTasks = activeTasks.filter((t) => t.status !== "done");
  const hour = new Date().getHours();

  const weekCutoff = addDaysISO(todayISO(), -6);
  const stepsDone = (weekPlans ?? [])
    .flatMap((p) => p.actions)
    .filter((a) => a.completed).length;
  const tasksFinished = allTasks.filter(
    (t) => t.status === "done" && t.updatedAt.slice(0, 10) >= weekCutoff
  ).length;

  const doneCount = plan?.actions.filter((a) => a.completed).length ?? 0;
  const remainingMinutes = plan
    ? totalPlanMinutes(plan.actions.filter((a) => !a.completed))
    : 0;

  async function pickCapacity(c: Parameters<typeof saveCheckIn>[0]) {
    await saveCheckIn(c);
    navigate("/plan");
  }

  async function makeSmaller() {
    if (!plan || subtasks === undefined) return;
    const built = generatePlan({
      tasks: activeTasks,
      subtasks,
      capacity: plan.capacity,
      multiplier: capacityMultiplier(reflections ?? []),
      shrink: true
    });
    await savePlanForToday(built);
    toast("Made it smaller. Completed steps kept");
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-[1.6rem] font-semibold leading-tight tracking-tight lg:text-[1.85rem]">
          {greeting(hour)}.
        </h1>
        <p className="mt-0.5 text-soft">{formatLongDate(new Date())}</p>
      </header>

      {demo && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface px-3 py-2">
          <Chip tone="brand">Sample data loaded</Chip>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              await clearDemoData();
              toast("Sample data cleared");
            }}
          >
            Clear it
          </Button>
        </div>
      )}

      {openTasks.length === 0 && !plan ? (
        <div className="space-y-5 lg:mx-auto lg:max-w-xl">
          <EmptyState
            title="Start with what's on your plate"
            body="No account, no explanations needed. Nothing leaves this device."
          >
            <Button
              variant="soft"
              size="lg"
              onClick={async () => {
                await loadDemoData();
                toast("Example tasks loaded. Try making a plan");
              }}
            >
              Try Pace with example tasks
            </Button>
          </EmptyState>
          <Card>
            <QuickAdd />
          </Card>
        </div>
      ) : (
        <div className="space-y-5 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-x-6 lg:space-y-0">
          <div className="min-w-0 space-y-5">
          {checkIn === null ? (
            <Card>
              <CapacityPicker onChange={pickCapacity} />
            </Card>
          ) : (
            <div className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface px-3 py-2">
              <p className="text-[0.95rem]">
                Today feels:{" "}
                <span className="font-semibold">{CAPACITY_LABELS[checkIn.capacity].title}</span>
              </p>
              <Button variant="ghost" size="sm" onClick={() => navigate("/plan")}>
                Change
              </Button>
            </div>
          )}

          {plan && plan.actions.length > 0 ? (
            <section aria-label="Today's plan" className="space-y-3">
              <div className="flex items-baseline justify-between">
                <SectionTitle>Today's plan</SectionTitle>
                <p className="text-[0.9rem] text-soft">
                  {doneCount}/{plan.actions.length} ·{" "}
                  {remainingMinutes > 0 ? `~${minutesLabel(remainingMinutes)} left` : "all done"}
                </p>
              </div>
              <div className="space-y-2">
                {plan.actions.map((a) => (
                  <PlanActionCard
                    key={a.id}
                    action={a}
                    onToggle={(id) => togglePlanAction(plan.id, id)}
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="soft" onClick={makeSmaller}>
                  <Feather aria-hidden="true" size={18} />
                  Make it smaller
                </Button>
                <Button variant="ghost" onClick={() => navigate("/plan")}>
                  Adjust plan
                </Button>
                <Button variant="ghost" onClick={() => navigate("/reflect")}>
                  Wrap up the day
                </Button>
              </div>
              <p className="text-[0.9rem] text-soft">
                Anything you don't get to stays safely in your task list.
              </p>
            </section>
          ) : (
            checkIn && (
              <Card>
                <SectionTitle>Ready when you are</SectionTitle>
                <p className="mt-1 text-soft">
                  Pace will pick a few realistic steps from your tasks.
                </p>
                <div className="mt-4 space-y-2">
                  <Button size="lg" onClick={() => navigate("/plan")}>
                    Make today's plan
                  </Button>
                  <Button variant="soft" size="lg" onClick={() => navigate("/low")}>
                    I need the smallest version
                  </Button>
                </div>
              </Card>
            )
          )}
          </div>

          <div className="space-y-5">
            {checkIn?.capacity === "low" && (
              <Link
                to="/low"
                className="flex items-center justify-between rounded-2xl border border-line bg-brand-soft p-4 font-medium text-brand-deep"
              >
                One step at a time: the low-capacity view
                <ArrowRight aria-hidden="true" size={20} />
              </Link>
            )}

            <Card>
              <QuickAdd />
            </Card>

            <ProgressSummary stepsDone={stepsDone} tasksFinished={tasksFinished} />
          </div>
        </div>
      )}
    </div>
  );
}
