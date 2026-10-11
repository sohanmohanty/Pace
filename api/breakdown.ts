import { structuredEndpoint } from "./_lib/handler.js";
import { mockBreakdown } from "./_lib/mock.js";
import { BREAKDOWN_INSTRUCTIONS } from "./_lib/prompts.js";
import { BreakdownRequest, BreakdownResponse } from "../src/shared/schema.js";

export const POST = structuredEndpoint({
  name: "pace_breakdown",
  request: BreakdownRequest,
  response: BreakdownResponse,
  instructions: BREAKDOWN_INSTRUCTIONS,
  effort: "medium",
  toInput: (req) => ({ text: `Break this task into steps. JSON:\n\n${JSON.stringify(req)}` }),
  mock: mockBreakdown
});

/** Streaming model calls can run past Vercel's default function timeout. */
export const maxDuration = 60;

