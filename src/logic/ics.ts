// Parse Canvas assignment feeds and Google Calendar secret addresses.
// Canvas entries use VEVENT/DTSTART, often all-day, with titles such as
// "Assignment name [Course]". No dependencies; supports folded lines,
// escaped text, TZID/UTC timestamps, and all-day dates. Skip unsupported
// recurrence expansion beyond simple weekly rules.

export interface IcsItem {
  uid: string;
  title: string;
  description?: string;
  /** YYYY-MM-DD local. */
  date: string;
  /** "HH:MM" local, absent for all-day items. */
  start?: string;
  end?: string;
  allDay: boolean;
  url?: string;
  categories?: string[];
  /** Best-effort course from "[Course]" suffix or categories. */
  course?: string;
  /** Heuristic: assignments vs fixed events. */
  kind: "task" | "event";
}

function unfold(text: string): string[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of lines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && out.length > 0) out[out.length - 1] += line.slice(1);
    else out.push(line);
  }
  return out;
}

function unescape(v: string): string {
  return v.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\").trim();
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function localParts(d: Date): { date: string; time: string } {
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`
  };
}

/** Parse a DTSTART/DTEND value with its params into local date/time. */
function parseStamp(value: string, params: Record<string, string>): { date: string; time?: string } | null {
  const v = value.trim();
  if (params.VALUE === "DATE" || /^\d{8}$/.test(v)) {
    const m = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
    if (!m) return null;
    return { date: `${m[1]}-${m[2]}-${m[3]}` };
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(v);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (z) {
    const utc = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s ?? 0)));
    const p = localParts(utc);
    return { date: p.date, time: p.time };
  }
  // Treat floating and TZID values as local wall time. School feeds are
  // assumed to use the student's time zone.
  return { date: `${y}-${mo}-${d}`, time: `${h}:${mi}` };
}

function splitProp(line: string): { name: string; params: Record<string, string>; value: string } | null {
  const idx = line.indexOf(":");
  if (idx < 0) return null;
  const head = line.slice(0, idx);
  const value = line.slice(idx + 1);
  const [name, ...rawParams] = head.split(";");
  const params: Record<string, string> = {};
  for (const p of rawParams) {
    const eq = p.indexOf("=");
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return { name: name.toUpperCase(), params, value };
}

const EVENT_WORDS = /\b(class|lecture|lab session|practice|rehearsal|game|match|meet|shift|appointment|exam|test|quiz|midterm|final|office hours|club|meeting)\b/i;
const TASK_WORDS = /\b(due|assignment|homework|hw|essay|paper|report|project|problem set|pset|worksheet|reading|read|submit|turn in|draft|lab report|discussion post|quiz\b.*\b(online|due))/i;

export function classifyIcsItem(title: string, allDay: boolean, description?: string): "task" | "event" {
  const text = `${title} ${description ?? ""}`;
  if (TASK_WORDS.test(text) && !/\b(in class|in-class)\b/i.test(text)) return "task";
  if (EVENT_WORDS.test(text)) return "event";
  // Canvas assignment feeds are all-day entries; calendar events have times.
  return allDay ? "task" : "event";
}

/** "Essay 2 [AP English]" → course "AP English". */
export function courseFromTitle(title: string): { title: string; course?: string } {
  const match = /^(.*?)\s*\[([^\]]+)\]\s*$/.exec(title);
  if (match) return { title: match[1].trim(), course: match[2].trim() };
  return { title: title.trim() };
}

export function parseIcs(text: string): IcsItem[] {
  const lines = unfold(text);
  const items: IcsItem[] = [];
  let eventProperties: Record<string, { params: Record<string, string>; value: string }> | null = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      eventProperties = {};
      continue;
    }
    if (line === "END:VEVENT") {
      if (eventProperties) {
        const item = toItem(eventProperties);
        if (item) items.push(item);
      }
      eventProperties = null;
      continue;
    }
    if (!eventProperties) continue;
    const property = splitProp(line);
    if (!property) continue;
    eventProperties[property.name] = { params: property.params, value: property.value };
  }
  return items;
}

function toItem(properties: Record<string, { params: Record<string, string>; value: string }>): IcsItem | null {
  const summary = properties.SUMMARY ? unescape(properties.SUMMARY.value) : "";
  const start = properties.DTSTART ? parseStamp(properties.DTSTART.value, properties.DTSTART.params) : null;
  if (!summary || !start) return null;
  if (properties.STATUS && /cancelled/i.test(properties.STATUS.value)) return null;
  const end = properties.DTEND ? parseStamp(properties.DTEND.value, properties.DTEND.params) : null;
  const allDay = !start.time;
  const description = properties.DESCRIPTION ? unescape(properties.DESCRIPTION.value) : undefined;
  const categories = properties.CATEGORIES ? unescape(properties.CATEGORIES.value).split(",").map((s) => s.trim()).filter(Boolean) : undefined;
  const { title, course } = courseFromTitle(summary);
  // Canvas marks assignment due dates as all-day on the due date; the DTEND for
  // an all-day VEVENT is exclusive (next day), so retain the start date.
  const uid = properties.UID ? unescape(properties.UID.value) : `${summary}-${start.date}`;
  return {
    uid,
    title,
    description,
    date: start.date,
    start: start.time,
    end: end?.time && end.date === start.date ? end.time : undefined,
    allDay,
    url: properties.URL ? properties.URL.value.trim() : undefined,
    categories,
    course: course ?? categories?.[0],
    kind: classifyIcsItem(title, allDay, description)
  };
}

/** Keep items from a week ago through the horizon, so overdue work still shows. */
export function filterWindow(items: IcsItem[], todayISO: string, daysBack = 7, daysAhead = 60): IcsItem[] {
  const [y, m, d] = todayISO.split("-").map(Number);
  const from = new Date(y, m - 1, d - daysBack);
  const to = new Date(y, m - 1, d + daysAhead);
  const fromDate = localParts(from).date;
  const toDate = localParts(to).date;
  return items.filter((i) => i.date >= fromDate && i.date <= toDate);
}

/** Rough minutes for a feed assignment when the feed gives none. */
export function guessMinutes(title: string): number {
  const titleLowercase = title.toLowerCase();
  if (/\b(essay|paper|project|lab report|presentation)\b/.test(titleLowercase)) return 120;
  if (/\b(quiz|worksheet|discussion|post|reflection)\b/.test(titleLowercase)) return 30;
  if (/\b(test|exam|midterm|final)\b/.test(titleLowercase)) return 90;
  if (/\b(read|reading|chapter)\b/.test(titleLowercase)) return 40;
  return 45;
}

export function guessImportance(title: string): 1 | 2 | 3 | 4 | 5 {
  const titleLowercase = title.toLowerCase();
  if (/\b(final|midterm|exam|project|essay|paper)\b/.test(titleLowercase)) return 5;
  if (/\b(test|lab report|presentation)\b/.test(titleLowercase)) return 4;
  if (/\b(quiz|worksheet|homework|hw|problem set)\b/.test(titleLowercase)) return 3;
  return 3;
}
