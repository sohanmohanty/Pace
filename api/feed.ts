// Fetch Canvas and Google Calendar feeds through the server to avoid browser
// cross-origin restrictions. Accept only HTTPS calendar-feed URLs, and do
// not store or log their contents.

import { json, readJson } from "./_lib/sse.js";

const MAX_BYTES = 2_000_000;
const ALLOWED_HOST = /(\.instructure\.com|canvas\.|calendar\.google\.com|\.ics$)/i;

export async function POST(request: Request): Promise<Response> {
  const body = (await readJson(request)) as { url?: string } | null;
  const raw = body?.url?.trim();
  if (!raw) return json({ error: "missing_url", message: "Paste a calendar feed link." }, 400);
  let url: URL;
  try {
    url = new URL(raw.replace(/^webcal:\/\//i, "https://"));
  } catch {
    return json({ error: "bad_url", message: "That doesn't look like a link." }, 400);
  }
  if (url.protocol !== "https:") return json({ error: "bad_url", message: "Feed links must start with https." }, 400);
  if (!ALLOWED_HOST.test(url.hostname) && !ALLOWED_HOST.test(url.pathname)) {
    return json({ error: "unsupported_host", message: "Only Canvas and Google Calendar feed links are supported." }, 400);
  }
  if (isPrivateHost(url.hostname)) return json({ error: "bad_url", message: "That host is not allowed." }, 400);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "text/calendar, text/plain;q=0.9, */*;q=0.1", "user-agent": "Pace feed sync (planwithpace.app)" },
      redirect: "follow"
    });
    if (!res.ok) return json({ error: "fetch_failed", message: `The feed returned ${res.status}.` }, 502);
    const text = await res.text();
    if (text.length > MAX_BYTES) return json({ error: "too_large", message: "That feed is too large." }, 413);
    if (!/BEGIN:VCALENDAR/i.test(text)) return json({ error: "not_ics", message: "That link didn't return a calendar." }, 400);
    return new Response(text, { status: 200, headers: { "content-type": "text/calendar; charset=utf-8", "cache-control": "no-store" } });
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return json({ error: aborted ? "timeout" : "fetch_failed", message: aborted ? "The feed took too long." : "Couldn't fetch that feed." }, 502);
  } finally {
    clearTimeout(timer);
  }
}

function isPrivateHost(host: string): boolean {
  if (host === "localhost" || host.endsWith(".local")) return true;
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || a === 0 || a === 169;
}

export default POST;
