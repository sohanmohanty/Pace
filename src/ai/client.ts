// Read /api/* responses as server-sent events and validate their results
// against the shared schemas. Typed errors let screens choose a fallback,
// request sign-in, or pause.

import { todayISO } from "../lib/dates";
import {
  BreakdownResponse,
  ExtractResponse,
  MessageResponse,
  PlanResponse,
  type BreakdownRequest,
  type ExtractRequest,
  type HealthResponse,
  type MessageRequest,
  type PlanRequest
} from "../shared/schema";
import type { ZodType } from "zod";

export type AIErrorCode =
  | "no_provider"
  | "reauth"
  | "plan_limit"
  | "rate_limit"
  | "unsupported"
  | "bad_output"
  | "network"
  | "timeout"
  | "provider"
  | "unknown";

export class AIError extends Error {
  code: AIErrorCode;
  constructor(code: AIErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export interface StreamHandlers {
  /** Raw text as the model writes it (JSON for structured calls). */
  onDelta?: (accumulated: string) => void;
  signal?: AbortSignal;
  timeoutMs?: number;
}

let deviceTokenCache: string | null = null;
export function setDeviceToken(t: string) {
  deviceTokenCache = t;
}

async function streamCall<T>(path: string, body: unknown, schema: ZodType<T>, handlers: StreamHandlers = {}): Promise<{ result: T; mode: string; model: string }> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(new AIError("timeout", "The planner took too long.")), handlers.timeoutMs ?? 60_000);
  handlers.signal?.addEventListener("abort", () => controller.abort(handlers.signal?.reason));

  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json", ...(deviceTokenCache ? { "x-pace-device": deviceTokenCache } : {}) },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (e) {
    window.clearTimeout(timeout);
    if (e instanceof AIError) throw e;
    throw new AIError("network", "Couldn't reach the planner.");
  }

  if (!response.ok || !response.body) {
    window.clearTimeout(timeout);
    let message = `The planner returned ${response.status}.`;
    try {
      const errorBody = (await response.json()) as { message?: string; error?: string };
      message = errorBody.message ?? errorBody.error ?? message;
    } catch {
      /* keep default */
    }
    throw new AIError(response.status === 503 ? "no_provider" : response.status === 429 ? "rate_limit" : "provider", message);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let accumulated = "";
  let done: { result: unknown; mode: string; model: string } | null = null;
  let error: { code: string; message: string } | null = null;

  const handle = (event: string, data: string) => {
    try {
      const parsed = JSON.parse(data) as Record<string, unknown>;
      if (event === "delta") {
        accumulated += String(parsed.text ?? "");
        handlers.onDelta?.(accumulated);
      } else if (event === "done") {
        done = parsed as { result: unknown; mode: string; model: string };
      } else if (event === "error") {
        error = parsed as { code: string; message: string };
      }
    } catch {
      /* ignore malformed frame */
    }
  };

  try {
    for (;;) {
      const { value, done: finished } = await reader.read();
      if (finished) break;
      buffer += decoder.decode(value, { stream: true });
      let frameEnd: number;
      while ((frameEnd = buffer.indexOf("\n\n")) >= 0) {
        const frame = buffer.slice(0, frameEnd);
        buffer = buffer.slice(frameEnd + 2);
        if (!frame || frame.startsWith(":")) continue;
        let event = "message";
        const dataLines: string[] = [];
        for (const line of frame.split("\n")) {
          if (line.startsWith("event:")) event = line.slice(6).trim();
          else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
        }
        handle(event, dataLines.join("\n"));
      }
    }
  } catch (e) {
    if (e instanceof AIError) throw e;
    if (controller.signal.aborted && controller.signal.reason instanceof AIError) throw controller.signal.reason;
    throw new AIError("network", "The connection dropped while planning.");
  } finally {
    window.clearTimeout(timeout);
  }

  if (error) {
    const streamError = error as { code: string; message: string };
    throw new AIError((streamError.code as AIErrorCode) ?? "unknown", streamError.message);
  }
  if (!done) throw new AIError("bad_output", "The planner ended without an answer.");
  const finished = done as { result: unknown; mode: string; model: string };
  const checked = schema.safeParse(finished.result);
  if (!checked.success) throw new AIError("bad_output", "The planner's answer had the wrong shape.");
  return { result: checked.data, mode: finished.mode, model: finished.model };
}

export const ai = {
  plan: (req: PlanRequest, h?: StreamHandlers) => streamCall("/api/plan", req, PlanResponse, { timeoutMs: 90_000, ...h }),
  breakdown: (req: BreakdownRequest, h?: StreamHandlers) => streamCall("/api/breakdown", req, BreakdownResponse, h),
  extract: (req: ExtractRequest, h?: StreamHandlers) => streamCall("/api/extract", req, ExtractResponse, { timeoutMs: 90_000, ...h }),
  message: (req: MessageRequest, h?: StreamHandlers) => streamCall("/api/message", req, MessageResponse, h),
  health: async (models = false): Promise<HealthResponse> => {
    const res = await fetch(`/api/health${models ? "?models=1" : ""}`, { cache: "no-store" });
    if (!res.ok) throw new AIError("provider", `Health check failed (${res.status}).`);
    return (await res.json()) as HealthResponse;
  }
};

/**
 * Read reasoning from incomplete streamed JSON so the screen can display it
 * before the plan arrives. The schema lists reasoning first.
 */
export function partialReasoning(jsonSoFar: string): string {
  const key = jsonSoFar.indexOf('"reasoning"');
  if (key < 0) return "";
  const colon = jsonSoFar.indexOf(":", key);
  if (colon < 0) return "";
  const open = jsonSoFar.indexOf('"', colon);
  if (open < 0) return "";
  let out = "";
  for (let i = open + 1; i < jsonSoFar.length; i++) {
    const ch = jsonSoFar[i];
    if (ch === "\\") {
      const next = jsonSoFar[i + 1];
      if (next === undefined) break;
      if (next === "n") out += "\n";
      else if (next === "u") {
        const hex = jsonSoFar.slice(i + 2, i + 6);
        if (hex.length === 4) out += String.fromCharCode(parseInt(hex, 16));
        i += 4;
      } else out += next;
      i++;
      continue;
    }
    if (ch === '"') break;
    out += ch;
  }
  return out;
}

export function nowHHMM(d = new Date()): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function weekdayName(d = new Date()): string {
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d.getDay()];
}

export { todayISO };
