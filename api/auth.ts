// Sign in with ChatGPT, open-source token-sharing flow. Development only: it
// runs on a loopback host, registers Pace as a user-defined agent, and stores
// the rotating tokens in a git-ignored local file. The hosted site never uses
// this; it uses OPENAI_API_KEY.
//
// Routes (served by the Vite dev adapter):
//   GET  /api/auth/start   → 302 to auth.openai.com (PKCE, state, nonce)
//   GET  /callback         → exchanges the code, stores tokens, 302 /settings
//   GET  /api/auth/status  → { connected, email, expiresAt, scope }
//   POST /api/auth/logout  → removes the token file

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { clearTokens, readTokens, writeTokens, type PlanTokens } from "./_lib/provider";
import { json } from "./_lib/sse";

const AUTHORIZE = "https://auth.openai.com/api/accounts/authorize";
const TOKEN = "https://auth.openai.com/api/accounts/oauth/token";
const RESOURCE = "https://api.openai.com/v1";
const SCOPE = "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";
const AGENT_NAME = "Pace";

interface Pending {
  state: string;
  nonce: string;
  verifier: string;
  redirect_uri: string;
  client_id: string;
  created: number;
}

function pendingPath(): string {
  return path.join(path.dirname(process.env.PACE_AUTH_FILE || path.join(process.cwd(), ".pace-auth.local.json")), ".pace-auth-pending.local.json");
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hostId(): Promise<string> {
  const existing = await readTokens();
  if (existing?.host_id) return existing.host_id;
  try {
    const p = JSON.parse(await fs.readFile(pendingPath(), "utf8")) as Pending & { host_id?: string };
    if (p.host_id) return p.host_id;
  } catch {
    /* none yet */
  }
  return `urn:uuid:${randomUUID()}`;
}

function isLoopback(url: URL): boolean {
  return url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "[::1]";
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const route = url.pathname;

  if (route.endsWith("/api/auth/status")) {
    const t = await readTokens();
    return json({
      connected: Boolean(t),
      email: t?.email ?? null,
      expiresAt: t ? new Date(t.expires_at).toISOString() : null,
      planUsage: t?.scope?.includes("chatgpt.tokens.use.direct") ?? false,
      clientId: t?.client_id ?? null
    });
  }

  if (route.endsWith("/api/auth/start")) {
    if (!isLoopback(url)) return json({ error: "Sign in with ChatGPT runs only on a local dev host." }, 400);
    const existing = await readTokens();
    const verifier = b64url(randomBytes(48));
    const challenge = b64url(createHash("sha256").update(verifier).digest());
    const state = b64url(randomBytes(24));
    const nonce = b64url(randomBytes(24));
    const host = await hostId();
    // The spec requires the 127.0.0.1 loopback form for the callback.
    const redirect_uri = `http://127.0.0.1:${url.port || "80"}/callback`;
    const client_id = existing?.client_id || "dynamic_agent_client";
    const pending: Pending & { host_id: string } = { state, nonce, verifier, redirect_uri, client_id, created: Date.now(), host_id: host };
    await fs.writeFile(pendingPath(), JSON.stringify(pending), { mode: 0o600 });

    const q = new URLSearchParams({
      client_id,
      ext_agent_host_id: host,
      response_type: "code",
      redirect_uri,
      scope: SCOPE,
      resource: RESOURCE,
      state,
      nonce,
      code_challenge_method: "S256",
      code_challenge: challenge
    });
    if (client_id === "dynamic_agent_client") q.set("agent_name_hint", AGENT_NAME);
    if (existing?.id_token) q.set("id_token_hint", existing.id_token);
    return Response.redirect(`${AUTHORIZE}?${q.toString()}`, 302);
  }

  if (route === "/callback" || route.endsWith("/callback")) {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");
    if (error) return redirectTo(url, `/settings?ai=error&reason=${encodeURIComponent(error)}`);
    let pending: Pending & { host_id: string };
    try {
      pending = JSON.parse(await fs.readFile(pendingPath(), "utf8"));
    } catch {
      return json({ error: "No sign-in in progress. Start again from Settings." }, 400);
    }
    if (!code || !state || state !== pending.state) return json({ error: "State mismatch. Start again from Settings." }, 400);

    // The issued client id may come back on the callback; fall back to the pending one.
    const issued = url.searchParams.get("client_id") || url.searchParams.get("issued_client_id") || pending.client_id;
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: issued,
      code,
      code_verifier: pending.verifier,
      redirect_uri: pending.redirect_uri,
      resource: RESOURCE
    });
    const res = await fetch(TOKEN, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
    if (!res.ok) {
      const text = await res.text();
      return json({ error: `Token exchange failed (${res.status})`, detail: text.slice(0, 500) }, 502);
    }
    const tok = (await res.json()) as {
      access_token: string;
      refresh_token: string;
      id_token?: string;
      expires_in?: number;
      scope?: string;
      client_id?: string;
      earliest_refresh_at?: number | string;
    };
    const email = tok.id_token ? emailFromIdToken(tok.id_token) : undefined;
    const tokens: PlanTokens = {
      client_id: tok.client_id || issued,
      host_id: pending.host_id,
      access_token: tok.access_token,
      refresh_token: tok.refresh_token,
      id_token: tok.id_token,
      scope: tok.scope,
      expires_at: Date.now() + (tok.expires_in ?? 3600) * 1000,
      earliest_refresh_at: tok.earliest_refresh_at ? Number(new Date(tok.earliest_refresh_at)) || Number(tok.earliest_refresh_at) * 1000 : undefined,
      email,
      obtained_at: Date.now()
    };
    await writeTokens(tokens);
    await fs.unlink(pendingPath()).catch(() => undefined);
    const granted = tokens.scope?.includes("chatgpt.tokens.use.direct");
    return redirectTo(url, `/settings?ai=${granted ? "connected" : "noplan"}`);
  }

  return json({ error: "Not found" }, 404);
}

export async function POST(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname.endsWith("/api/auth/logout")) {
    await clearTokens();
    return json({ ok: true });
  }
  return json({ error: "Not found" }, 404);
}

/** Response.redirect needs an absolute URL; resolve against the request origin. */
function redirectTo(current: URL, path: string): Response {
  return Response.redirect(new URL(path, current.origin).toString(), 302);
}

function emailFromIdToken(idToken: string): string | undefined {
  try {
    const payload = idToken.split(".")[1];
    const jsonStr = Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const claims = JSON.parse(jsonStr) as { email?: string };
    return claims.email;
  } catch {
    return undefined;
  }
}

export default GET;
