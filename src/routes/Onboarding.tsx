import { useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Wordmark } from "../components/Logo";
import { Button } from "../components/ui";
import { loadDemoData } from "../data/demo";
import { updateSettings } from "../data/repo";
import { SettingsContext } from "../lib/settingsContext";

/** Two onboarding screens: privacy, then a choice of where to start. */
export function Onboarding() {
  const [step, setStep] = useState<1 | 2>(1);
  const [busy, setBusy] = useState(false);
  const [dest, setDest] = useState<string | null>(null);
  const settings = useContext(SettingsContext);
  const navigate = useNavigate();

  // Navigate only after the settings change has reached React state, so the
  // route guard does not read a stale "not onboarded" flag and redirect back here.
  useEffect(() => {
    if (dest && settings?.onboarded) navigate(dest, { replace: true });
  }, [dest, settings, navigate]);

  async function finish(to: string) {
    setBusy(true);
    await updateSettings({ onboarded: true });
    setDest(to);
  }

  return (
    <div className="mx-auto flex min-h-[85dvh] max-w-xl flex-col justify-center">
      <div className="mb-6 flex items-center justify-between">
        <Wordmark />
        <button
          type="button"
          className="font-medium text-soft underline underline-offset-4 disabled:opacity-50"
          onClick={() => finish("/")}
          disabled={busy}
        >
          Skip
        </button>
      </div>

      {step === 1 && (
        <div className="rise card space-y-4 p-6">
          <h1 className="text-[1.8rem] leading-tight">You never have to explain why.</h1>
          <ul className="space-y-2 text-soft">
            <li>• No account, no sign-in. Your tasks live on this device.</li>
            <li>
              • To plan, Pace sends your task titles, dates, and how today feels to its planner. Not
              your notes, not your name.
            </li>
            <li>• No trackers. Export or delete everything anytime.</li>
          </ul>
          <Button size="lg" onClick={() => setStep(2)}>
            Next
          </Button>
        </div>
      )}

      {step === 2 && (
        <div className="rise card space-y-4 p-6">
          <h1 className="text-[1.8rem] leading-tight">Where do you want to start?</h1>
          <div className="space-y-2">
            <Button size="lg" disabled={busy} onClick={() => finish("/capture")}>
              Add what's on my plate
            </Button>
            <Button
              variant="soft"
              size="lg"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await loadDemoData();
                await finish("/");
              }}
            >
              Show me with example tasks
            </Button>
            <Button variant="ghost" size="lg" disabled={busy} onClick={() => finish("/")}>
              Just look around
            </Button>
          </div>
        </div>
      )}

      <div className="mt-5 flex justify-center gap-1.5" aria-hidden="true">
        {[1, 2].map((i) => (
          <span key={i} className={`h-2 w-2 rounded-full ${i === step ? "bg-brand" : "bg-line"}`} />
        ))}
      </div>
      <p className="visually-hidden" aria-live="polite">
        Step {step} of 2
      </p>
    </div>
  );
}
