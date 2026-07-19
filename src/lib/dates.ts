// All date handling is LOCAL-time. `new Date("2026-07-03")` parses as UTC
// midnight, which is the previous evening in California, so every due date
// would be off by one. These helpers exist so that mistake can't happen.

const DAY_MS = 24 * 60 * 60 * 1000;

/** Parse a YYYY-MM-DD string as local midnight. */
export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Format a Date as YYYY-MM-DD (local). */
export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function addDaysISO(iso: string, days: number): string {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/** Whole days from `fromISO` (default today) until `iso`. Negative = past. */
export function daysUntil(iso: string, fromISO?: string): number {
  const from = parseISODate(fromISO ?? todayISO());
  const to = parseISODate(iso);
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/**
 * Next occurrence of a weekday (0=Sun..6=Sat) on or after `fromISO`.
 * If `fromISO` is that weekday, returns `fromISO` itself.
 */
export function nextWeekdayISO(weekday: number, fromISO: string): string {
  const from = parseISODate(fromISO);
  const delta = (weekday - from.getDay() + 7) % 7;
  return addDaysISO(fromISO, delta);
}

/** Match a weekday token like "fri" or "friday". Returns 0-6 or null. */
export function weekdayFromToken(token: string): number | null {
  const t = token.toLowerCase();
  for (let i = 0; i < 7; i++) {
    const full = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][i];
    if (t === WEEKDAYS[i] || t === full || (t.length >= 3 && full.startsWith(t))) return i;
  }
  return null;
}

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Mon, Jul 6" style label. */
export function formatShort(iso: string): string {
  const d = parseISODate(iso);
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
  return `${wd}, ${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
}

/** Gentle due label. Past dates never say "overdue"; they say "was due". */
export function formatDueLabel(iso: string, fromISO?: string): string {
  const n = daysUntil(iso, fromISO);
  if (n === 0) return "due today";
  if (n === 1) return "due tomorrow";
  if (n < 0) return `was due ${formatShort(iso)}`;
  if (n <= 6) return `due ${formatShort(iso)}`;
  return `due ${formatShort(iso)}`;
}

export function formatLongDate(date: Date): string {
  const wd = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][date.getDay()];
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  return `${wd}, ${months[date.getMonth()]} ${date.getDate()}`;
}
