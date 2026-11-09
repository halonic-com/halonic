import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it } from "vitest";
import { type AdapterFailure, isRunFailureError, RunFailureError } from "./index.ts";

/** An error as another copy of this package would build it: same name and failure, other class. */
function fromOtherCopy(failure: unknown): Error {
  return Object.assign(new Error("from another copy"), { name: "RunFailureError", failure });
}

verifies("ports.run-failure-error", () => {
  it("says why the run can't go on, and keeps its cause", () => {
    const cause = new Error("spawn failed");
    const error = new RunFailureError("sandbox-start-failed", "The sandbox didn't start.", {
      cause,
    });
    expect(isRunFailureError(error)).toBe(true);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("RunFailureError");
    expect(error.failure).toBe("sandbox-start-failed");
    expect(error.message).toBe("The sandbox didn't start.");
    expect(error.cause).toBe(cause);
  });

  it("recognises the error from another copy of the package by name and failure", () => {
    expect(isRunFailureError(fromOtherCopy("disk-full"))).toBe(true);
  });

  it("turns away anything else", () => {
    expect(isRunFailureError(new Error("boom"))).toBe(false);
    // A model provider says these with ModelCallError, and the engine decides budget itself.
    expect(isRunFailureError(fromOtherCopy("model-unreachable"))).toBe(false);
    expect(isRunFailureError(fromOtherCopy("budget"))).toBe(false);
    expect(isRunFailureError({ name: "RunFailureError", failure: "disk-full", message: "" })).toBe(
      false,
    );
    expect(isRunFailureError(null)).toBe(false);
  });

  typeTest("has exactly the three failures", () => {
    expectTypeOf<AdapterFailure>().toEqualTypeOf<
      "disk-full" | "sandbox-start-failed" | "harness-start-failed"
    >();
    expectTypeOf<RunFailureError["failure"]>().toEqualTypeOf<AdapterFailure>();
  });
});
