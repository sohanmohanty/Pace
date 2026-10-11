import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AnimatePresence } from "motion/react";
import { ArrowRight, Check, ChevronDown, Feather, Play, SlidersHorizontal, Sparkles, Sunset } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { CheckInPanel } from "../components/CheckInPanel";
import { DayLine } from "../components/DayLine";
import { EmptyState } from "../components/EmptyState";
import { ProgressSummary } from "../components/ProgressSummary";
import { QuickAdd } from "../components/QuickAdd";
import { ReplanBox } from "../components/ReplanBox";
import { StepCard } from "../components/StepCard";
import { useToast } from "../components/Toast";
import { Button, Card, Chip, SectionTitle } from "../components/ui";
import { clearDemoData, hasDemoData, loadDemoData } from "../data/demo";
import {
  getTodayCheckIn,
  listPlansSince,
  minutesByAction,
  saveCheckIn,
  savePlanForToday,
  togglePlanAction
} from "../data/repo";
import { addDaysISO, formatDueLabel, formatLongDate, todayISO } from "../lib/dates";
import { greeting, minutesLabel } from "../lib/labels";
import {
  buildLocalPlan,
  draftFromCheckIn,
  taskOrderFor,
  usePlannerData,
  type DraftCheckIn
} from "../lib/usePlanner";
import { useAIPlan } from "../lib/useAIPlan";
import { dialLabel, tintHueForDial } from "../logic/capacity";
import { narratePlan } from "../logic/narrate";
import { totalPlanMinutes } from "../logic/scheduler";

/** Show "Choosing your steps" over the local draft, then briefly show "Updated" when AI steps arrive. */
function PlanStatus({ phase, planCreatedAt }: { phase: string; planCreatedAt: string }) {
  const [flash, setFlash] = useState(false);
  const prev = useRef(planCreatedAt);
  useEffect(() => {
    if (phase === "done" && prev.current !== planCreatedAt) {
      setFlash(true);
      const t = window.setTimeout(() => setFlash(false), 2600);
      prev.current = planCreatedAt;
      return () => window.clearTimeout(t);
    }
    prev.current = planCreatedAt;
  }, [phase, planCreatedAt]);
  if (phase === "composing") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-2.5 py-1 text-[0.82rem] font-medium text-brand-deep" role="status">
        <Sparkles aria-hidden="true" size={14} className="animate-pulse" />
        Choosing your steps… these are a first draft
      </span>
    );
  }
  if (flash) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-good-soft px-2.5 py-1 text-[0.82rem] font-medium text-good" role="status">
        <Check aria-hidden="true" size={14} />
        Steps updated
      </span>
    );
  }
  return null;
}

export function Home() {
  const navigate = useNavigate();
  const toast = useToast();
  const data = usePlannerData();
  const demo = useLiveQuery(() => hasDemoData(), []);
  const weekPlans = useLiveQuery(() => listPlansSince(addDaysISO(todayISO(), -6)), []);
  const spent = useLiveQuery(() => minutesByAction(), []);

  // Open "Your tasks" initially when there are at most two open tasks.
  // After initialization, the student controls it; adding a third task leaves it open.
  const [tasksOpen, setTasksOpen] = useState<boolean | null>(null);
  const openCount = data.openTasks.length;
  useEffect(() => {
    if (tasksOpen === null && data.ready) setTasksOpen(openCount <= 2);
  }, [tasksOpen, data.ready, openCount]);

  const [draft, setDraft] = useState<DraftCheckIn | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const aiPlan = useAIPlan();

  // Seed the draft once from any saved check-in.
  useEffect(() => {
    if (data.ready && draft === null) setDraft(draftFromCheckIn(data.checkIn));
  }, [data.ready, data.checkIn, draft]);

  // Keep the tint on the saved plan's dial when not actively choosing.
  useEffect(() => {
    if (data.checkIn?.dial !== undefined && data.plan) {
      document.documentElement.style.setProperty(
        "--cap-h",
        String(Math.round(tintHueForDial(data.checkIn.dial)))
      );
    }
  }, [data.checkIn, data.plan]);

  const taskOrder = useMemo(() => taskOrderFor(data.activeTasks), [data.activeTasks]);

  const reasoning = useMemo(() => {
    if (aiPlan.state.phase === "composing") return aiPlan.state.reasoning;
    if (!data.plan) return "";
    return (
      data.plan.reasoning ??
      narratePlan({
        actions: data.plan.actions,
        budgetMinutes: data.plan.budgetMinutes,
        checkIn: data.checkIn,
        tasks: data.activeTasks
      })
    );
  }, [aiPlan.state, data.plan, data.checkIn, data.activeTasks]);

  if (!data.ready || draft === null) return null;

  const { plan, checkIn, openTasks } = data;
  const hour = new Date().getHours();

  const weekCutoff = addDaysISO(todayISO(), -6);
  const stepsDone = (weekPlans ?? []).flatMap((p) => p.actions).filter((a) => a.completed).length;
  const tasksFinished = data.allTasks.filter(
    (t) => t.status === "done" && t.updatedAt.slice(0, 10) >= weekCutoff
  ).length;

  const doneCount = plan?.actions.filter((a) => a.completed).length ?? 0;
  const remaining = plan ? plan.actions.filter((a) => !a.completed) : [];
  const remainingMinutes = totalPlanMinutes(remaining);
  const nextAction = remaining[0];

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
      const built = buildLocalPlan(draft, data.activeTasks, data.subtasks, data.multiplier);
      // Save the local draft immediately; replace it when the AI result arrives.
      void aiPlan.run(built, {
        tasks: data.activeTasks,
        subtasks: data.subtasks,
        checkIn: saved!,
        reflections: data.reflections,
        multiplier: data.multiplier,
        currentPlan: null,
        mode: "plan"
      });
    } finally {
      setBusy(false);
    }
  }

  async function makeSmaller() {
    if (!plan || !draft) return;
    aiPlan.cancel();
    const built = buildLocalPlan(draft, data.activeTasks, data.subtasks, data.multiplier, true);
    await savePlanForToday(built);
    toast("Made it smaller. Completed steps kept");
  }

  async function replan(instruction: string) {
    if (!plan || !checkIn) return;
    await aiPlan.run(null, {
      tasks: data.activeTasks,
      subtasks: data.subtasks,
      checkIn,
      reflections: data.reflections,
      multiplier: data.multiplier,
      currentPlan: plan,
      instruction: instruction || undefined,
      mode: "replan"
    });
  }

  function selectStop(id: string) {
    setSelected((s) => (s === id ? null : id));
    document.getElementById(`step-${id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  const showCheckIn = !checkIn || !plan;

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-[2rem] leading-none lg:text-[2.4rem]">{greeting(hour)}.</h1>
          <p className="mt-1.5 text-soft">{formatLongDate(new Date())}</p>
        </div>
        {checkIn && plan && (
          <Link
            to="/plan"
            className="inline-flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border-[1.5px] border-line bg-surface px-3.5 text-[0.9rem] font-medium text-ink hover:border-line-strong"
            aria-label={
              checkIn.dial !== undefined
                ? `Adjust today: ${checkIn.dial}, ${dialLabel(checkIn.dial)}`
                : "Adjust today"
            }
          >
            <SlidersHorizontal aria-hidden="true" size={15} />
            {checkIn.dial !== undefined ? (
              <>
                <span className="tabular">{checkIn.dial}</span>
                <span className="hidden sm:inline"> · {dialLabel(checkIn.dial)}</span>
              </>
            ) : (
              "Adjust"
            )}
          </Link>
        )}
      </header>

      {demo && (
        <div className="flex items-center justify-between gap-2 rounded-[0.875rem] border border-line bg-surface px-3 py-2">
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
            title="Start with your tasks"
            body="No account, no explanations needed. One line per thing is enough."
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
      ) : showCheckIn ? (
        <div className="space-y-5">
          {/* Keep the task summary compact and expandable. Open it initially
              when there are at most two tasks to make adding tasks easier. */}
          <details
            className="card group px-5 py-3"
            open={tasksOpen ?? openTasks.length <= 2}
            onToggle={(e) => setTasksOpen(e.currentTarget.open)}
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
              <span className="min-w-0 truncate">
                <span className="font-medium">Your tasks</span>
                <span className="ml-2 text-soft">
                  {openTasks.length} added
                  {openTasks.length > 0 && openTasks.length <= 3 ? `: ${openTasks.map((t) => t.title).join(", ")}` : ""}
                </span>
              </span>
              <span className="inline-flex shrink-0 items-center gap-1.5 text-[0.9rem] font-medium text-brand-deep">
                Add more
                <ChevronDown aria-hidden="true" size={17} className="transition-transform group-open:rotate-180" />
              </span>
            </summary>
            <div className="mt-3 grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
              <ul className="space-y-1.5">
                {[...openTasks]
                  .sort((x, y) => (x.dueDate ?? "9999-12-31").localeCompare(y.dueDate ?? "9999-12-31"))
                  .slice(0, 6)
                  .map((t) => (
                    <li key={t.id}>
                      <Link
                        to={`/task/${t.id}`}
                        className="flex items-center justify-between gap-3 rounded-[0.75rem] border border-line px-3 py-2 text-[0.95rem] hover:border-line-strong"
                      >
                        <span className="min-w-0 truncate">{t.title}</span>
                        {t.dueDate && <span className="shrink-0 text-[0.8rem] text-soft">{formatDueLabel(t.dueDate)}</span>}
                      </Link>
                    </li>
                  ))}
                {openTasks.length > 6 && (
                  <li>
                    <Link to="/tasks" className="px-1 text-[0.9rem] font-medium text-brand-deep underline underline-offset-4">
                      and {openTasks.length - 6} more
                    </Link>
                  </li>
                )}
              </ul>
              <div>
                <QuickAdd />
                <Link to="/capture?tab=paste" className="mt-3 inline-flex items-center gap-1.5 text-[0.9rem] font-medium text-brand-deep">
                  Paste a syllabus or add a photo
                  <ArrowRight aria-hidden="true" size={15} />
                </Link>
                <p className="mt-2 text-[0.88rem] text-soft">The plan only picks a few; the rest waits here.</p>
              </div>
            </div>
          </details>

          <CheckInPanel
            draft={draft}
            onDraft={setDraft}
            tasks={data.activeTasks}
            subtasks={data.subtasks}
            multiplier={data.multiplier}
            onUse={usePlan}
            busy={busy}
          />
        </div>
      ) : (
        <div className="space-y-6 lg:grid lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start lg:gap-x-8 lg:gap-y-6 lg:space-y-0">
          {/* The Day Line, live, full width. */}
          <section aria-label="Today's day line" className="card card-tint px-2 pb-3 pt-3 sm:px-3 lg:col-span-2">
            <DayLine
              actions={plan!.actions}
              budgetMinutes={plan!.budgetMinutes}
              windows={checkIn!.windows}
              taskOrder={taskOrder}
              selectedId={selected}
              onSelect={selectStop}
            />
            <div className="flex flex-wrap items-center justify-between gap-2 px-3">
              <p className="tabular text-[0.92rem] text-soft">
                <span className="font-semibold text-ink">{doneCount}</span>/{plan!.actions.length} done
                {remainingMinutes > 0 ? ` · ~${minutesLabel(remainingMinutes)} left` : " · all done"}
              </p>
              {nextAction && (
                <Button size="sm" variant="tint" onClick={() => navigate(`/focus/${nextAction.id}`)}>
                  <Play aria-hidden="true" size={15} fill="currentColor" />
                  Start next
                </Button>
              )}
            </div>
          </section>

          <div className="min-w-0 space-y-6">
            {(reasoning || aiPlan.state.phase === "composing") && (
              <div aria-live="polite">
                <p className="font-display text-[1.1rem] leading-[1.5] text-ink/90 lg:text-[1.18rem]">
                  {reasoning}
                  {aiPlan.state.phase === "composing" && (
                    <span
                      className="ml-1 inline-block h-[1em] w-[2px] translate-y-[0.15em] animate-pulse bg-brand align-baseline"
                      aria-hidden="true"
                    />
                  )}
                </p>
                {aiPlan.state.phase === "composing" && (
                  <p className="mt-1.5 inline-flex items-center gap-1.5 text-[0.85rem] text-soft">
                    <Sparkles aria-hidden="true" size={14} className="text-brand" />
                    {reasoning ? "Composing today's plan" : "Reading your tasks"}
                  </p>
                )}
                {aiPlan.state.notice && <p className="mt-1.5 text-[0.85rem] text-soft">{aiPlan.state.notice}</p>}
              </div>
            )}

            <section
              aria-label="Today's plan"
              className="space-y-3"
              data-plan-source={plan!.source ?? "local"}
              data-ai-phase={aiPlan.state.phase}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <SectionTitle>Today's plan</SectionTitle>
                <PlanStatus phase={aiPlan.state.phase} planCreatedAt={plan!.createdAt} />
              </div>
              <div
                className={`relative space-y-2 transition-opacity duration-300 ${
                  aiPlan.state.phase === "composing" ? "opacity-60" : ""
                }`}
                aria-busy={aiPlan.state.phase === "composing"}
              >
                {aiPlan.state.phase === "composing" && (
                  <div className="progress-track absolute -top-2 left-0 right-0" aria-hidden="true">
                    <div className="progress-bar" />
                  </div>
                )}
                <AnimatePresence initial={false}>
                  {plan!.actions.map((a) => (
                    <StepCard
                      key={a.id}
                      id={`step-${a.id}`}
                      action={a}
                      taskTitle={data.taskById.get(a.taskId)?.title}
                      taskOrder={taskOrder}
                      selected={selected === a.id}
                      minutesSpent={spent?.[a.id]}
                      onToggle={(id) => togglePlanAction(plan!.id, id)}
                      onStart={(id) => navigate(`/focus/${id}`)}
                    />
                  ))}
                </AnimatePresence>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="soft" onClick={makeSmaller}>
                  <Feather aria-hidden="true" size={17} />
                  Make it smaller
                </Button>
                <Button variant="ghost" onClick={() => navigate("/plan")}>
                  <SlidersHorizontal aria-hidden="true" size={17} />
                  Adjust
                </Button>
                <Button variant="ghost" onClick={() => navigate("/reflect")}>
                  <Sunset aria-hidden="true" size={17} />
                  Wrap up
                </Button>
              </div>
              {aiPlan.aiEnabled && <ReplanBox onReplan={replan} busy={aiPlan.state.phase === "composing"} />}
            </section>
          </div>

          <div className="space-y-5">
            <Card>
              <QuickAdd />
            </Card>
            <ProgressSummary stepsDone={stepsDone} tasksFinished={tasksFinished} />
            <Link
              to="/week"
              className="flex items-center justify-between rounded-[1rem] border border-line bg-surface p-4 font-medium hover:border-line-strong"
            >
              See the week
              <ArrowRight aria-hidden="true" size={19} />
            </Link>
            <Link
              to="/about"
              className="flex items-center justify-between rounded-[1rem] border border-line bg-surface p-4 font-medium hover:border-line-strong lg:hidden"
            >
              About Pace
              <ArrowRight aria-hidden="true" size={19} />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
