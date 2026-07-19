import { useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { loadDemoData } from "../data/demo";
import { updateSettings } from "../data/repo";
import { SettingsContext } from "../lib/settingsContext";
import { Button, Card } from "../components/ui";

export function Onboarding() {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [dest, setDest] = useState<string | null>(null);
  const settings = useContext(SettingsContext);
  const navigate = useNavigate();

  // Navigate only after the settings change has reached React state.
  // Navigating right after the DB write lets the route guard read the stale
  // "not onboarded" value and bounce back here, restarting onboarding.
  useEffect(() => {
    if (dest && settings?.onboarded) navigate(dest, { replace: true });
  }, [dest, settings, navigate]);

  async function finish(to: string) {
    setBusy(true);
    await updateSettings({ onboarded: true });
    setDest(to);
  }

  return (
    <div className="flex min-h-[80dvh] flex-col justify-center lg:mx-auto lg:max-w-xl">
      <div className="mb-6 flex items-center justify-between">
        <p className="text-xl font-semibold tracking-tight text-brand-deep">Pace</p>
        <button
          className="font-medium text-soft underline underline-offset-2 disabled:opacity-50"
          onClick={() => finish("/")}
          disabled={busy}
        >
          Skip
        </button>
      </div>

      {step === 0 && (
        <Card>
          <h1 className="text-[1.5rem] font-semibold leading-tight">
            A realistic plan for getting back on track.
          </h1>
          <p className="mt-3 text-soft">
            Pace helps you restart after falling behind: an absence, a hard stretch, a pile-up.
            You don't need to explain why. Start with what's on your plate, check in with how
            today feels, and get a plan that matches your actual capacity.
          </p>
          <p className="mt-3 text-soft">Small steps count here. That's the whole point.</p>
          <Button size="lg" className="mt-5" onClick={() => setStep(1)}>
            Next
          </Button>
        </Card>
      )}

      {step === 1 && (
        <Card>
          <h1 className="text-[1.5rem] font-semibold leading-tight">Private by design.</h1>
          <ul className="mt-3 space-y-2 text-soft">
            <li>• No account, no sign-in.</li>
            <li>• Pace never asks for a diagnosis or medical details.</li>
            <li>• Your data stays on this device. Export or delete it anytime.</li>
            <li>• No trackers, no analytics.</li>
          </ul>
          <p className="mt-3 text-[0.9rem] text-soft">
            Pace is a planning tool, not a medical tool, and doesn't provide medical advice.
          </p>
          <Button size="lg" className="mt-5" onClick={() => setStep(2)}>
            Next
          </Button>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <h1 className="text-[1.5rem] font-semibold leading-tight">Where do you want to start?</h1>
          <div className="mt-5 space-y-2">
            <Button size="lg" disabled={busy} onClick={() => finish("/add")}>
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
              Show me some example tasks
            </Button>
            <Button variant="ghost" size="lg" disabled={busy} onClick={() => finish("/")}>
              Just look around
            </Button>
          </div>
        </Card>
      )}

      <div className="mt-4 flex justify-center gap-1.5" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={`h-2 w-2 rounded-full ${i === step ? "bg-brand" : "bg-line"}`}
          />
        ))}
      </div>
      <p className="visually-hidden" aria-live="polite">
        Step {step + 1} of 3
      </p>
    </div>
  );
}
