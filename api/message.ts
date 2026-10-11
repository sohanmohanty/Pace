import { structuredEndpoint } from "./_lib/handler.js";
import { mockMessage } from "./_lib/mock.js";
import { MESSAGE_INSTRUCTIONS } from "./_lib/prompts.js";
import { MessageRequest, MessageResponse } from "../src/shared/schema.js";

export const POST = structuredEndpoint({
  name: "pace_message",
  request: MessageRequest,
  response: MessageResponse,
  instructions: MESSAGE_INSTRUCTIONS,
  effort: "medium",
  toInput: (req) => ({ text: `Draft the message. JSON:\n\n${JSON.stringify(req)}` }),
  mock: mockMessage
});

/** Streaming model calls can run past Vercel's default function timeout. */
export const maxDuration = 60;

export default POST;
