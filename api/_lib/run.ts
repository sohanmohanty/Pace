// Build structured requests for the current credential mode, stream text
// deltas, and return the parsed result. Plan mode forbids stored responses,
// output caps, and user identifiers; restricted options apply only in key mode.

import type OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { ZodType } from "zod";
import { classifyError, type Resolved } from "./provider.js";

export type Effort = "low" | "medium" | "high" | "xhigh";

export interface RunArgs<T> {
  resolved: Resolved;
  name: string;
  schema: ZodType<T>;
  instructions: string;
  /** User content: text, or text plus an image data URL. */
  input: { text: string; imageDataUrl?: string };
  effort: Effort;
  onDelta?: (text: string) => void;
}

export interface RunResult<T> {
  result: T;
  mode: Resolved["mode"];
  model: string;
}

export class RunError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export async function runStructured<T>(args: RunArgs<T>): Promise<RunResult<T>> {
  const { resolved, schema, name, instructions, input, effort, onDelta } = args;
  if (!resolved.client) throw new RunError("no_provider", resolved.error ?? "No AI credentials configured.", 503);
  const client = resolved.client;

  const content: OpenAI.Responses.ResponseInputContent[] = [{ type: "input_text", text: input.text }];
  if (input.imageDataUrl) {
    content.unshift({ type: "input_image", image_url: input.imageDataUrl, detail: "auto" });
  }

  const base = {
    model: resolved.model,
    instructions,
    input: [{ role: "user" as const, content }],
    reasoning: { effort },
    store: false as const
  };
  const keyOnly =
    resolved.mode === "key"
      ? { prompt_cache_key: `pace-${name}`, max_output_tokens: 8000, safety_identifier: "pace-public" }
      : {};

  try {
    try {
      return await stream(client, { ...base, ...keyOnly, text: { format: zodTextFormat(schema, name) } }, schema, resolved, onDelta);
    } catch (e) {
      // Plan mode may reject structured output formats. Fall back to asking for
      // JSON in the prompt and validating it ourselves.
      const c = classifyError(e);
      if (c.code !== "unsupported") throw e;
      const jsonInstructions = `${instructions}\n\nRespond with a single JSON object only, no prose, matching this JSON schema exactly:\n${JSON.stringify(schemaJson(schema, name))}`;
      return await stream(client, { ...base, ...keyOnly, instructions: jsonInstructions }, schema, resolved, onDelta);
    }
  } catch (e) {
    const c = classifyError(e);
    throw new RunError(c.code, c.message, c.status);
  }
}

async function stream<T>(
  client: OpenAI,
  params: Parameters<OpenAI["responses"]["stream"]>[0],
  schema: ZodType<T>,
  resolved: Resolved,
  onDelta?: (text: string) => void
): Promise<RunResult<T>> {
  const s = client.responses.stream(params);
  // Accumulate deltas because plan-mode final responses can omit output items.
  // Use the accumulated text when the final snapshot has no output text.
  let accumulated = "";
  s.on("response.output_text.delta", (e) => {
    accumulated += e.delta;
    onDelta?.(e.delta);
  });
  const final = await s.finalResponse();
  const parsed = (final as { output_parsed?: unknown }).output_parsed;
  const text = final.output_text && final.output_text.length > 0 ? final.output_text : accumulated;
  const raw = parsed ?? safeJson(text);
  const checked = schema.safeParse(raw);
  if (!checked.success) {
    throw new RunError("bad_output", `The model's answer did not match the expected shape: ${checked.error.issues[0]?.message ?? "invalid"}`, 502);
  }
  return { result: checked.data, mode: resolved.mode, model: final.model ?? resolved.model };
}

function safeJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function schemaJson(schema: ZodType, name: string): unknown {
  const fmt = zodTextFormat(schema, name) as unknown as { schema?: unknown };
  return fmt.schema ?? {};
}
