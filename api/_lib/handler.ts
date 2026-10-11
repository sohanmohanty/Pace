// Shared flow for the four structured endpoints: validate input, resolve
// credentials or mock mode, stream deltas, and return a validated result.

import type { ZodType } from "zod";
import { chunked } from "./mock";
import { resolve } from "./provider";
import { checkLimit } from "./ratelimit";
import { runStructured, type Effort } from "./run";
import { json, readJson, sse } from "./sse";

export function structuredEndpoint<Req, Res>(opts: {
  name: string;
  request: ZodType<Req>;
  response: ZodType<Res>;
  instructions: string;
  effort: Effort;
  /** Turn the validated request into the user message (and optional image). */
  toInput: (req: Req) => { text: string; imageDataUrl?: string };
  mock: (req: Req) => Res;
}) {
  return async function POST(request: Request): Promise<Response> {
    const body = await readJson(request);
    const parsed = opts.request.safeParse(body);
    if (!parsed.success) {
      return json({ error: "bad_request", message: parsed.error.issues[0]?.message ?? "Invalid request" }, 400);
    }
    const req = parsed.data;
    const resolved = await resolve();
    if (resolved.mode === "key") {
      const limit = await checkLimit(request);
      if (!limit.allowed) {
        return json(
          { error: "rate_limit", message: "Pace has planned a lot for this device today. The on-device planner is still here; the AI planner comes back tomorrow." },
          429
        );
      }
    }
    const { response, send, close } = sse();

    (async () => {
      try {
        if (resolved.mode === "mock") {
          const result = opts.mock(req);
          for await (const piece of chunked(JSON.stringify(result))) send("delta", { text: piece });
          send("done", { result, mode: "mock", model: resolved.model });
          return;
        }
        if (resolved.mode === "none") {
          send("error", { code: "no_provider", message: resolved.error ?? "AI is not connected on this server." });
          return;
        }
        const out = await runStructured({
          resolved,
          name: opts.name,
          schema: opts.response,
          instructions: opts.instructions,
          input: opts.toInput(req),
          effort: opts.effort,
          onDelta: (text) => send("delta", { text })
        });
        send("done", { result: out.result, mode: out.mode, model: out.model });
      } catch (e) {
        const err = e as { code?: string; message?: string };
        send("error", { code: err.code ?? "unknown", message: err.message ?? "Something went wrong." });
      } finally {
        close();
      }
    })();

    return response;
  };
}
