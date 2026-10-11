import { useContext, useEffect, useMemo, useState } from "react";
import { SettingsContext } from "../lib/settingsContext";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowRight, Github, ShieldCheck, Sparkles, Waypoints } from "lucide-react";
import { CapacityDial } from "../components/CapacityDial";
import { DayLine } from "../components/DayLine";
import { Logo, Wordmark } from "../components/Logo";
import { Eyebrow } from "../components/ui";
import { minutesLabel } from "../lib/labels";
import { samplePlan, sampleTasks } from "../lib/sampleDay";
import { taskOrderFor } from "../lib/usePlanner";
import { dialLabel, smoothBudgetForDial, tintHueForDial } from "../logic/capacity";
import { narratePlan } from "../logic/narrate";

// Introduce the dial and Day Line before the explanatory text. The demo
// uses the daily planner on a sample backlog.

export function Landing() {
  const settings = useContext(SettingsContext);
  const onboarded = settings?.onboarded ?? false;
  const [dial, setDial] = useState(58);
  const { tasks } = useMemo(() => sampleTasks(), []);
  const taskOrder = useMemo(() => taskOrderFor(tasks), [tasks]);
  const planDial = Math.round(dial);
  const plan = useMemo(() => samplePlan(planDial), [planDial]);
  const planned = plan.actions.reduce((s, a) => s + a.estimatedMinutes, 0);
  const displayBudget = Math.max(planned, plan.budgetMinutes * (smoothBudgetForDial(dial) / Math.max(1, smoothBudgetForDial(planDial))));
  const story = useMemo(
    () => narratePlan({ actions: plan.actions, budgetMinutes: plan.budgetMinutes, checkIn: { dial, capacity: "medium" }, tasks }),
    [plan, dial, tasks]
  );

  useEffect(() => {
    document.documentElement.style.setProperty("--cap-h", String(Math.round(tintHueForDial(planDial))));
  }, [planDial]);

  return (
    <div className="mx-auto max-w-5xl">
      <header className="flex items-center justify-between py-2">
        <Wordmark />
        <nav className="flex items-center gap-4 text-[0.95rem] font-medium">
          <Link to="/how" className="text-soft hover:text-ink">
            How it thinks
          </Link>
          <Link to={onboarded ? "/" : "/onboarding"} className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-brand px-4 text-on-brand hover:bg-brand-deep">
            {onboarded ? "Back to today" : "Start planning"}
            <ArrowRight aria-hidden="true" size={16} />
          </Link>
        </nav>
      </header>

      <section className="pt-10 lg:pt-16">
        <motion.h1
          initial={{ y: 10 }}
          animate={{ y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-3xl text-[2.6rem] leading-[1.02] sm:text-[3.4rem] lg:text-[4rem]"
        >
          A planner that plans around how you actually feel.
        </motion.h1>
        <motion.p
          initial={{ y: 10 }}
          animate={{ y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mt-5 max-w-2xl text-[1.15rem] leading-relaxed text-soft"
        >
          I developed Pace for students returning to schoolwork after an absence or disruption. Start with
          how much you can manage today. Pace selects steps that fit and explains each choice. The rest can wait.
        </motion.p>

        <motion.div
          initial={{ y: 16 }}
          animate={{ y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mt-10 grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:items-start"
        >
          <div className="card card-tint px-2 pb-3 pt-3 sm:px-3">
            <DayLine actions={plan.actions} budgetMinutes={displayBudget} taskOrder={taskOrder} label={`Demo: ${plan.actions.length} steps, ${minutesLabel(planned)} of ${minutesLabel(plan.budgetMinutes)}.`} />
            <p aria-live="polite" className="tabular px-3 text-center text-[0.92rem] text-soft">
              <span className="font-semibold text-ink">{plan.actions.length}</span> steps ·{" "}
              <span className="font-semibold text-ink">{minutesLabel(planned)}</span> of {minutesLabel(plan.budgetMinutes)} · {dialLabel(dial)}
            </p>
          </div>
          <div className="card p-5">
            <CapacityDial value={dial} onChange={setDial} legend="How much can you manage today?" hint="Move the dial to see how the plan changes." />
          </div>
        </motion.div>

        <p className="mt-5 max-w-3xl font-display text-[1.1rem] leading-relaxed text-ink/85">{story}</p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link to={onboarded ? "/" : "/onboarding"} className="inline-flex min-h-13 items-center gap-2 rounded-[1rem] bg-brand px-6 text-[1.05rem] font-medium text-on-brand shadow-sm hover:bg-brand-deep">
            {onboarded ? "Back to today" : "Start, no sign-up"}
            <ArrowRight aria-hidden="true" size={18} />
          </Link>
          <Link to="/how" className="inline-flex min-h-13 items-center gap-2 rounded-[1rem] border-[1.5px] border-line bg-surface px-5 text-[1.05rem] font-medium hover:border-line-strong">
            <Waypoints aria-hidden="true" size={18} />
            How Pace thinks
          </Link>
        </div>
      </section>

      <section className="mt-20 grid gap-5 md:grid-cols-3">
        <Feature
          icon={<Waypoints aria-hidden="true" size={22} />}
          title="Set a pace for today"
          body="I designed the dial so you can choose your capacity from 0 to 100. This sets your planned time, the length of each step, and how many steps fit. On low-capacity days, you get up to three short steps. Higher settings allow longer periods of work."
        />
        <Feature
          icon={<Sparkles aria-hidden="true" size={22} />}
          title="A plan with reasons"
          body="I designed the planner to combine AI suggestions with explicit checks. Each step has a reason and an action for the first minute. Pace checks that the steps come from your tasks, follow the correct order, and fit your limits. An exact solver trims the plan if needed."
        />
        <Feature
          icon={<ShieldCheck aria-hidden="true" size={22} />}
          title="Start without an account"
          body="I designed Pace to store your tasks in this browser without requiring an explanation of why you fell behind. For AI planning, Pace sends task details such as titles, dates, estimates, and steps, along with your check-in and what it has learned about your work."
        />
      </section>

      <section className="mt-20 grid gap-8 lg:grid-cols-2 lg:items-center">
        <div>
          <Eyebrow>When the day changes</Eyebrow>
          <h2 className="mt-2 text-[2rem] leading-tight">Adjust the plan as the day changes.</h2>
          <p className="mt-3 text-soft">
            Start a step and the timer counts up. If it takes longer than expected, record the time and adjust your plan.
            At 7pm, with two of five steps done, you can type "nothing with reading tonight, 40 minutes" to replan
            the rest of the evening. Unfinished steps stay available without turning red.
          </p>
          <ul className="mt-4 space-y-2 text-[0.98rem]">
            <li className="flex gap-2"><Check /> Capture a syllabus, a photo of a whiteboard, or a Canvas feed link.</li>
            <li className="flex gap-2"><Check /> Draft a message to your teacher asking for help without sharing personal details.</li>
            <li className="flex gap-2"><Check /> Review what Pace learns on your device about work estimates and completion by time of day.</li>
            <li className="flex gap-2"><Check /> Choose a light, dark, or high-contrast theme. You can use Pace entirely with a keyboard.</li>
          </ul>
        </div>
        <div className="card p-5">
          <Eyebrow>What AI planning uses</Eyebrow>
          <pre className="mt-2 overflow-x-auto rounded-[0.875rem] bg-surface-2 p-3 text-[0.8rem] leading-relaxed text-soft" tabIndex={0} role="region" aria-label="Example of what is sent to the planner">{`{
  "checkIn": { "dial": 45, "windows": ["evening"], "heavy": ["reading"] },
  "tasks": [
    { "title": "Biology lab report", "course": "Biology",
      "dueDate": null, "estimatedMinutes": 120,
      "steps": [ "Re-read the data table", "Draft the results" ] }
  ],
  "learned": [ "Biology work tends to take about 1.6x the estimate." ]
}`}</pre>
          <p className="mt-2 text-[0.9rem] text-soft">
            I exclude your task notes and profile name from planning requests. I do not keep a server copy of your tasks.
          </p>
        </div>
      </section>

      <footer className="mt-20 flex flex-wrap items-center justify-between gap-4 border-t border-line py-8 text-[0.9rem] text-soft">
        <span className="inline-flex items-center gap-2">
          <Logo size={20} /> I provide Pace free of charge and release it as open source.
        </span>
        <span className="flex gap-4">
          <a className="hover:text-ink" href="/privacy.html">
            Privacy
          </a>
          <Link className="hover:text-ink" to="/how">
            How it thinks
          </Link>
          <a className="inline-flex items-center gap-1 hover:text-ink" href="https://github.com/sohanmohanty/Pace" rel="noreferrer">
            <Github aria-hidden="true" size={15} /> Source
          </a>
        </span>
      </footer>
    </div>
  );
}

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="card p-5">
      <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-soft text-brand-deep">{icon}</span>
      <h2 className="mt-3 text-[1.25rem] leading-snug">{title}</h2>
      <p className="mt-2 text-[0.95rem] text-soft">{body}</p>
    </div>
  );
}

function Check() {
  return (
    <span aria-hidden="true" className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-brand" />
  );
}

