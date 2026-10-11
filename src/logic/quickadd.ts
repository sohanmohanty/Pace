// Parse a one-line task without AI. Show recognized fields in the live
// preview so the student can check mistakes before saving.
//
//   bio lab report due fri ~2h hard #biology @teacher
//
// Tokens: due today|tomorrow|mon…sun|M/D|YYYY-MM-DD (also "by …", "due next fri"),
// durations (~2h, 45m, 2-3h → midpoint), difficulty words (easy|medium|hard|brutal),
// ! / !! importance, #course, @teacher. Accept past dates for catch-up work.

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

const DIFFICULTY_WORDS: Record<string, Level> = {
  easy: 2,
  medium: 3,
  hard: 4,
  brutal: 5
};

function parseDuration(token: string): number | null {
  const durationText = token.startsWith("~") ? token.slice(1) : token;
  let match = /^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)(h|hr|hrs|m|min|mins)$/i.exec(durationText);
  if (match) {
    const midpoint = (parseFloat(match[1]) + parseFloat(match[2])) / 2;
    return Math.round(/^h/i.test(match[3]) ? midpoint * 60 : midpoint);
  }
  match = /^(\d+(?:\.\d+)?)(h|hr|hrs|hour|hours)$/i.exec(durationText);
  if (match) return Math.round(parseFloat(match[1]) * 60);
  match = /^(\d+)(m|min|mins)$/i.exec(durationText);
  if (match) return parseInt(match[1], 10);
  return null;
}

/** Parse a date token relative to `todayIso`. Returns ISO date or null. */
function parseDateToken(token: string, todayIso: string): string | null {
  const dateText = token.toLowerCase().replace(/[,.]$/, "");
  if (dateText === "today" || dateText === "tonight") return todayIso;
  if (dateText === "tomorrow" || dateText === "tmw" || dateText === "tmrw") return addDaysISO(todayIso, 1);
  const weekday = weekdayFromToken(dateText);
  if (weekday !== null) return nextWeekdayISO(weekday, todayIso);
  let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText);
  if (match) return dateText;
  match = /^(\d{1,2})\/(\d{1,2})$/.exec(dateText);
  if (match) {
    const year = todayIso.slice(0, 4);
    const month = String(parseInt(match[1], 10)).padStart(2, "0");
    const day = String(parseInt(match[2], 10)).padStart(2, "0");
    if (parseInt(month, 10) < 1 || parseInt(month, 10) > 12) return null;
    if (parseInt(day, 10) < 1 || parseInt(day, 10) > 31) return null;
    return `${year}-${month}-${day}`;
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
      const courseName = token.slice(1).replace(/[,.]$/, "");
      result.course = courseName.charAt(0).toUpperCase() + courseName.slice(1);
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
    if (lower in DIFFICULTY_WORDS) {
      result.difficulty = DIFFICULTY_WORDS[lower];
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
      let dateIndex = i + 1;
      let nextWeek = false;
      if (tokens[dateIndex]?.toLowerCase() === "next" && dateIndex + 1 < tokens.length) {
        nextWeek = true;
        dateIndex += 1;
      }
      const parsed = parseDateToken(tokens[dateIndex], todayIso);
      if (parsed) {
        result.dueDate = nextWeek ? addDaysISO(parsed, 7) : parsed;
        result.recognized.push(`due ${formatShort(result.dueDate)}`);
        consumed.add(i);
        if (nextWeek) consumed.add(i + 1);
        consumed.add(dateIndex);
        continue;
      }
    }
  }

  const titleTokens = tokens.filter((_, i) => !consumed.has(i));
  const title = titleTokens.join(" ").replace(/\s+/g, " ").trim();
  result.title = title.charAt(0).toUpperCase() + title.slice(1);
  return result;
}
