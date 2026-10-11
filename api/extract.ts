import { structuredEndpoint } from "./_lib/handler.js";
import { mockExtract } from "./_lib/mock.js";
import { EXTRACT_INSTRUCTIONS } from "./_lib/prompts.js";
import { ExtractRequest, ExtractResponse } from "../src/shared/schema.js";

export const POST = structuredEndpoint({
  name: "pace_extract",
  request: ExtractRequest,
  response: ExtractResponse,
  instructions: EXTRACT_INSTRUCTIONS,
  effort: "medium",
  toInput: (req) => ({
    text: `Extract tasks and events. Today is ${req.today}. Known courses: ${req.knownCourses.join(", ") || "none"}. Term ends: ${req.termEnd ?? "unknown"}.\n\n${req.text ? `TEXT:\n${req.text}` : "The image is attached."}`,
    imageDataUrl: req.image ?? undefined
  }),
  mock: mockExtract
});

/** Streaming model calls can run past Vercel's default function timeout. */
export const maxDuration = 60;

export default POST;
