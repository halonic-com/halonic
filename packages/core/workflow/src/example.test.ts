import { describe, expect, it } from "vitest";
import { runExample } from "../examples/templates-numbers-and-approvals.ts";

describe("the README example", () => {
  it("runs and gives the results its comments promise", () => {
    expect(runExample()).toEqual({
      typed: 3,
      mixed: "Hi Ada, 3!",
      text: "3",
      english: 1200.5,
      european: 1250,
      notANumber: null,
      delayMs: 1_800_000,
      approved: true,
      notAnApproval: null,
      toolResult:
        'A person did not approve this tool call yet and asks for changes: "Use the formal tone.". Change only what they asked, then call the tool again; the new call needs their approval too.',
    });
  });
});
