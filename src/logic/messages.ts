// Teacher-message composer. The student never has to disclose details —
// reason phrases are neutral, and "no reason line" is always an option.
// Nothing is sent by Pace; the student copies the text and stays in control.

export type ToneId = "straightforward" | "warm" | "brief";

export interface ReasonOption {
  id: string;
  label: string;
  phrase: string; // empty = no reason line
}

export const REASONS: ReasonOption[] = [
  { id: "none", label: "No reason line — just the update", phrase: "" },
  { id: "unexpected", label: "After an unexpected absence", phrase: "after an unexpected absence" },
  { id: "health", label: "After a health-related absence", phrase: "after a health-related absence" },
  { id: "behind", label: "After falling behind recently", phrase: "after falling behind recently" },
  { id: "personal", label: "After a personal situation", phrase: "after a personal situation" },
  { id: "ontrack", label: "As I get back on track", phrase: "as I get back on track" }
];

export interface RequestOption {
  id: string;
  label: string;
  phrase: string; // completes "Would you be able to …?"
}

export const REQUESTS: RequestOption[] = [
  {
    id: "priorities",
    label: "Which assignments to prioritize",
    phrase: "confirm which assignments I should prioritize first"
  },
  {
    id: "extension",
    label: "A short extension",
    phrase: "let me know whether a short extension would be possible"
  },
  {
    id: "reschedule",
    label: "Rescheduling a test or quiz",
    phrase: "share options for rescheduling the test or quiz"
  },
  {
    id: "materials",
    label: "Notes or materials I missed",
    phrase: "point me to notes or materials from the classes I missed"
  },
  {
    id: "meeting",
    label: "A few minutes to make a plan",
    phrase: "find a few minutes to help me make a catch-up plan"
  }
];

export const TONES: { id: ToneId; label: string }[] = [
  { id: "straightforward", label: "Straightforward" },
  { id: "warm", label: "Warm" },
  { id: "brief", label: "Brief" }
];

export interface MessageInput {
  teacherName: string;
  course?: string;
  reasonId: string;
  requestIds: readonly string[];
  commitment?: string;
  tone: ToneId;
  studentName?: string;
}

export function composeMessage(input: MessageInput): string {
  const reason = REASONS.find((r) => r.id === input.reasonId) ?? REASONS[0];
  const requests = input.requestIds
    .map((id) => REQUESTS.find((r) => r.id === id))
    .filter((r): r is RequestOption => Boolean(r));

  const teacher = input.teacherName.trim() || "[Teacher name]";
  const student = input.studentName?.trim() || "[Your name]";
  const courseBit = input.course?.trim() ? ` in ${input.course.trim()}` : "";

  const lines: string[] = [];
  lines.push(`Hi ${teacher},`);
  lines.push("");

  let opener = "";
  if (input.tone === "warm") opener += "I hope your week is going well. ";
  if (reason.phrase) {
    opener += `I'm catching up ${reason.phrase} and wanted to give you a quick update${courseBit}.`;
  } else {
    opener += `I wanted to give you a quick update on where I am${courseBit}.`;
  }
  lines.push(opener);

  const commitment = input.commitment?.trim().replace(/\.+$/, "");
  if (commitment) {
    lines.push(`My plan is to ${commitment}.`);
  }

  if (requests.length > 0) {
    const sentences = requests.map((r, i) =>
      i === 0 ? `Would you be able to ${r.phrase}?` : `Also, could you ${r.phrase}?`
    );
    lines.push("");
    lines.push(sentences.join(" "));
  }

  lines.push("");
  if (input.tone === "warm") lines.push("Thank you so much for understanding,");
  else lines.push("Thank you,");
  lines.push(student);

  if (input.tone === "brief") {
    // Brief: greeting, one combined line, sign-off.
    const briefLines: string[] = [`Hi ${teacher},`, ""];
    let body = reason.phrase
      ? `Quick update${courseBit}: I'm catching up ${reason.phrase}.`
      : `Quick update${courseBit} on where I am.`;
    if (commitment) body += ` My plan is to ${commitment}.`;
    briefLines.push(body);
    if (requests.length > 0) {
      briefLines.push(`Would you be able to ${requests[0].phrase}?`);
    }
    briefLines.push("");
    briefLines.push("Thank you,");
    briefLines.push(student);
    return briefLines.join("\n");
  }

  return lines.join("\n");
}
