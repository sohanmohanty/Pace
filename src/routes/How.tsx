import { useContext, useEffect, useMemo, useState } from "react";
import { SettingsContext } from "../lib/settingsContext";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { CapacityDial } from "../components/CapacityDial";
import { DayLine } from "../components/DayLine";
import { Wordmark } from "../components/Logo";
import { Chip, Eyebrow } from "../components/ui";
import { minutesLabel } from "../lib/labels";
import { sampleTasks } from "../lib/sampleDay";
import { taskOrderFor } from "../lib/usePlanner";
import { budgetForDial, capacityForDial, dialLabel, maxBlockForDial, paramsForDial, tintHueForDial } from "../logic/capacity";
import { buildCandidates, computeBudget, fillWithNextSteps, placeInWindows, selectCandidates, type Candidate } from "../logic/scheduler";
import { reasonFor, whyText } from "../logic/scoring";
import { todayISO } from "../lib/dates";

// Show how the daily planner handles a sample backlog: dial limits, scores,
// knapsack selection, then the AI proposal and validation.

export function How() {
  const settings = useContext(SettingsContext);
  const onboarded = settings?.onboarded ?? false;
  const [rawDial, setDial] = useState(50);
  const dial = Math.round(rawDial);
  const today = todayISO();
  const { tasks, subtasks } = useMemo(() => sampleTasks(today), [today]);
  const taskOrder = useMemo(() => taskOrderFor(tasks), [tasks]);

  useEffect(() => {
    document.documentElement.style.setProperty("--cap-h", String(Math.round(tintHueForDial(dial))));
  }, [dial]);

  const level = capacityForDial(dial);
  const params = paramsForDial(dial);
  const budget = computeBudget(level, 1, undefined, params.budgetMinutes);

  const candidates = useMemo(
    () => buildCandidates(tasks, subtasks, level, today, { params }),
    [tasks, subtasks, level, today, params]
  );
  const selected = useMemo(() => selectCandidates(candidates, budget, params.maxActions), [candidates, budget, params.maxActions]);
  const filled = useMemo(
    () => fillWithNextSteps(selected, tasks, subtasks, level, params, budget, today),
    [selected, tasks, subtasks, level, params, budget, today]
  );
  const actions = useMemo(
    () =>
      placeInWindows(
        filled.map((c, i) => ({
          id: `h-${i}`,
          taskId: c.taskId,
          subtaskId: c.subtaskId,
          title: c.title,
          estimatedMinutes: c.minutes,
          reason: reasonFor(c, c.factors, level),
          why: whyText(c.factors, c.kind, c.chained),
          completed: false,
          workType: c.workType
        })),
        ["evening"]
      ),
    [filled, level]
  );
  const chosenKeys = new Set(selected.map((c) => `${c.taskId}:${c.subtaskId ?? c.title}`));
  const planned = actions.reduce((s, a) => s + a.estimatedMinutes, 0);

  return (
    <div className="mx-auto max-w-4xl">
      <header className="flex items-center justify-between py-2">
        <Link to="/" aria-label="Pace home">
          <Wordmark />
        </Link>
        <Link to={onboarded ? "/" : "/onboarding"} className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-brand px-4 text-[0.95rem] font-medium text-on-brand hover:bg-brand-deep">
          {onboarded ? "Back to today" : "Start planning"}
          <ArrowRight aria-hidden="true" size={16} />
        </Link>
      </header>

      <section className="pt-8">
        <Eyebrow>How Pace thinks</Eyebrow>
        <h1 className="mt-2 text-[2.4rem] leading-[1.05] sm:text-[3rem]">How your tasks become a plan.</h1>
        <p className="mt-4 max-w-2xl text-[1.1rem] text-soft">
          I designed Pace's planner in two parts: AI suggests a plan and explains its choices, and a validator
          checks that the steps fit your time and capacity. Move the dial below to try the local planner on
          a sample task list. It uses the same scheduling code as your daily plan.
        </p>
      </section>

      {/* 1. Dial → numbers */}
      <Step n={1} title="Your capacity sets the limits">
        <p className="text-soft">
          I designed the dial to run from 0 to 100 and set the plan's limits. As you raise it, Pace increases your planned minutes, the longest allowed
          step, and the number of steps. Lower settings keep steps short. At 100, the base time budget is 200 minutes.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_14rem]">
          <div className="card p-5">
            <CapacityDial value={rawDial} onChange={setDial} legend="Dial" hint="" />
          </div>
          <div className="card grid grid-cols-3 gap-2 p-4 text-center md:grid-cols-1">
            <Stat label="budget" value={minutesLabel(budgetForDial(dial))} />
            <Stat label="longest step" value={minutesLabel(maxBlockForDial(dial))} />
            <Stat label="steps" value={`${params.maxActions}${params.maxChained ? ` +${params.maxChained}` : ""}`} />
          </div>
        </div>
        <p className="mt-2 text-[0.9rem] text-soft">
          This setting is <span className="font-medium text-ink">{dialLabel(dial)}</span>. Your reflections can adjust the time budget by ×0.5 to ×1.5. If you set a time limit, Pace keeps the budget within it.
        </p>
      </Step>

      {/* 2. Candidates and scores */}
      <Step n={2} title="Pace scores the next step of each task">
        <p className="text-soft">
          I designed the planner to consider the first unfinished step of each task, keeping steps from templates and AI breakdowns
          in order. If a step is too long for today, it uses a shorter chunk or a small starting step. Five factors
          determine the score below and the explanation of why each step was chosen.
        </p>
        <div className="mt-4 overflow-x-auto rounded-[1rem] border border-line" tabIndex={0} role="region" aria-label="Candidate scores">
          <table className="w-full text-[0.84rem] sm:min-w-[40rem] sm:text-[0.9rem]">
            <thead className="bg-surface-2 text-left text-[0.78rem] uppercase tracking-wider text-soft">
              <tr>
                <th className="px-2 py-2 font-semibold sm:px-3">Candidate</th>
                <th className="hidden px-2 py-2 font-semibold sm:table-cell">min</th>
                <th className="px-1.5 py-2 font-semibold sm:px-2" title="due date, ×1.5">urg</th>
                <th className="px-1.5 py-2 font-semibold sm:px-2" title="importance, ×1.2">imp</th>
                <th className="hidden px-2 py-2 font-semibold sm:table-cell" title="message boost">msg</th>
                <th className="hidden px-2 py-2 font-semibold sm:table-cell" title="capacity fit">fit</th>
                <th className="hidden px-2 py-2 font-semibold sm:table-cell" title="quick win">qw</th>
                <th className="px-1.5 py-2 font-semibold sm:px-2">score</th>
                <th className="hidden px-2 py-2 font-semibold sm:table-cell">chosen</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((c) => {
                const key = `${c.taskId}:${c.subtaskId ?? c.title}`;
                const chosen = chosenKeys.has(key);
                return (
                  <tr key={key} className={`border-t border-line ${chosen ? "bg-tint/60" : ""}`}>
                    <td className="px-2 py-2 sm:px-3">
                      <span className="block font-medium">{c.title}</span>
                      <span className="block text-[0.8rem] text-soft">{tasks.find((t) => t.id === c.taskId)?.title}</span>
                      {chosen && (
                        <span className="mt-0.5 block text-[0.72rem] font-semibold uppercase tracking-wider text-good sm:hidden">
                          chosen · {c.minutes} min
                        </span>
                      )}
                    </td>
                    <td className="tabular hidden px-2 py-2 sm:table-cell">{c.minutes}</td>
                    <td className="tabular px-1.5 py-2 sm:px-2">{c.factors.urgency}</td>
                    <td className="tabular px-1.5 py-2 sm:px-2">{c.factors.importance}</td>
                    <td className="tabular hidden px-2 py-2 sm:table-cell">{c.factors.communication || ""}</td>
                    <td className="tabular hidden px-2 py-2 sm:table-cell">{c.factors.fit}</td>
                    <td className="tabular hidden px-2 py-2 sm:table-cell">{c.factors.quickWin || ""}</td>
                    <td className="tabular px-1.5 py-2 font-semibold sm:px-2">{c.score.toFixed(1)}</td>
                    <td className="hidden px-2 py-2 sm:table-cell">{chosen && <Chip tone="good">yes</Chip>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[0.9rem] text-soft">
          score = urgency×1.5 + importance×1.2 + message + fit + quick win. Work you have marked as heavy today loses 4 points, so Pace favors other work while keeping it as an option.
        </p>
      </Step>

      {/* 3. Knapsack */}
      <Step n={3} title="Pace chooses the steps that fit together">
        <p className="text-soft">
          I use an exact solver to find the combination with the highest total score that fits both your time budget and step limit.
          This is called a bounded knapsack problem. Picking the highest-scoring step first can leave out two
          smaller steps with a better combined score. Instead, the solver uses dynamic programming to compare
          combinations by candidate, step count, and minutes, then works backward to find the chosen steps.
        </p>
        <KnapsackGrid candidates={candidates} budget={budget} maxActions={params.maxActions} chosen={chosenKeys} />
        <p className="mt-2 text-[0.9rem] text-soft">
          On medium- and high-capacity days, Pace adds the next steps of chosen tasks in order if the budget allows.
          It puts messages first, then sorts by urgency, keeping each task's steps together.
        </p>
      </Step>

      {/* 4. Result */}
      <Step n={4} title="Your steps appear on the Day Line">
        <div className="card card-tint px-2 pb-2 pt-3">
          <DayLine actions={actions} budgetMinutes={budget} taskOrder={taskOrder} windows={["evening"]} showWindows={false} />
          <p className="tabular px-3 text-center text-[0.9rem] text-soft">
            <span className="font-semibold text-ink">{actions.length}</span> steps · <span className="font-semibold text-ink">{minutesLabel(planned)}</span> of {minutesLabel(budget)}
          </p>
        </div>
        <ul className="mt-3 space-y-1.5 text-[0.95rem]">
          {actions.map((a) => (
            <li key={a.id} className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-medium">{a.title}</span>
              <span className="text-soft">{a.estimatedMinutes} min · {a.why}</span>
            </li>
          ))}
        </ul>
      </Step>

      {/* 5. AI layer */}
      <Step n={5} title="AI suggestions go through the same checks">
        <p className="text-soft">
          When AI is on, you see a local draft first. The model uses a limited set of details, including task
          titles, dates, estimates, steps, your dial setting, and what Pace has learned. It suggests a plan with
          titles specific to each task, reasons for its choices, and something to do in the first minute of each
          step. The answer follows a strict JSON format. Pace validates it before replacing the draft.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="card p-4">
            <Eyebrow>What AI suggests</Eyebrow>
            <ul className="mt-2 space-y-1 text-[0.95rem]">
              <li>Which steps to take, their order, and when to do them</li>
              <li>A specific title and first action for each step</li>
              <li>Two to four sentences explaining the plan</li>
              <li>Which tasks to leave for another day</li>
            </ul>
          </div>
          <div className="card p-4">
            <Eyebrow>What Pace checks</Eyebrow>
            <ul className="mt-2 space-y-1 text-[0.95rem]">
              <li>Every task and step ID matches one Pace supplied</li>
              <li>Earlier unfinished steps come first</li>
              <li>The plan fits the time budget, step length, and step count limits; the same solver trims it if needed</li>
              <li>The plan includes at most one message step, or two on high-capacity days</li>
              <li>Steps use only the parts of the day you have available</li>
            </ul>
          </div>
        </div>
        <p className="mt-3 flex items-start gap-2 text-[0.95rem] text-soft">
          <ShieldCheck aria-hidden="true" size={18} className="mt-0.5 shrink-0 text-brand" />
          If AI is slow, unavailable, or has reached its usage limit, you can keep using the local draft.
          I use correction counts in the evaluation tests. The app displays the validated plan without the repair details.
        </p>
      </Step>

      {/* 6. Learning */}
      <Step n={6} title="You can see and clear what Pace learns">
        <p className="text-soft">
          I keep Pace's learning on your device. It compares actual and estimated time for each class and kind of work,
          using the median ratio and keeping it close to 1.0 until there are three samples. It also tracks completion
          rates by part of day and uses your reflections to adjust the time budget. You can read these patterns on
          the Insights screen. These patterns are included in planning requests, and you can clear them with one button.
        </p>
      </Step>

      <footer className="mt-16 flex flex-wrap items-center justify-between gap-4 border-t border-line py-8 text-[0.9rem] text-soft">
        <span>I have made Pace open source. You can read the code and unit tests for scheduling, plan validation, and layout calculations.</span>
        <Link to={onboarded ? "/" : "/onboarding"} className="inline-flex items-center gap-1.5 font-medium text-brand-deep">
          {onboarded ? "Back to today" : "Start using Pace"} <ArrowRight aria-hidden="true" size={16} />
        </Link>
      </footer>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <motion.section
      initial={{ y: 12 }}
      whileInView={{ y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.45 }}
      className="mt-14"
    >
      <div className="flex items-baseline gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-soft font-display text-[1.05rem] text-brand-deep">{n}</span>
        <h2 className="text-[1.6rem] leading-tight">{title}</h2>
      </div>
      <div className="mt-3 pl-11">{children}</div>
    </motion.section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="tabular font-display text-[1.5rem] leading-none">{value}</p>
      <p className="mt-1 text-[0.75rem] font-semibold uppercase tracking-wider text-soft">{label}</p>
    </div>
  );
}

/**
 * Display the DP table with one row per candidate in score order and one
 * column per five-minute budget slot. Cells show the best score using the
 * first i candidates within m minutes at the full action cap. Highlight
 * chosen rows to show reconstruction.
 */
function KnapsackGrid({ candidates, budget, maxActions, chosen }: { candidates: Candidate[]; budget: number; maxActions: number; chosen: Set<string> }) {
  const cols = Math.max(1, Math.floor(budget / 5));
  const rows = candidates.slice(0, 10);
  const table = useMemo(() => {
    // Small 1-D knapsack over 5-minute slots at the action cap, for display only.
    const K = maxActions;
    let prev: number[][] = Array.from({ length: K + 1 }, () => new Array(cols + 1).fill(0));
    const out: number[][] = [];
    for (const c of rows) {
      const w = Math.max(1, Math.round(c.minutes / 5));
      const v = c.score;
      const cur = prev.map((r) => [...r]);
      for (let k = 1; k <= K; k++) for (let m = w; m <= cols; m++) cur[k][m] = Math.max(cur[k][m], prev[k - 1][m - w] + v);
      out.push(cur[K]);
      prev = cur;
    }
    return out;
  }, [rows, cols, maxActions]);
  const max = Math.max(1, ...table.flat());
  return (
    <div className="mt-4 overflow-x-auto rounded-[1rem] border border-line p-3" tabIndex={0} role="region" aria-label="Knapsack table">
      <div className="mb-2 flex items-center justify-between text-[0.78rem] uppercase tracking-wider text-soft">
        <span>candidates ↓ · minutes →</span>
        <span>dp[i][≤{maxActions} actions][m]</span>
      </div>
      <div className="space-y-1">
        {rows.map((c, i) => {
          const key = `${c.taskId}:${c.subtaskId ?? c.title}`;
          const isChosen = chosen.has(key);
          return (
            <div key={key} className="flex items-center gap-2">
              <span className={`w-40 shrink-0 truncate text-[0.8rem] ${isChosen ? "font-semibold text-ink" : "text-soft"}`} title={c.title}>
                {c.title}
              </span>
              <div className="flex flex-1 gap-[2px]">
                {table[i].slice(1).map((v, m) => (
                  <motion.span
                    key={m}
                    initial={false}
                    animate={{ opacity: v > 0 ? 0.25 + 0.75 * (v / max) : 0.08 }}
                    transition={{ duration: 0.25, delay: Math.min(0.6, (i * cols + m) * 0.002) }}
                    className={`h-3 flex-1 rounded-[2px] ${isChosen ? "bg-tint-strong" : "bg-ink"}`}
                    title={`${(m + 1) * 5} min → ${v.toFixed(1)}`}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[0.8rem] text-soft">
        Darker cells show a higher best score for that time budget. Highlighted rows are the chosen steps.
        The solver saves a layer for each candidate, then works backward through them to find the selected combination.
      </p>
    </div>
  );
}
