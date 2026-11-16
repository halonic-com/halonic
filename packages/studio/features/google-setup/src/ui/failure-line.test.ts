import { KindedError } from "@halonicjs/std";
import { describe, expect, it } from "vitest";
import { failureLine } from "./failure-line.ts";

describe("failureLine", () => {
  it("puts the host's reason after a colon, with one full stop", () => {
    const error = new KindedError("unavailable", "The disk is full.");
    expect(failureLine("save your progress", error)).toBe(
      "Couldn't save your progress: the disk is full.",
    );
  });

  it("keeps a capital inside a word", () => {
    const error = new KindedError("unavailable", "OAuth said no");
    expect(failureLine("start over", error)).toBe("Couldn't start over: OAuth said no.");
  });

  it("keeps a name's capital", () => {
    const error = new KindedError("unavailable", "Google isn't answering");
    expect(failureLine("save your progress", error)).toBe(
      "Couldn't save your progress: Google isn't answering.",
    );
  });

  it("gives the generic sentence, never the message, for an error without a kind", () => {
    expect(failureLine("save the account type", new Error("ENOENT: .halonic/x"))).toBe(
      "Couldn't save the account type: Halonic ran into a problem it can't explain yet.",
    );
    expect(failureLine("save the account type", "nope")).toBe(
      "Couldn't save the account type: Halonic ran into a problem it can't explain yet.",
    );
  });
});
