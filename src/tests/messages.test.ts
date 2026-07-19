import { describe, expect, it } from "vitest";
import { composeMessage, REASONS, REQUESTS } from "../logic/messages";

describe("teacher-message composer", () => {
  it("includes the pieces the student chose", () => {
    const msg = composeMessage({
      teacherName: "Mr. Chen",
      course: "Biology",
      reasonId: "health",
      requestIds: ["priorities"],
      commitment: "finish the lab outline today and the final report by Friday",
      tone: "straightforward",
      studentName: "Alex"
    });
    expect(msg).toContain("Mr. Chen");
    expect(msg).toContain("Biology");
    expect(msg).toContain("health-related absence");
    expect(msg).toContain("prioritize");
    expect(msg).toContain("finish the lab outline today");
    expect(msg).toContain("Alex");
  });

  it("never requires disclosure; a no-reason message stays neutral", () => {
    const msg = composeMessage({
      teacherName: "Ms. Park",
      reasonId: "none",
      requestIds: ["materials"],
      tone: "straightforward"
    });
    expect(msg).toContain("quick update");
    expect(msg.toLowerCase()).not.toContain("absence");
  });

  it("contains no medical or diagnostic words in any combination", () => {
    for (const reason of REASONS) {
      for (const request of REQUESTS) {
        const msg = composeMessage({
          teacherName: "T",
          reasonId: reason.id,
          requestIds: [request.id],
          tone: "warm"
        }).toLowerCase();
        for (const banned of ["diagnosis", "seizure", "epilepsy", "medication", "symptom"]) {
          expect(msg).not.toContain(banned);
        }
      }
    }
  });

  it("brief tone is shorter than warm tone", () => {
    const base = {
      teacherName: "Mr. Chen",
      course: "Math",
      reasonId: "behind",
      requestIds: ["priorities", "materials"],
      commitment: "finish 5.1 and 5.2 by Monday"
    } as const;
    const brief = composeMessage({ ...base, tone: "brief" });
    const warm = composeMessage({ ...base, tone: "warm" });
    expect(brief.length).toBeLessThan(warm.length);
  });

  it("uses placeholders when names are missing", () => {
    const msg = composeMessage({
      teacherName: "",
      reasonId: "none",
      requestIds: [],
      tone: "straightforward"
    });
    expect(msg).toContain("[Teacher name]");
    expect(msg).toContain("[Your name]");
  });

  it("handles multiple requests grammatically", () => {
    const msg = composeMessage({
      teacherName: "Ms. Lee",
      reasonId: "unexpected",
      requestIds: ["extension", "meeting"],
      tone: "straightforward"
    });
    expect(msg).toContain("Would you be able to");
    expect(msg).toContain("Also, could you");
  });
});
