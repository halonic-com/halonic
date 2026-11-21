import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { findCause } from "./error-cause.ts";

class StartError extends Error {}

verifies("std.error-cause", () => {
  it("finds the error itself when it has the type", () => {
    const error = new StartError("no sandbox");
    expect(findCause(error, StartError)).toBe(error);
  });

  it("finds an error of the type further down the chain of causes", () => {
    const cause = new StartError("no sandbox");
    const wrapped = new Error("didn't start", { cause: new Error("in between", { cause }) });
    expect(findCause(wrapped, StartError)).toBe(cause);
  });

  it("finds nothing when no error in the chain has the type, or for a value that isn't an error", () => {
    expect(findCause(new Error("other", { cause: "text" }), StartError)).toBeUndefined();
    expect(findCause("text", StartError)).toBeUndefined();
  });

  it("ends at a chain that loops back on itself", () => {
    const first = new Error("first");
    const second = new Error("second", { cause: first });
    first.cause = second;
    expect(findCause(first, StartError)).toBeUndefined();
  });
});
