import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Link } from "react-router-dom";
import { RotateCcw } from "lucide-react";
import { useToast } from "../components/Toast";
import { Button, Card, Chip, Eyebrow, PageHeader, SectionTitle } from "../components/ui";
import { getProfile, listPlansSince, listReflections, listSessionsSince, resetLearning } from "../data/repo";
import { DAY_WINDOWS } from "../data/types";
import { addDaysISO, parseISODate, todayISO } from "../lib/dates";
import { capacityMultiplier, multiplierLabel } from "../logic/adaptation";
import { WINDOW_LABELS, WORK_TYPE_LABELS } from "../logic/capacity";
import { learnedSentences } from "../logic/learning";

// Show the three learned estimates with their supporting numbers and a
// reset control. Keep the presentation descriptive, without judgments.

export function Insights() {
  const toast = useToast();
  const profile = useLiveQuery(() => getProfile(), []);
  const reflections = useLiveQuery(() => listReflections(), []);
  const sessions = useLiveQuery(() => listSessionsSince(addDaysISO(todayISO(), -60)), []);
  const plans = useLiveQuery(() => listPlansSince(addDaysISO(todayISO(), -27)), []);

  const multiplier = useMemo(() => capacityMultiplier(reflections ?? []), [reflections]);
  const sentences = useMemo(
    () => (profile ? learnedSentences(profile, reflections ?? [], multiplier) : []),
    [profile, reflections, multiplier]
  );

  if (!profile || !reflections || !sessions || !plans) return null;

  const finished = sessions.filter((s) => s.minutes);
  const courses = Object.entries(profile.calibration).sort((a, b) => b[1].n - a[1].n);
  const types = Object.entries(profile.calibrationByType).filter(([, v]) => v) as [string, { ratio: number; n: number }][];
  const energy = DAY_WINDOWS.map((w) => ({ w, e: profile.energy[w] })).filter((x) => x.e);
  const history = [...plans].sort((a, b) => (a.date < b.date ? -1 : 1));
  const dialHistory = history.filter((p) => p.dial !== undefined);

  return (
    <div className="space-y-6 lg:max-w-3xl">
      <PageHeader
        title="What Pace has learned"
        subtitle="Computed on this device from your focus sessions and reflections. Edit it by living differently, or reset it."
      />

      <Card>
        <Eyebrow>In plain words</Eyebrow>
        {sentences.length === 0 ? (
          <p className="mt-2 text-soft">Nothing yet. After a few focus sessions and wrap-ups, this fills in with facts Pace plans with.</p>
        ) : (
          <ul className="mt-2 space-y-1.5 font-display text-[1.08rem] leading-snug">
            {sentences.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <SectionTitle>Your estimates vs. reality</SectionTitle>
        <p className="mt-1 text-[0.92rem] text-soft">
          Ratio of time actually spent to the estimate, from {finished.length} finished session{finished.length === 1 ? "" : "s"}. Pace applies a ratio once it has three samples.
        </p>
        {courses.length === 0 && types.length === 0 ? (
          <p className="mt-3 text-soft">No finished sessions yet. Start a step from Today and press Done when it is.</p>
        ) : (
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <Eyebrow className="mb-1.5">By class</Eyebrow>
              <ul className="space-y-1.5">
                {courses.map(([c, v]) => (
                  <RatioRow key={c} label={c} ratio={v.ratio} n={v.n} />
                ))}
                {courses.length === 0 && <li className="text-[0.9rem] text-soft">No class-tagged sessions yet.</li>}
              </ul>
            </div>
            <div>
              <Eyebrow className="mb-1.5">By kind of work</Eyebrow>
              <ul className="space-y-1.5">
                {types.map(([t, v]) => (
                  <RatioRow key={t} label={WORK_TYPE_LABELS[t as keyof typeof WORK_TYPE_LABELS]} ratio={v.ratio} n={v.n} />
                ))}
                {types.length === 0 && <li className="text-[0.9rem] text-soft">Not enough yet.</li>}
              </ul>
            </div>
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle>When steps actually get finished</SectionTitle>
        <p className="mt-1 text-[0.92rem] text-soft">Share of focus sessions that ended with Done, by the part of day they started in. Used only to place steps.</p>
        {energy.length === 0 ? (
          <p className="mt-3 text-soft">No sessions yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {energy.map(({ w, e }) => (
              <li key={w}>
                <div className="flex items-baseline justify-between text-[0.95rem]">
                  <span className="font-medium">{WINDOW_LABELS[w].title}</span>
                  <span className="tabular text-soft">{Math.round(e!.rate * 100)}% · {e!.n} session{e!.n === 1 ? "" : "s"}</span>
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-tint-strong" style={{ width: `${Math.round(e!.rate * 100)}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <SectionTitle>Budget and dial, last four weeks</SectionTitle>
          <Chip tone="brand">today's multiplier {multiplierLabel(multiplier) ?? "±0%"}</Chip>
        </div>
        <p className="mt-1 text-[0.92rem] text-soft">
          Each bar is a day you made a plan: height is the dial you chose, the fill is how much of the plan got done. Reflections ("lighter", "heavier") move the multiplier that sizes tomorrow.
        </p>
        {dialHistory.length === 0 ? (
          <p className="mt-3 text-soft">No plans with a dial yet.</p>
        ) : (
          <>
            <div className="mt-4 flex h-32 items-end gap-2 overflow-x-auto pb-1" role="img" aria-label={`${dialHistory.length} day${dialHistory.length === 1 ? "" : "s"} of plans`}>
              {dialHistory.slice(-28).map((p) => {
                const done = p.actions.filter((a) => a.completed).length;
                const frac = p.actions.length ? done / p.actions.length : 0;
                const d = parseISODate(p.date);
                return (
                  <div key={p.id} className="flex w-9 shrink-0 flex-col items-center gap-1" title={`${p.date}: dial ${p.dial}, ${done}/${p.actions.length} done`}>
                    <div className="relative flex h-24 w-full items-end">
                      <div className="relative w-full rounded-t-md bg-surface-2" style={{ height: `${Math.max(6, p.dial ?? 0)}%` }}>
                        <div className="absolute inset-x-0 bottom-0 rounded-t-md bg-tint-strong" style={{ height: `${Math.round(frac * 100)}%` }} />
                      </div>
                    </div>
                    <span className="tabular text-[0.7rem] text-soft">
                      {d.getMonth() + 1}/{d.getDate()}
                    </span>
                  </div>
                );
              })}
            </div>
            {dialHistory.length < 3 && (
              <p className="mt-2 text-[0.9rem] text-soft">This becomes useful after a few days of plans.</p>
            )}
          </>
        )}
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="ghost"
          onClick={async () => {
            await resetLearning();
            toast("Forgot what was learned. Sessions are kept");
          }}
        >
          <RotateCcw aria-hidden="true" size={17} />
          Reset what Pace learned
        </Button>
        <Link to="/settings" className="text-[0.95rem] font-medium text-brand-deep underline underline-offset-4">
          Export or delete everything
        </Link>
      </div>
    </div>
  );
}

function RatioRow({ label, ratio, n }: { label: string; ratio: number; n: number }) {
  const applied = n >= 3;
  return (
    <li className="flex items-center justify-between gap-3 text-[0.95rem]">
      <span className="min-w-0 truncate">{label}</span>
      <span className="tabular flex items-center gap-2 text-soft">
        <span className={`font-semibold ${applied ? "text-ink" : ""}`}>{ratio.toFixed(2)}x</span>
        <span>{n} sample{n === 1 ? "" : "s"}</span>
        {applied ? <Chip tone="good">applied</Chip> : <Chip>needs {3 - n} more</Chip>}
      </span>
    </li>
  );
}
