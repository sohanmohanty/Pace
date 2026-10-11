import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, Check, Clock, Pause } from "lucide-react";
import { DayLine } from "../components/DayLine";
import { useToast } from "../components/Toast";
import { Button } from "../components/ui";
import { completePlanAction, endSession, listSessionsSince, startSession, updateProfile } from "../data/repo";
import { addDaysISO, todayISO } from "../lib/dates";
import { calibrate, energyProfile } from "../logic/learning";
import { minutesLabel } from "../lib/labels";
import { taskOrderFor, usePlannerData } from "../lib/usePlanner";
import { TASK_HUES, colorIndexFor } from "../logic/dayline";
import { stopColor } from "../components/DayLine";

// Show one step with a count-up timer and done, longer, or stopped outcomes.
// Record sessions for estimate calibration. Low-capacity mode uses this
// screen with a smaller plan.

function useTicker(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function Focus() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const data = usePlannerData();

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [finishing, setFinishing] = useState(false);
  const started = useRef<string | null>(null);

  const plan = data.plan;
  const action = useMemo(() => {
    if (!plan) return null;
    const incomplete = plan.actions.filter((a) => !a.completed);
    if (id) return plan.actions.find((a) => a.id === id) ?? incomplete[0] ?? null;
    return incomplete[0] ?? null;
  }, [plan, id]);
  const task = action ? data.taskById.get(action.taskId) : undefined;
  const taskOrder = useMemo(() => taskOrderFor(data.activeTasks), [data.activeTasks]);

  // Start a session once per action.
  useEffect(() => {
    if (!action || action.completed || started.current === action.id) return;
    started.current = action.id;
    const t0 = Date.now();
    setStartedAt(t0);
    startSession({
      taskId: action.taskId,
      subtaskId: action.subtaskId,
      actionId: action.id,
      estimatedMinutes: action.estimatedMinutes,
      workType: action.workType,
      course: task?.course
    }).then(setSessionId);
  }, [action, task]);

  const now = useTicker(Boolean(startedAt) && !finishing);
  const elapsed = startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;
  const overEstimate = action ? elapsed > action.estimatedMinutes * 60 : false;

  async function finish(outcome: "done" | "stopped" | "longer") {
    if (!plan || !action || finishing) return;
    setFinishing(true);
    try {
      if (sessionId) {
        await endSession(sessionId, outcome);
        // Recompute local estimates from the last 60 days; show them in Insights.
        const recent = await listSessionsSince(addDaysISO(todayISO(), -60));
        const cal = calibrate(recent);
        await updateProfile({ calibration: cal.byCourse, calibrationByType: cal.byType, energy: energyProfile(recent) });
      }
      if (outcome === "done") {
        await completePlanAction(plan.id, action.id);
        const rest = plan.actions.filter((a) => !a.completed && a.id !== action.id);
        toast("That counts.");
        started.current = null;
        setSessionId(null);
        setStartedAt(null);
        if (rest.length > 0) navigate(`/focus/${rest[0].id}`, { replace: true });
        else navigate("/reflect");
      } else if (outcome === "longer") {
        toast("Noted. Pace will plan with the real time next time");
        navigate("/");
      } else {
        toast("Stopping is allowed. Your progress is saved");
        navigate("/");
      }
    } finally {
      setFinishing(false);
    }
  }

  if (!data.ready) return null;

  if (!plan || !action) {
    return (
      <div className="flex min-h-[70dvh] flex-col items-center justify-center text-center">
        <p className="font-display text-[1.6rem]">
          {plan ? "You did what today needed." : "No plan yet."}
        </p>
        <p className="mt-2 text-soft">
          {plan ? "Every step is done. That is real progress." : "Check in first and Pace will pick a step."}
        </p>
        <div className="mt-6 flex gap-2">
          <Button onClick={() => navigate(plan ? "/reflect" : "/")}>
            {plan ? "Wrap up the day" : "Check in"}
          </Button>
          <Button variant="ghost" onClick={() => navigate("/")}>
            Back
          </Button>
        </div>
      </div>
    );
  }

  const hue = TASK_HUES[colorIndexFor(action.taskId, taskOrder)];

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-3rem)] max-w-2xl flex-col">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => finish("stopped")}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-2 text-[0.92rem] font-medium text-soft hover:text-ink"
        >
          <ArrowLeft aria-hidden="true" size={17} />
          Back to today
        </button>
        <p className="text-[0.85rem] text-soft">
          {plan.actions.filter((a) => a.completed).length + 1} of {plan.actions.length}
        </p>
      </div>

      <div className="mt-3 opacity-80">
        <DayLine
          actions={plan.actions}
          budgetMinutes={plan.budgetMinutes}
          windows={data.checkIn?.windows}
          taskOrder={taskOrder}
          size="compact"
          selectedId={action.id}
        />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={action.id}
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 200, damping: 26 }}
            className="w-full"
          >
            {task && task.title !== action.title && (
              <p className="inline-flex items-center gap-2 text-[0.95rem] font-medium text-soft">
                <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ background: stopColor(hue, true) }} />
                {task.title}
              </p>
            )}
            <h1 className="mx-auto mt-2 max-w-xl text-[1.9rem] leading-[1.15] sm:text-[2.3rem]">
              {action.title}
            </h1>
            {action.firstAction && (
              <p className="mx-auto mt-4 max-w-md text-[1.05rem] text-soft">
                <span className="font-medium text-ink">First: </span>
                {action.firstAction}
              </p>
            )}

            {/* Timer */}
            <div className="relative mx-auto mt-10 grid h-44 w-44 place-items-center">
              <span
                aria-hidden="true"
                className="breathe absolute inset-0 rounded-full"
                style={{ background: stopColor(hue, false) }}
              />
              <span
                aria-hidden="true"
                className="absolute inset-3 rounded-full border-[3px]"
                style={{ borderColor: stopColor(hue, true), opacity: 0.6 }}
              />
              <div className="relative">
                <p className="tabular font-display text-[2.6rem] leading-none" aria-live="off">
                  {fmt(elapsed)}
                </p>
                <p className="mt-1 text-[0.85rem] text-soft">
                  {overEstimate ? "past the estimate, that's fine" : `about ${minutesLabel(action.estimatedMinutes)}`}
                </p>
              </div>
            </div>
            <p className="visually-hidden" aria-live="polite">
              {elapsed > 0 && elapsed % 300 === 0 ? `${Math.floor(elapsed / 60)} minutes in.` : ""}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="mx-auto w-full max-w-md space-y-2 pb-4">
        <Button size="lg" onClick={() => finish("done")} disabled={finishing}>
          <Check aria-hidden="true" size={20} />
          Done. That counts
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="ghost" size="lg" className="text-[0.98rem]" onClick={() => finish("longer")} disabled={finishing}>
            <Clock aria-hidden="true" size={17} />
            Taking longer
          </Button>
          <Button variant="ghost" size="lg" className="text-[0.98rem]" onClick={() => finish("stopped")} disabled={finishing}>
            <Pause aria-hidden="true" size={17} />
            I need to stop
          </Button>
        </div>
        <p className="pt-1 text-center text-[0.88rem] text-soft">
          Running long isn't failing. The plan moves with you.
        </p>
      </div>
    </div>
  );
}
