// One-line brain-dump parser. Deterministic, no AI; a live preview shows what
// was recognized before saving, so parse mistakes are harmless.
//
//   bio lab report due fri ~2h hard #biology @teacher
//
// Tokens: due today|tomorrow|mon…sun|M/D|YYYY-MM-DD (also "by …", "due next fri"),
// durations (~2h, 45m, 2-3h → midpoint), difficulty words (easy|medium|hard|brutal),
// ! / !! importance, #course, @teacher. Past dates are allowed on purpose;
// overdue work is the whole point of re-entry.

import type { Level } from "../data/types";
import { addDaysISO, formatShort, nextWeekdayISO, weekdayFromToken } from "../lib/dates";

export interface ParsedQuickAdd {
  title: string;
  course?: string;
  dueDate?: string;
  estimatedMinutes?: number;
  difficulty?: Level;
  importance?: Level;
  needsCommunication?: boolean;
  /** Human-readable chips describing what was recognized. */
  recognized: string[];
}

const DIFficulty_WORDS: Record<string, Level> = {
  easy: 2,
  medium: 3,
  hard: 4,
  brutal: 5
};

function parseDuration(token: string): number | null {
  const t = token.startsWith("~") ? token.slice(1) : token;
  let m = /^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)(h|hr|hrs|m|min|mins)$/i.exec(t);
  if (m) {
    const mid = (parseFloat(m[1]) + parseFloat(m[2])) / 2;
    return Math.round(/^h/i.test(m[3]) ? mid * 60 : mid);
  }
  m = /^(\d+(?:\.\d+)?)(h|hr|hrs|hour|hours)$/i.exec(t);
  if (m) return Math.round(parseFloat(m[1]) * 60);
  m = /^(\d+)(m|min|mins)$/i.exec(t);
  if (m) return parseInt(m[1], 10);
  return null;
}

/** Parse a date token relative to `todayIso`. Returns ISO date or null. */
function parseDateToken(token: string, todayIso: string): string | null {
  const t = token.toLowerCase().replace(/[,.]$/, "");
  if (t === "today" || t === "tonight") return todayIso;
  if (t === "tomorrow" || t === "tmw" || t === "tmrw") return addDaysISO(todayIso, 1);
  const wd = weekdayFromToken(t);
  if (wd !== null) return nextWeekdayISO(wd, todayIso);
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (m) return t;
  m = /^(\d{1,2})\/(\d{1,2})$/.exec(t);
  if (m) {
    const year = todayIso.slice(0, 4);
    const mm = String(parseInt(m[1], 10)).padStart(2, "0");
    const dd = String(parseInt(m[2], 10)).padStart(2, "0");
    if (parseInt(mm, 10) < 1 || parseInt(mm, 10) > 12) return null;
    if (parseInt(dd, 10) < 1 || parseInt(dd, 10) > 31) return null;
    return `${year}-${mm}-${dd}`;
  }
  return null;
}

export function parseQuickAdd(input: string, todayIso: string): ParsedQuickAdd {
  const tokens = input.trim().split(/\s+/).filter(Boolean);
  const consumed = new Set<number>();
  const result: ParsedQuickAdd = { title: "", recognized: [] };

  for (let i = 0; i < tokens.length; i++) {
    if (consumed.has(i)) continue;
    const token = tokens[i];
    const lower = token.toLowerCase();

    if (lower === "@teacher" || lower === "@t") {
      result.needsCommunication = true;
      result.recognized.push("needs teacher update");
      consumed.add(i);
      continue;
    }
    if (token.startsWith("#") && token.length > 1) {
      const raw = token.slice(1).replace(/[,.]$/, "");
      result.course = raw.charAt(0).toUpperCase() + raw.slice(1);
      result.recognized.push(result.course);
      consumed.add(i);
      continue;
    }
    if (token === "!" || token === "!!") {
      result.importance = token === "!!" ? 5 : 4;
      result.recognized.push(`importance ${result.importance}/5`);
      consumed.add(i);
      continue;
    }
    if (lower in DIFficulty_WORDS) {
      result.difficulty = DIFficulty_WORDS[lower];
      result.recognized.push(`difficulty ${result.difficulty}/5`);
      consumed.add(i);
      continue;
    }
    const duration = parseDuration(token);
    if (duration !== null && duration > 0) {
      result.estimatedMinutes = duration;
      result.recognized.push(`~${duration} min`);
      consumed.add(i);
      continue;
    }
    if ((lower === "due" || lower === "by") && i + 1 < tokens.length) {
      let dateIdx = i + 1;
      let addWeek = false;
      if (tokens[dateIdx]?.toLowerCase() === "next" && dateIdx + 1 < tokens.length) {
        addWeek = true;
        dateIdx += 1;
      }
      const parsed = parseDateToken(tokens[dateIdx], todayIso);
      if (parsed) {
        result.dueDate = addWeek ? addDaysISO(parsed, 7) : parsed;
        result.recognized.push(`due ${formatShort(result.dueDate)}`);
        consumed.add(i);
        if (addWeek) consumed.add(i + 1);
        consumed.add(dateIdx);
        continue;
      }
    }
  }

  const titleTokens = tokens.filter((_, i) => !consumed.has(i));
  const title = titleTokens.join(" ").replace(/\s+/g, " ").trim();
  result.title = title.charAt(0).toUpperCase() + title.slice(1);
  return result;
}
