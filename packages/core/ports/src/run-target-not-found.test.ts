import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { isRunTargetNotFound, RunTargetNotFound } from "./index.ts";

/** An error as another copy of this package would build it: same name and fields, other class. */
function fromOtherCopy(fields: Record<string, unknown>): Error {
  return Object.assign(new Error("from another copy"), { name: "RunTargetNotFound", ...fields });
}

verifies("ports.run-target-not-found", () => {
  it("says which kind of thing is missing and its id, and is a RangeError", () => {
    const error = new RunTargetNotFound("workflow", "tidy", "No workflow.");
    expect(isRunTargetNotFound(error)).toBe(true);
    expect(error).toBeInstanceOf(RangeError);
    expect(error).toMatchObject({
      name: "RunTargetNotFound",
      kind: "workflow",
      id: "tidy",
      message: "No workflow.",
    });
  });

  it("accepts an error from another copy of the package", () => {
    expect(isRunTargetNotFound(fromOtherCopy({ kind: "hub", id: "acme" }))).toBe(true);
  });

  it("refuses anything else", () => {
    expect(isRunTargetNotFound(new Error("no"))).toBe(false);
    expect(isRunTargetNotFound(new RangeError("no"))).toBe(false);
    expect(isRunTargetNotFound(fromOtherCopy({ kind: "model", id: "x" }))).toBe(false);
    expect(isRunTargetNotFound(fromOtherCopy({ kind: "hub" }))).toBe(false);
    expect(isRunTargetNotFound("RunTargetNotFound")).toBe(false);
  });
});
