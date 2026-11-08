import { describe, expect, it } from "vitest";
import { AssertionError, assert, assertDefined, assertNever } from "./assert.ts";

describe("std.assertions", () => {
  it("does nothing when the condition holds", () => {
    expect(() => assert(true, "unused")).not.toThrow();
  });

  it("throws an AssertionError with the given message when the condition fails", () => {
    expect(() => assert(false, "stepMs must be positive")).toThrow(
      new AssertionError("stepMs must be positive"),
    );
    expect(() => assert(false, "x")).toThrow(AssertionError);
  });

  it("returns a defined value, including falsy ones", () => {
    expect(assertDefined(0, "count")).toBe(0);
    expect(assertDefined("", "name")).toBe("");
  });

  it("names the missing value", () => {
    expect(() => assertDefined(undefined, "the first event")).toThrow(
      "Expected the first event to be defined, but it was undefined.",
    );
    expect(() => assertDefined(null, "the hub")).toThrow(
      "Expected the hub to be defined, but it was null.",
    );
  });

  it("names the unexpected value of an exhaustive switch", () => {
    expect(() => assertNever("loop" as never, "state type")).toThrow(
      'Unexpected state type: "loop".',
    );
  });

  it("still describes values JSON can't write", () => {
    expect(() => assertNever(10n as never, "size")).toThrow("Unexpected size: 10.");
    expect(() => assertNever(undefined as never, "kind")).toThrow("Unexpected kind: undefined.");
  });

  it("gives the error its own name", () => {
    expect(new AssertionError("x").name).toBe("AssertionError");
  });
});
