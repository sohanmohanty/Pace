// Check planner invariants against golden scenarios using the local engine
// and the mock planner through the validator. Live runs also score quality
// and report repair rates for prompt tuning.
//
// npm run evals: local and mock checks without network calls.
// PACE_EVAL_LIVE=1 npm run evals: also use the live model with configured
// credentials, consuming API spend or subscription allowance.

import { describe, expect, it } from "vitest";
import { mockPlan } from "../api/_lib/mock";
import { buildPlanRequest, type AIPlanContext } from "../src/ai/planner";
import { validateProposal } from "../src/logic/validate";
import { generatePlan } from "../src/logic/scheduler";
import { capacityForDial, paramsForDial } from "../src/logic/capacity";
import { PlanResponse } from "../src/shared/schema";
import { SCENARIOS, type Scenario } from "./scenarios";

const LIVE = process.env.PACE_EVAL_LIVE === "1";
/** Override the planning effort for a live run: PACE_EVAL_EFFORT=low|medium|high|xhigh */
const EFFORT = (process.env.PACE_EVAL_EFFORT as "low" | "medium" | "high" | "xhigh" | undefined) ?? "high";
const VERBOSE = process.env.PACE_EVAL_VERBOSE === "1";

function invariants(label: string, actions: { estimatedMinutes: number; subtaskId?: string; taskId: string; reason: string }[], sc: Scenario, budget: number) {
  const total = actions.reduce((s, a) => s + a.estimatedMinutes, 0);
  expect(total, `${label}: over budget`).toBeLessThanOrEqual(budget);
  const params = paramsForDial(sc.checkIn.dial ?? 50);
  for (const a of actions) expect(a.estimatedMinutes, `${label}: step too long`).toBeLessThanOrEqual(params.maxBlock);
  expect(actions.length, `${label}: too many actions`).toBeLessThanOrEqual(params.maxActions + params.maxChained);
  const ids = new Set(sc.tasks.map((t) => t.id));
  for (const a of actions) expect(ids.has(a.taskId), `${label}: unknown task`).toBe(true);
  const comm = actions.filter((a) => a.reason === "communication").length;
  expect(comm, `${label}: too many messages`).toBeLessThanOrEqual(capacityForDial(sc.checkIn.dial ?? 50) === "high" ? 2 : 1);
  // Sequence: a step's unfinished predecessors must appear earlier.
  const seen = new Set<string>();
  for (const a of actions) {
    if (!a.subtaskId) continue;
    const me = sc.subtasks.find((s) => s.id === a.subtaskId)!;
    const blockers = sc.subtasks.filter((s) => s.taskId === me.taskId && s.order < me.order && s.status !== "done" && s.type !== "communication" && !seen.has(s.id));
    if (me.type !== "communication") expect(blockers, `${label}: ${me.title} skips ${blockers[0]?.title}`).toEqual([]);
    seen.add(a.subtaskId);
  }
}

function ctxFor(sc: Scenario): AIPlanContext {
  return {
    tasks: sc.tasks,
    subtasks: sc.subtasks,
    checkIn: { id: "c", date: sc.today, createdAt: sc.today, capacity: sc.checkIn.capacity ?? "medium", ...sc.checkIn },
    profile: { id: "me", calibration: sc.calibration ?? {}, calibrationByType: {}, energy: {}, deviceToken: "eval" },
    reflections: [],
    multiplier: sc.multiplier ?? 1,
    events: sc.events ?? [],
    currentPlan: null,
    instruction: sc.instruction,
    mode: sc.instruction ? "replan" : "plan",
    today: sc.today
  };
}

describe("planner eval: local engine", () => {
  for (const sc of SCENARIOS) {
    it(sc.name, () => {
      const plan = generatePlan({ tasks: sc.tasks, subtasks: sc.subtasks, capacity: sc.checkIn.capacity ?? "medium", dial: sc.checkIn.dial, windows: sc.checkIn.windows, heavy: sc.checkIn.heavy, availableMinutes: sc.checkIn.availableMinutes, multiplier: sc.multiplier, today: sc.today });
      if (sc.tasks.some((t) => t.status !== "done")) expect(plan.actions.length, "never empty while tasks exist").toBeGreaterThan(0);
      invariants(`local/${sc.name}`, plan.actions, sc, plan.budgetMinutes);
      for (const check of sc.expectLocal ?? []) check(plan);
    });
  }
});

describe("planner eval: mock proposal through the validator", () => {
  const report: { name: string; proposed: number; kept: number; repairs: number }[] = [];
  for (const sc of SCENARIOS) {
    it(sc.name, () => {
      const { request, budget, params, capacity } = buildPlanRequest(ctxFor(sc));
      const proposal = PlanResponse.parse(mockPlan(request));
      const v = validateProposal({ proposal, tasks: sc.tasks, subtasks: sc.subtasks, budgetMinutes: budget, params, capacity, windows: request.checkIn.windows, today: sc.today });
      invariants(`mock/${sc.name}`, v.actions, sc, budget);
      report.push({ name: sc.name, proposed: proposal.actions.length, kept: v.actions.length, repairs: v.repairs.length });
    });
  }
  it("reports the repair rate", () => {
    const repairs = report.reduce((s, r) => s + r.repairs, 0);
    console.table(report);
    console.log(`mock repair rate: ${repairs}/${report.length} scenarios`);
    expect(true).toBe(true);
  });
});

describe.skipIf(!LIVE)("planner eval: live model", () => {
  const report: { name: string; proposed: number; kept: number; repairs: number; words: number; generic: number; banned: number; seconds: number }[] = [];
  for (const sc of SCENARIOS) {
    it(sc.name, async () => {
      const { resolve } = await import("../api/_lib/provider");
      const { runStructured } = await import("../api/_lib/run");
      const { PLAN_INSTRUCTIONS } = await import("../api/_lib/prompts");
      const resolved = await resolve();
      expect(resolved.mode === "key" || resolved.mode === "plan", "credentials present").toBe(true);
      const { request, budget, params, capacity } = buildPlanRequest(ctxFor(sc));
      const started = Date.now();
      const out = await runStructured({ resolved, name: "pace_plan", schema: PlanResponse, instructions: PLAN_INSTRUCTIONS, input: { text: `Today's context as JSON.\n\n${JSON.stringify(request)}` }, effort: EFFORT });
      const proposal = out.result;
      const v = validateProposal({ proposal, tasks: sc.tasks, subtasks: sc.subtasks, budgetMinutes: budget, params, capacity, windows: request.checkIn.windows, today: sc.today });
      invariants(`live/${sc.name}`, v.actions, sc, budget);

      // Rubric: concise and accurate reasoning, no guilt terms, specific titles, and a first action for each step.
      const words = proposal.reasoning.trim().split(/\s+/).length;
      const banned = (proposal.reasoning.match(/\b(overdue|late|behind|should have|failure|lazy)\b/gi) ?? []).length;
      const generic = proposal.actions.filter((a) => /^(work on|do|continue|study|start)\b/i.test(a.title.trim()) && a.title.trim().split(/\s+/).length <= 3).length;
      expect(words, "reasoning under 90 words").toBeLessThanOrEqual(90);
      expect(banned, "no guilt vocabulary").toBe(0);
      for (const a of proposal.actions) expect(a.firstAction.length, "every step has a first action").toBeGreaterThan(8);
      const seconds = Math.round((Date.now() - started) / 1000);
      if (VERBOSE) {
        console.log(
          `\n### ${sc.name} (${out.model}, ${seconds}s)\n${proposal.reasoning}\n` +
            proposal.actions.map((x) => `- ${x.minutes}m ${x.window} | ${x.title} | ${x.why} | first: ${x.firstAction}`).join("\n") +
            (v.repairs.length ? `\nREPAIRS: ${v.repairs.join("; ")}` : "")
        );
      }
      report.push({ name: sc.name, proposed: proposal.actions.length, kept: v.actions.length, repairs: v.repairs.length, words, generic, banned, seconds });
    }, 120_000);
  }
  it("reports the live repair rate", () => {
    console.table(report);
    const repairs = report.reduce((s, r) => s + r.repairs, 0);
    console.log(`live repair rate: ${repairs}/${report.length} scenarios`);
  });
});
