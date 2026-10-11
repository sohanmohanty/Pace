import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { DayWindow, PlanAction } from "../data/types";
import { colorIndexFor, layoutDayLine, TASK_HUES, type DayLineStop } from "../logic/dayline";
import { WINDOW_LABELS } from "../logic/capacity";
import { minutesLabel } from "../lib/labels";

/**
 * Draw the day as a path: capacity sets its length, stops mark planned steps,
 * and the completed portion shows progress. layoutDayLine supplies geometry
 * for the hero, compact strip, and week thumbnails.
 *
 * Fixed path sample counts allow d interpolation. Stops use spring movement
 * and fade/scale on entry or exit. MotionConfig disables animation when
 * reduced motion is enabled.
 */

type Size = "large" | "hero" | "compact" | "thumb";

const HEIGHTS: Record<Size, number> = { large: 230, hero: 150, compact: 88, thumb: 40 };
const SCALES: Record<Size, number> = { large: 1.25, hero: 1, compact: 0.72, thumb: 0.42 };
const PADS: Record<Size, number> = { large: 32, hero: 24, compact: 16, thumb: 7 };

const spring = { type: "spring", stiffness: 260, damping: 32, mass: 0.8 } as const;
const quick = { type: "spring", stiffness: 260, damping: 28 } as const;

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

export function stopColor(hue: number, strong = false): string {
  return strong
    ? `oklch(var(--stop-strong-l) var(--stop-strong-c) ${hue})`
    : `oklch(var(--stop-l) var(--stop-c) ${hue})`;
}

export function DayLine({
  actions,
  budgetMinutes,
  size = "hero",
  windows,
  selectedId,
  onSelect,
  taskOrder,
  className = "",
  label,
  showWindows = true,
  showSpare = true
}: {
  actions: PlanAction[];
  budgetMinutes: number;
  size?: Size;
  windows?: DayWindow[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** Task ids in a stable order, so colors stay consistent across the app. */
  taskOrder?: string[];
  className?: string;
  /** Accessible description. The visual is decorative beyond the stops. */
  label?: string;
  showWindows?: boolean;
  showSpare?: boolean;
}) {
  const { ref, width } = useWidth<HTMLDivElement>();
  const height = HEIGHTS[size];
  const big = size === "hero" || size === "large";
  const interactive = big && Boolean(onSelect);

  const order = useMemo(
    () => taskOrder ?? [...new Set(actions.map((a) => a.taskId))],
    [taskOrder, actions]
  );

  // Use smaller stops on narrow phones to fit a full day.
  const responsiveScale = big ? SCALES[size] * Math.min(1, Math.max(0.72, (width || 320) / 640)) : SCALES[size];

  const layout = useMemo(
    () =>
      layoutDayLine({
        actions,
        budgetMinutes,
        width: width || 320,
        height,
        pad: PADS[size],
        scale: responsiveScale,
        windows
      }),
    [actions, budgetMinutes, width, height, size, windows, responsiveScale]
  );

  const doneCount = actions.filter((a) => a.completed).length;
  const description =
    label ??
    `Day line: ${minutesLabel(budgetMinutes)} of capacity, ${actions.length} step${
      actions.length === 1 ? "" : "s"
    }, ${doneCount} done.`;

  function onKey(e: KeyboardEvent, id: string) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect?.(id);
    }
  }

  const strokeTrack = size === "thumb" ? 2 : size === "compact" ? 3 : size === "large" ? 5 : 4;
  const strokeLine = size === "thumb" ? 3 : size === "compact" ? 5 : size === "large" ? 9 : 7;
  const strokeSeg = size === "thumb" ? 5 : size === "compact" ? 9 : size === "large" ? 16 : 13;

  return (
    <div ref={ref} className={`relative w-full ${className}`} style={{ height }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role={interactive ? "group" : "img"}
          aria-label={description}
          className="block overflow-visible"
        >
          <defs>
            <linearGradient id="pace-cap-grad" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="oklch(0.72 0.09 300)" />
              <stop offset="30%" stopColor="oklch(0.68 0.10 230)" />
              <stop offset="55%" stopColor="oklch(0.66 0.10 185)" />
              <stop offset="78%" stopColor="oklch(0.74 0.11 120)" />
              <stop offset="100%" stopColor="oklch(0.78 0.12 70)" />
            </linearGradient>
          </defs>

          {/* The whole possible day, faint and dotted. */}
          <path
            d={layout.trackPath}
            fill="none"
            stroke="var(--line)"
            strokeWidth={strokeTrack}
            strokeLinecap="round"
            strokeDasharray={size === "thumb" ? "1 5" : "1 9"}
            opacity={0.9}
          />

          {/* Today's horizon: the line extends as far as capacity does. */}
          <motion.path
            d={layout.linePath}
            animate={{ d: layout.linePath }}
            transition={spring}
            fill="none"
            stroke="var(--tint-strong)"
            strokeWidth={strokeLine}
            strokeLinecap="round"
            opacity={0.35}
          />

          {/* Steps as thick colored segments on the line. */}
          <AnimatePresence initial={false}>
            {layout.stops.map((s) => {
              const hue = TASK_HUES[colorIndexFor(s.taskId, order)];
              return (
                <motion.path
                  key={`seg-${s.id}`}
                  initial={{ opacity: 0 }}
                  animate={{ d: s.segment, opacity: s.completed ? 0.95 : 0.55 }}
                  exit={{ opacity: 0 }}
                  transition={spring}
                  d={s.segment}
                  fill="none"
                  stroke={stopColor(hue, s.completed)}
                  strokeWidth={strokeSeg}
                  strokeLinecap="round"
                />
              );
            })}
          </AnimatePresence>

          {/* Walked portion. */}
          <motion.path
            d={layout.donePath}
            animate={{ d: layout.donePath }}
            transition={spring}
            fill="none"
            stroke="var(--ink)"
            strokeWidth={size === "thumb" ? 1.5 : 2}
            strokeLinecap="round"
            opacity={layout.doneFrac > 0 ? 0.55 : 0}
          />

          {/* Horizon end cap. */}
          <motion.circle
            animate={{ cx: layout.horizonX, cy: layout.horizonY }}
            transition={spring}
            r={size === "thumb" ? 2.5 : size === "compact" ? 4 : size === "large" ? 7 : 5.5}
            fill="var(--surface)"
            stroke="var(--tint-strong)"
            strokeWidth={size === "thumb" ? 1.5 : 2.5}
          />

          {/* Stops. */}
          <AnimatePresence initial={false}>
            {layout.stops.map((s) => (
              <Stop
                key={s.id}
                stop={s}
                hue={TASK_HUES[colorIndexFor(s.taskId, order)]}
                selected={selectedId === s.id}
                interactive={interactive}
                size={size}
                onSelect={onSelect}
                onKey={onKey}
              />
            ))}
          </AnimatePresence>

          {/* "You are here": a soft breathing halo around the next unfinished stop. */}
          {actions.some((a) => !a.completed) && size !== "thumb" && (
            <motion.g
              animate={{ x: layout.nowX, y: layout.nowY }}
              transition={spring}
              style={{ x: layout.nowX, y: layout.nowY }}
              aria-hidden="true"
            >
              <circle
                r={size === "large" ? 32 : size === "hero" ? 26 : 16}
                fill="var(--tint-strong)"
                opacity={0.14}
                className="breathe"
                style={{ transformOrigin: "0 0", transformBox: "fill-box" }}
              />
            </motion.g>
          )}

          {/* Window labels under the line, hero only. */}
          {big && showWindows &&
            layout.windowMarks.map((m) => (
              <motion.g key={m.window} animate={{ x: m.x }} transition={spring} style={{ x: m.x }}>
                <text
                  y={height - 6}
                  textAnchor="middle"
                  fontSize={11.5}
                  fontWeight={600}
                  fill="var(--soft)"
                  style={{ letterSpacing: "0.06em", textTransform: "uppercase" }}
                >
                  {WINDOW_LABELS[m.window].title}
                </text>
              </motion.g>
            ))}

          {/* Spare room label, hero only. Sits after the horizon when there is room. */}
          {big && showSpare && layout.spareMinutes >= 10 && actions.length > 0 && (
            <motion.text
              animate={{
                x: layout.horizonX < layout.width - 110 ? layout.horizonX + 14 : layout.horizonX - 10,
                y: layout.horizonX < layout.width - 110 ? layout.horizonY + 4 : layout.horizonY - 18
              }}
              transition={spring}
              style={{
                x: layout.horizonX < layout.width - 110 ? layout.horizonX + 14 : layout.horizonX - 10,
                y: layout.horizonX < layout.width - 110 ? layout.horizonY + 4 : layout.horizonY - 18
              }}
              textAnchor={layout.horizonX < layout.width - 110 ? "start" : "end"}
              fontSize={12}
              fill="var(--soft)"
            >
              {minutesLabel(layout.spareMinutes)} spare
            </motion.text>
          )}
        </svg>
      )}
    </div>
  );
}

function Stop({
  stop,
  hue,
  selected,
  interactive,
  size,
  onSelect,
  onKey
}: {
  stop: DayLineStop;
  hue: number;
  selected: boolean;
  interactive: boolean;
  size: Size;
  onSelect?: (id: string) => void;
  onKey: (e: KeyboardEvent, id: string) => void;
}) {
  const r = selected ? stop.r * 1.18 : stop.r;
  return (
    <motion.g
      initial={{ opacity: 0, scale: 0.4 }}
      animate={{ opacity: 1, scale: 1, x: stop.x, y: stop.y }}
      exit={{ opacity: 0, scale: 0.4 }}
      transition={spring}
      style={{ x: stop.x, y: stop.y, cursor: interactive ? "pointer" : "default" }}
      tabIndex={interactive ? 0 : undefined}
      role={interactive ? "button" : undefined}
      aria-label={
        interactive
          ? `${stop.title}, ${minutesLabel(stop.minutes)}${stop.completed ? ", done" : ""}`
          : undefined
      }
      aria-pressed={interactive ? selected : undefined}
      onClick={interactive ? () => onSelect?.(stop.id) : undefined}
      onKeyDown={interactive ? (e) => onKey(e, stop.id) : undefined}
      className={interactive ? "outline-none" : undefined}
    >
      {/* Hit area and focus ring. */}
      {interactive && (
        <circle
          r={Math.max(22, r + 8)}
          fill="transparent"
          stroke={selected ? "var(--ink)" : "transparent"}
          strokeWidth={2}
          strokeDasharray={selected ? "3 4" : undefined}
        />
      )}
      <motion.circle
        animate={{ r }}
        transition={quick}
        r={r}
        fill={stop.completed ? stopColor(hue, true) : "var(--surface)"}
        stroke={stopColor(hue, true)}
        strokeWidth={size === "thumb" ? 1.5 : selected ? 3.5 : 3}
      />
      {stop.completed && size !== "thumb" && (
        <path
          d={`M${-r * 0.42} 0 L${-r * 0.1} ${r * 0.34} L${r * 0.48} ${-r * 0.36}`}
          fill="none"
          stroke="var(--surface)"
          strokeWidth={Math.max(2, r * 0.22)}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </motion.g>
  );
}
