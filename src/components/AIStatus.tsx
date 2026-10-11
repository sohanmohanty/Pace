import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle2, CircleAlert, LogIn, LogOut, RefreshCw } from "lucide-react";
import { ai } from "../ai/client";
import type { HealthResponse } from "../shared/schema";
import { Button, Chip, Eyebrow } from "./ui";

const isLocal =
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

/** Settings panel: which credential mode the server is in, and the dev sign-in. */
export function AIStatus() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [params] = useSearchParams();
  const flag = params.get("ai");

  async function check(models = false) {
    setChecking(true);
    setError(null);
    try {
      setHealth(await ai.health(models));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    check(false);
  }, []);

  const mode = health?.mode;
  const label =
    mode === "key" ? "Connected with an API key" :
    mode === "plan" ? `Connected to your ChatGPT plan${health?.connectedAs ? ` as ${health.connectedAs}` : ""}` :
    mode === "mock" ? "Mock mode (no network, canned answers)" :
    mode === "none" ? "Not connected. Pace plans on this device." : "Checking…";

  return (
    <div className="space-y-3">
      <Eyebrow>AI connection</Eyebrow>
      {flag === "connected" && (
        <p className="rounded-[0.75rem] bg-good-soft px-3 py-2 text-[0.92rem] text-good">Signed in. Your ChatGPT plan now powers planning on this machine.</p>
      )}
      {flag === "noplan" && (
        <p className="rounded-[0.75rem] bg-warn-soft px-3 py-2 text-[0.92rem] text-warn">Signed in, but the account did not grant plan usage. Check your ChatGPT plan, then try again.</p>
      )}
      {flag === "error" && (
        <p className="rounded-[0.75rem] bg-danger-soft px-3 py-2 text-[0.92rem] text-danger">Sign-in was cancelled or failed: {params.get("reason")}</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {mode && mode !== "none" ? (
          <CheckCircle2 aria-hidden="true" size={18} className="text-good" />
        ) : (
          <CircleAlert aria-hidden="true" size={18} className="text-soft" />
        )}
        <p className="text-[0.95rem]">{label}</p>
      </div>
      {health && (
        <div className="flex flex-wrap gap-1.5">
          <Chip>model {health.model}</Chip>
          {health.modelAvailable === true && <Chip tone="good">model available</Chip>}
          {health.modelAvailable === false && <Chip>not in the listed models; Pace still requests it and falls back on device if refused</Chip>}
          {health.expiresAt && <Chip>token renews automatically</Chip>}
        </div>
      )}
      {health?.availableModels && (
        <details className="text-[0.9rem] text-soft">
          <summary className="cursor-pointer font-medium text-brand-deep">Models this credential can use</summary>
          <p className="mt-1 break-words">{health.availableModels.join(", ")}</p>
        </details>
      )}
      {(error || health?.error) && <p className="text-[0.9rem] text-danger">{error ?? health?.error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" size="sm" onClick={() => check(true)} disabled={checking}>
          <RefreshCw aria-hidden="true" size={15} className={checking ? "animate-spin" : ""} />
          Test connection
        </Button>
        {isLocal && mode !== "key" && mode !== "mock" && (
          <a
            href="/api/auth/start"
            className="inline-flex min-h-9 items-center gap-2 rounded-[0.7rem] bg-brand px-3 text-[0.9rem] font-medium text-on-brand hover:bg-brand-deep"
          >
            <LogIn aria-hidden="true" size={15} />
            {mode === "plan" ? "Sign in again" : "Sign in with ChatGPT"}
          </a>
        )}
        {isLocal && mode === "plan" && (
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              check(false);
            }}
          >
            <LogOut aria-hidden="true" size={15} />
            Disconnect
          </Button>
        )}
      </div>
    </div>
  );
}
