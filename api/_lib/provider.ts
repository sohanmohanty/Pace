// Resolve credentials for the AI layer:
//
//   key   OPENAI_API_KEY is set (the public site on Vercel). Normal API billing.
//   plan  A local token file from Sign in with ChatGPT for development.
//   mock  PACE_AI_MOCK=1. Canned answers, no network. For UI work and tests.
//   none  Nothing configured. The client falls back to the on-device engine.
//
// Plan mode follows OpenAI's open-source token-sharing flow: Responses API
// only, `store: false`, `stream: true`, no output caps or user identifiers.

import OpenAI, { type APIError } from "openai";
import { promises as fs } from "node:fs";
import path from "node:path";

export type Mode = "key" | "plan" | "mock" | "none";

export const MODEL = process.env.PACE_MODEL || "gpt-6-luna";

export interface PlanTokens {
  client_id: string;
  host_id: string;
  access_token: string;
  refresh_token: string;
  id_token?: string;
  scope?: string;
  /** Unix ms. */
  expires_at: number;
  earliest_refresh_at?: number;
  email?: string;
  obtained_at: number;
}

export interface Resolved {
  mode: Mode;
  client: OpenAI | null;
  model: string;
  tokens?: PlanTokens;
  error?: string;
}

const TOKEN_ENDPOINT = "https://auth.openai.com/api/accounts/oauth/token";
const RESOURCE = "https://api.openai.com/v1";

export function tokenFilePath(): string {
  return process.env.PACE_AUTH_FILE || path.join(process.cwd(), ".pace-auth.local.json");
}

export async function readTokens(): Promise<PlanTokens | null> {
  try {
    const raw = await fs.readFile(tokenFilePath(), "utf8");
    const parsed = JSON.parse(raw) as PlanTokens;
    if (!parsed.access_token || !parsed.refresh_token) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function writeTokens(t: PlanTokens): Promise<void> {
  await fs.writeFile(tokenFilePath(), JSON.stringify(t, null, 2), { mode: 0o600 });
}

export async function clearTokens(): Promise<void> {
  try {
    await fs.unlink(tokenFilePath());
  } catch {
    /* already gone */
  }
}

/** Refresh when within 5 minutes of expiry. Rotating refresh tokens are replaced together. */
export async function refreshIfNeeded(t: PlanTokens): Promise<PlanTokens> {
  const soon = Date.now() + 5 * 60 * 1000;
  if (t.expires_at > soon) return t;
  if (t.earliest_refresh_at && Date.now() < t.earliest_refresh_at && t.expires_at > Date.now()) return t;
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: t.client_id,
    refresh_token: t.refresh_token,
    resource: RESOURCE
  });
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });
  if (!res.ok) {
    const text = await res.text();
    throw new PlanAuthError(`refresh failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    id_token?: string;
    expires_in?: number;
    scope?: string;
    earliest_refresh_at?: number | string;
  };
  const next: PlanTokens = {
    ...t,
    access_token: json.access_token,
    refresh_token: json.refresh_token ?? t.refresh_token,
    id_token: json.id_token ?? t.id_token,
    scope: json.scope ?? t.scope,
    expires_at: Date.now() + (json.expires_in ?? 3600) * 1000,
    earliest_refresh_at: json.earliest_refresh_at ? Number(new Date(json.earliest_refresh_at)) || Number(json.earliest_refresh_at) * 1000 : undefined,
    obtained_at: Date.now()
  };
  await writeTokens(next);
  return next;
}

export class PlanAuthError extends Error {}

export async function resolve(): Promise<Resolved> {
  if (process.env.PACE_AI_MOCK === "1") {
    return { mode: "mock", client: null, model: `${MODEL} (mock)` };
  }
  const key = process.env.OPENAI_API_KEY;
  if (key) {
    return {
      mode: "key",
      client: new OpenAI({ apiKey: key, timeout: 90_000, maxRetries: 1 }),
      model: MODEL
    };
  }
  const stored = await readTokens();
  if (stored) {
    try {
      const tokens = await refreshIfNeeded(stored);
      return {
        mode: "plan",
        client: new OpenAI({ apiKey: tokens.access_token, baseURL: RESOURCE, timeout: 90_000, maxRetries: 0 }),
        model: MODEL,
        tokens
      };
    } catch (e) {
      return { mode: "none", client: null, model: MODEL, error: e instanceof Error ? e.message : String(e) };
    }
  }
  return { mode: "none", client: null, model: MODEL };
}

/** Models visible to the current credential. Plan mode lists what the subscription allows. */
export async function listModelIds(r: Resolved): Promise<string[]> {
  if (!r.client) return [];
  if (r.mode === "plan" && r.tokens) {
    // The plan-usage models endpoint answers { models: [{ slug, visibility, ... }] },
    // not the SDK's { data: [...] } page shape.
    const res = await fetch(`${RESOURCE}/models`, { headers: { authorization: `Bearer ${r.tokens.access_token}` } });
    if (!res.ok) throw new Error(`models list failed (${res.status})`);
    const json = (await res.json()) as { models?: { slug?: string; id?: string; visibility?: string }[]; data?: { id: string }[] };
    const list = json.models ?? json.data ?? [];
    return list
      .filter((m) => !("visibility" in m) || m.visibility === "list")
      .map((m) => (m as { slug?: string; id?: string }).slug ?? (m as { id?: string }).id ?? "")
      .filter(Boolean);
  }
  const out: string[] = [];
  for await (const m of r.client.models.list()) out.push(m.id);
  return out;
}

/** Map provider failures to stable codes the client can act on. */
export function classifyError(e: unknown): { code: string; message: string; status: number } {
  if (e instanceof PlanAuthError) return { code: "reauth", message: e.message, status: 401 };
  if (e instanceof OpenAI.APIError) {
    const err = e as APIError & { error?: { code?: string; param?: string; message?: string } };
    const code = (err.error && (err.error as { code?: string }).code) || err.code || "";
    if (code === "subscription_sharing_usage_limit_exceeded") {
      return { code: "plan_limit", message: "Your ChatGPT plan's allowance for Pace is used up for now.", status: 429 };
    }
    if (code === "subscription_sharing_unsupported_capability") {
      return { code: "unsupported", message: `Not available on your plan: ${(err.error as { param?: string })?.param ?? "feature"}`, status: 400 };
    }
    if (err.status === 401) return { code: "reauth", message: "Sign in to ChatGPT again.", status: 401 };
    if (err.status === 429) return { code: "rate_limit", message: "Too many requests right now.", status: 429 };
    return { code: "provider", message: err.message, status: err.status ?? 502 };
  }
  return { code: "unknown", message: e instanceof Error ? e.message : String(e), status: 500 };
}
