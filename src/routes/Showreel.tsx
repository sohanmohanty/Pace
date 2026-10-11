import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CapacityDial } from "../components/CapacityDial";
import { DayLine } from "../components/DayLine";
import { StepCard } from "../components/StepCard";
import { Wordmark } from "../components/Logo";
import { minutesLabel } from "../lib/labels";
import { samplePlan, sampleTasks } from "../lib/sampleDay";
import { taskOrderFor } from "../lib/usePlanner";
import { dialLabel, tintHueForDial } from "../logic/capacity";
import { narratePlan } from "../logic/narrate";
import type { PlanAction } from "../data/types";

// Script demo scenes using the application components and sample data. Used for
// the portfolio video, landing GIF, and motion regression smoke checks.
// Space pauses, R restarts, and ?loop=1 enables looping.

type Scene =
  | { kind: "title"; ms: number }
  | { kind: "dial"; from: number; to: number; ms: number; caption: string }
  | { kind: "compose"; dial: number; ms: number; caption: string }
  | { kind: "complete"; count: number; ms: number; caption: string }
  | { kind: "hold"; ms: number; caption: string };

const SCRIPT: Scene[] = [
  { kind: "title", ms: 2600 },
  { kind: "dial", from: 85, to: 28, ms: 5200, caption: "Move one dial. The day resizes." },
  { kind: "dial", from: 28, to: 58, ms: 2400, caption: "Say how today is. Five seconds." },
  { kind: "compose", dial: 58, ms: 7000, caption: "AI writes the plan. An exact algorithm keeps it honest." },
  { kind: "complete", count: 2, ms: 4200, caption: "Running long isn't failing. The plan moves." },
  { kind: "hold", ms: 3000, caption: "Built for the worst day, so it works on every day." }
];

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export function Showreel() {
  const [sceneIdx, setSceneIdx] = useState(0);
  const [t, setT] = useState(0); // 0..1 within the scene
  const [paused, setPaused] = useState(false);
  const startRef = useRef<number>(performance.now());
  const loop = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("loop") === "1";

  // Scene clock.
  useEffect(() => {
    let raf = 0;
    const tick = (now: number) => {
      if (!paused) {
        const scene = SCRIPT[sceneIdx];
        const p = Math.min(1, (now - startRef.current) / scene.ms);
        setT(p);
        if (p >= 1) {
          if (sceneIdx < SCRIPT.length - 1) {
            setSceneIdx((i) => i + 1);
            startRef.current = now;
          } else if (loop) {
            setSceneIdx(0);
            startRef.current = now;
          }
        }
      } else {
        startRef.current = now - t * SCRIPT[sceneIdx].ms;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [sceneIdx, paused, loop, t]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " ") {
        e.preventDefault();
        setPaused((p) => !p);
      }
      if (e.key.toLowerCase() === "r") {
        setSceneIdx(0);
        startRef.current = performance.now();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const scene = SCRIPT[sceneIdx];
  const dial = useMemo(() => {
    if (scene.kind === "dial") return Math.round(scene.from + (scene.to - scene.from) * easeInOut(t));
    if (scene.kind === "compose") return scene.dial;
    if (scene.kind === "title") return 85;
    return 58;
  }, [scene, t]);

  useEffect(() => {
    document.documentElement.style.setProperty("--cap-h", String(Math.round(tintHueForDial(dial))));
  }, [dial]);

  const { tasks } = useMemo(() => sampleTasks(), []);
  const taskOrder = useMemo(() => taskOrderFor(tasks), [tasks]);
  const basePlan = useMemo(() => samplePlan(dial), [dial]);

  // In the compose scene, steps land one by one and the paragraph types out.
  const story = useMemo(
    () => narratePlan({ actions: basePlan.actions, budgetMinutes: basePlan.budgetMinutes, checkIn: { dial, capacity: "medium" }, tasks }),
    [basePlan, dial, tasks]
  );
  const revealCount = scene.kind === "compose" ? Math.min(basePlan.actions.length, Math.floor(easeInOut(Math.min(1, t * 1.4)) * (basePlan.actions.length + 1))) : basePlan.actions.length;
  const typed = scene.kind === "compose" ? story.slice(0, Math.floor(story.length * Math.min(1, t * 1.15))) : story;
  const completed = scene.kind === "complete" ? Math.min(scene.count, Math.floor(t * (scene.count + 1))) : scene.kind === "hold" ? 2 : 0;

  const actions: PlanAction[] = basePlan.actions.slice(0, revealCount).map((a, i) => ({ ...a, completed: i < completed }));
  const caption = "caption" in scene ? scene.caption : "";

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center py-8">
      <AnimatePresence mode="wait">
        {scene.kind === "title" ? (
          <motion.div key="title" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-6 text-center">
            <motion.svg width="320" height="80" viewBox="0 0 320 80" aria-hidden="true">
              <motion.path d="M10 60 C 80 10, 160 10, 310 30" fill="none" stroke="var(--brand)" strokeWidth="5" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.6, ease: "easeInOut" }} />
              <motion.circle cx="200" cy="18" r="9" fill="var(--surface)" stroke="var(--brand)" strokeWidth="5" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 1.2, type: "spring" }} />
            </motion.svg>
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.4 }}>
              <Wordmark className="scale-150" />
            </motion.div>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.8 }} className="font-display text-[1.3rem] text-soft">
              A planner that plans around how you actually feel.
            </motion.p>
          </motion.div>
        ) : (
          <motion.div key="app" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-5">
            <div className="card card-tint px-2 pb-3 pt-3 sm:px-3">
              <DayLine actions={actions} budgetMinutes={basePlan.budgetMinutes} taskOrder={taskOrder} showWindows={false} />
              <p className="tabular px-3 text-center text-[0.92rem] text-soft">
                <span className="font-semibold text-ink">{actions.length}</span> steps ·{" "}
                <span className="font-semibold text-ink">{minutesLabel(actions.reduce((s, a) => s + a.estimatedMinutes, 0))}</span> of {minutesLabel(basePlan.budgetMinutes)} · {dialLabel(dial)}
              </p>
            </div>

            {scene.kind === "dial" && (
              <div className="card p-5">
                <CapacityDial value={dial} onChange={() => undefined} legend="How much do you have today?" hint="" />
              </div>
            )}

            {(scene.kind === "compose" || scene.kind === "complete" || scene.kind === "hold") && (
              <>
                <p className="font-display text-[1.15rem] leading-relaxed text-ink/90" aria-live="off">
                  {typed}
                  {scene.kind === "compose" && t < 0.95 && <span className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[0.15em] animate-pulse bg-brand" aria-hidden="true" />}
                </p>
                <div className="space-y-2">
                  <AnimatePresence initial={false}>
                    {actions.map((a) => (
                      <StepCard key={a.id} action={a} taskTitle={tasks.find((x) => x.id === a.taskId)?.title} taskOrder={taskOrder} readOnly />
                    ))}
                  </AnimatePresence>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {caption && (
          <motion.p
            key={caption}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="fixed inset-x-0 bottom-8 mx-auto w-fit rounded-full bg-ink px-5 py-2.5 text-center text-[1.05rem] font-medium text-bg shadow-lg"
          >
            {caption}
          </motion.p>
        )}
      </AnimatePresence>
      <p className="visually-hidden">Showreel. Space pauses, R restarts.</p>
    </div>
  );
}
