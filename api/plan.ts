import { structuredEndpoint } from "./_lib/handler.js";
import { mockPlan } from "./_lib/mock.js";
import { PLAN_INSTRUCTIONS } from "./_lib/prompts.js";
import { PlanRequest, PlanResponse } from "../src/shared/schema.js";

export const POST = structuredEndpoint({
  name: "pace_plan",
  request: PlanRequest,
  response: PlanResponse,
  instructions: PLAN_INSTRUCTIONS,
  effort: "low",
  toInput: (req) => ({
    text: `Today's context as JSON. ${req.mode === "replan" ? "This is a REPLAN for the rest of today." : "Build today's plan."}\n\n${JSON.stringify(req)}`
  }),
  mock: mockPlan
});

/** Streaming model calls can run past Vercel's default function timeout. */
export const maxDuration = 60;

