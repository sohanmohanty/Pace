import { listModelIds, resolve } from "./_lib/provider.js";
import { json } from "./_lib/sse.js";
import type { HealthResponse } from "../src/shared/schema.js";

/** Report AI availability; safe to call repeatedly. List models only on request. */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const wantModels = url.searchParams.get("models") === "1";
  const r = await resolve();
  const out: HealthResponse = {
    mode: r.mode,
    model: r.model,
    modelAvailable: r.mode === "mock" ? true : null,
    connectedAs: r.tokens?.email ?? null,
    expiresAt: r.tokens ? new Date(r.tokens.expires_at).toISOString() : null,
    error: r.error
  };
  if (wantModels && r.client) {
    try {
      const ids = await listModelIds(r);
      out.availableModels = ids.slice(0, 60);
      out.modelAvailable = ids.length === 0 ? null : ids.includes(r.model);
    } catch (e) {
      out.error = e instanceof Error ? e.message : String(e);
    }
  }
  return json(out);
}

