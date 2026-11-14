import { describe, expect, it } from "vitest";
import { failureLine } from "./failure-line.ts";

describe("failureLine", () => {
  it("puts the host's reason after a colon, with one full stop", () => {
    expect(failureLine("save your progress", new Error("The disk is full."))).toBe(
      "Couldn't save your progress: the disk is full.",
    );
  });

  it("keeps a capital inside a word", () => {
    expect(failureLine("start over", new Error("OAuth said no"))).toBe(
      "Couldn't start over: OAuth said no.",
    );
  });

  it("says only what failed when there is no reason", () => {
    expect(failureLine("save the account type", "nope")).toBe("Couldn't save the account type.");
  });
});
