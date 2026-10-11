import { describe, expect, it } from "vitest";
import { classifyIcsItem, courseFromTitle, filterWindow, guessMinutes, parseIcs } from "../logic/ics";

const CANVAS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Instructure//Canvas//EN
BEGIN:VEVENT
UID:event-assignment-1234
DTSTAMP:20261001T120000Z
DTSTART;VALUE=DATE:20261009
DTEND;VALUE=DATE:20261010
SUMMARY:Essay 2: The Great Gatsby [AP English]
DESCRIPTION:Write 3-4 pages\\, double spaced. Submit on Canvas.
URL:https://school.instructure.com/courses/1/assignments/1234
END:VEVENT
BEGIN:VEVENT
UID:event-assignment-5678
DTSTART;VALUE=DATE:20261007
DTEND;VALUE=DATE:20261008
SUMMARY:Problem Set 5 [Honors Precalc]
END:VEVENT
BEGIN:VEVENT
UID:cal-event-1
DTSTART;TZID=America/Los_Angeles:20261008T153000
DTEND;TZID=America/Los_Angeles:20261008T170000
SUMMARY:Soccer practice
STATUS:CONFIRMED
END:VEVENT
BEGIN:VEVENT
UID:cancelled-1
DTSTART;VALUE=DATE:20261012
SUMMARY:Field trip
STATUS:CANCELLED
END:VEVENT
BEGIN:VEVENT
UID:long-folded
DTSTART:20261011T160000Z
SUMMARY:Chemistry midterm review session with a very long title
  that continues on the next line
END:VEVENT
END:VCALENDAR`;

describe("parseIcs", () => {
  const items = parseIcs(CANVAS);

  it("parses VEVENTs, unfolds long lines, unescapes text, and drops cancelled ones", () => {
    expect(items.map((i) => i.uid)).toEqual(["event-assignment-1234", "event-assignment-5678", "cal-event-1", "long-folded"]);
    expect(items[0].description).toBe("Write 3-4 pages, double spaced. Submit on Canvas.");
    expect(items[3].title).toBe("Chemistry midterm review session with a very long title that continues on the next line");
  });

  it("reads all-day due dates and pulls the course out of the Canvas suffix", () => {
    expect(items[0].date).toBe("2026-10-09");
    expect(items[0].allDay).toBe(true);
    expect(items[0].course).toBe("AP English");
    expect(items[0].title).toBe("Essay 2: The Great Gatsby");
    expect(items[0].kind).toBe("task");
  });

  it("reads timed events as local wall time and classifies them as events", () => {
    expect(items[2].date).toBe("2026-10-08");
    expect(items[2].start).toBe("15:30");
    expect(items[2].end).toBe("17:00");
    expect(items[2].kind).toBe("event");
  });

  it("converts UTC stamps to local time", () => {
    const d = new Date(Date.UTC(2026, 9, 11, 16, 0, 0));
    const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    expect(items[3].date).toBe(expected);
  });

  it("filters to a useful window and guesses sizes", () => {
    const win = filterWindow(items, "2026-10-05");
    expect(win.length).toBe(4);
    expect(filterWindow(items, "2027-01-01").length).toBe(0);
    expect(guessMinutes("Essay 2")).toBe(120);
    expect(guessMinutes("Quiz 3")).toBe(30);
  });

  it("helpers behave on edge cases", () => {
    expect(courseFromTitle("Plain title")).toEqual({ title: "Plain title" });
    expect(classifyIcsItem("Biology lab report due", false)).toBe("task");
    expect(classifyIcsItem("Band rehearsal", false)).toBe("event");
    expect(classifyIcsItem("Something", true)).toBe("task");
  });
});
