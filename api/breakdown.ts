import { structuredEndpoint } from "./_lib/handler";
import { mockBreakdown } from "./_lib/mock";
import { BREAKDOWN_INSTRUCTIONS } from "./_lib/prompts";
import { BreakdownRequest, BreakdownResponse } from "../src/shared/schema";

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

export default POST;
