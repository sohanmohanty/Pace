import { describe, expect, it } from "vitest";
import { partialReasoning } from "../ai/client";

describe("partialReasoning", () => {
  it("returns nothing until the reasoning value starts", () => {
    expect(partialReasoning("")).toBe("");
    expect(partialReasoning('{"reas')).toBe("");
    expect(partialReasoning('{"reasoning"')).toBe("");
    expect(partialReasoning('{"reasoning": ')).toBe("");
  });

  it("returns the partial string as it streams, decoding escapes", () => {
    expect(partialReasoning('{"reasoning": "Today reads as')).toBe("Today reads as");
    expect(partialReasoning('{"reasoning": "A \\"quoted\\" word\\nnext')).toBe('A "quoted" word\nnext');
  });

  it("stops at the closing quote", () => {
    expect(partialReasoning('{"reasoning": "Done.", "actions": [')).toBe("Done.");
  });
});
