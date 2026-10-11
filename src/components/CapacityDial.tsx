import { useEffect, useRef, useState } from "react";
import { Label, Slider, SliderOutput, SliderThumb, SliderTrack } from "react-aria-components";
import { dialLabel } from "../logic/capacity";

/**
 * Continuous 0 to 100 capacity slider. React Aria handles keyboard, touch,
 * and screen-reader input. The live region announces the label after the
 * value settles.
 */

// I place the shortcuts symmetrically beneath the track, within their capacity
// bands: low at 30 or below, medium through 62, and high above 62.
// Selecting a shortcut sets the dial to its position.
const REGIONS: { at: number; label: string }[] = [
  { at: 15, label: "Low" },
  { at: 50, label: "Medium" },
  { at: 85, label: "High" }
];

export function CapacityDial({
  value,
  onChange,
  onCommit,
  legend = "How much do you have today?",
  hint = "There's no wrong answer. Slide it and watch the day resize."
}: {
  value: number;
  onChange: (v: number) => void;
  onCommit?: (v: number) => void;
  legend?: string;
  hint?: string;
}) {
  const [announce, setAnnounce] = useState("");
  const timer = useRef<number | undefined>(undefined);

  // Keep the thumb responsive while dragging. Update the parent plan, tint,
  // and Day Line at most once per animation frame.
  const [local, setLocal] = useState(value);
  const dragging = useRef(false);
  const frame = useRef<number | null>(null);
  const pending = useRef<number | null>(null);
  useEffect(() => {
    if (!dragging.current) setLocal(value);
  }, [value]);
  const lastPushed = useRef<number>(Math.round(value));
  const push = (v: number) => {
    // Send whole-number changes to the page; keep the finer thumb position here.
    lastPushed.current = Math.round(v);
    pending.current = v;
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      if (pending.current !== null) onChange(pending.current);
    });
  };
  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
  }, []);

  useEffect(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setAnnounce(`${Math.round(value)}, ${dialLabel(value)}`), 400);
    return () => window.clearTimeout(timer.current);
  }, [value]);

  return (
    <div>
      <Slider
        value={local}
        onChange={(v) => {
          const n = Array.isArray(v) ? v[0] : v;
          dragging.current = true;
          setLocal(n);
          push(n);
        }}
        onChangeEnd={(v) => {
          const n = Array.isArray(v) ? v[0] : v;
          dragging.current = false;
          if (frame.current !== null) {
            cancelAnimationFrame(frame.current);
            frame.current = null;
          }
          onChange(n);
          onCommit?.(n);
        }}
        minValue={0}
        maxValue={100}
        step={0.25}
        className="rac-slider"
      >
        <Label className="font-medium" style={{ gridArea: "label" }}>
          {legend}
        </Label>
        <SliderOutput
          className="tabular text-right text-[0.95rem] text-soft"
          style={{ gridArea: "output" }}
        >
          {({ state }) => (
            <span>
              <span className="font-semibold text-ink">{Math.round(state.getThumbValue(0))}</span>
              <span className="ml-1.5">{dialLabel(state.getThumbValue(0))}</span>
            </span>
          )}
        </SliderOutput>
        <SliderTrack className="rac-track">
          <div className="rac-rail cap-gradient" />
          <SliderThumb className="rac-thumb" aria-label="Capacity" />
        </SliderTrack>
      </Slider>

      <div className="relative mt-0.5 h-5 text-[0.78rem] font-semibold uppercase tracking-[0.06em] text-soft">
        {REGIONS.map((r) => (
          <button
            key={r.label}
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            onClick={() => {
              setLocal(r.at);
              onChange(r.at);
              onCommit?.(r.at);
            }}
            className="absolute -translate-x-1/2 px-1 hover:text-ink"
            style={{ left: `${r.at}%` }}
          >
            {r.label}
          </button>
        ))}
      </div>

      {hint && <p className="mt-2 text-[0.9rem] text-soft">{hint}</p>}
      <p className="visually-hidden" aria-live="polite">
        {announce}
      </p>
    </div>
  );
}
