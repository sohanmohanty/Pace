import { describe, expect, it } from "vitest";
import { lintMessage, neutralize } from "../logic/lint";

describe("no-disclosure lint", () => {
  it("flags medical and diagnostic terms with a neutral suggestion", () => {
    const hits = lintMessage("I missed class because of a seizure and a hospital stay.");
    expect(hits.map((h) => h.term.toLowerCase())).toEqual(["seizure", "hospital"]);
    expect(hits[0].suggestion).toBe("a health-related absence");
  });

  it("flags mental-health and family vocabulary", () => {
    expect(lintMessage("My anxiety has been bad.").length).toBe(1);
    expect(lintMessage("There was a funeral.").length).toBe(1);
    expect(lintMessage("My IEP says I get extra time.").length).toBe(1);
  });

  it("leaves neutral messages alone", () => {
    expect(lintMessage("I'm catching up after an unexpected absence and wanted to give you a quick update.")).toEqual([]);
    expect(lintMessage("Would you be able to confirm which assignments I should prioritize first?")).toEqual([]);
  });

  it("neutralizes in place and keeps capitalization", () => {
    expect(neutralize("Chemo made this week hard.")).toBe("A health-related absence made this week hard.");
    expect(neutralize("I had therapy appointments.")).toBe("I had a personal situation appointments.");
  });
});
