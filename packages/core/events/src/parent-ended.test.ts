import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { endedWithParent, parentEndedCause } from "./parent-ended.ts";

verifies("events.parent-ended", () => {
  it("is a conflict with its own code and no detail", () => {
    expect(parentEndedCause).toEqual({ kind: "conflict", code: "run.parent-ended" });
    expect(endedWithParent(parentEndedCause)).toBe(true);
  });

  it("says no for another code, a kind alone, and no cause", () => {
    expect(endedWithParent({ kind: "conflict", code: "agent.answer-not-an-option" })).toBe(false);
    expect(endedWithParent({ kind: "conflict" })).toBe(false);
    expect(endedWithParent(undefined)).toBe(false);
  });
});
