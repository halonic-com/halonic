import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it } from "vitest";
import { isModelCallError, ModelCallError, type ModelCallErrorReason } from "./index.ts";

/** An error as another copy of this package would build it: same name and reason, other class. */
function fromOtherCopy(reason: unknown): Error {
  return Object.assign(new Error("from another copy"), { name: "ModelCallError", reason });
}

verifies("ports.model-call-error", () => {
  it("says why the call failed", () => {
    const error = new ModelCallError("offline", "no route to host");
    expect(isModelCallError(error)).toBe(true);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("ModelCallError");
    expect(error.reason).toBe("offline");
    expect(error.message).toBe("no route to host");
  });

  it("keeps the cause it was given", () => {
    const cause = new TypeError("fetch failed");
    expect(new ModelCallError("offline", "unreachable", { cause }).cause).toBe(cause);
  });

  it("recognises the error from another copy of the package by name and reason", () => {
    expect(isModelCallError(fromOtherCopy("model-missing"))).toBe(true);
  });

  it("turns away anything else", () => {
    expect(isModelCallError(new Error("boom"))).toBe(false);
    expect(isModelCallError(fromOtherCopy("busy"))).toBe(false);
    expect(isModelCallError(fromOtherCopy(undefined))).toBe(false);
    expect(isModelCallError({ name: "ModelCallError", reason: "offline", message: "" })).toBe(
      false,
    );
    expect(isModelCallError(null)).toBe(false);
    expect(isModelCallError("ModelCallError")).toBe(false);
  });

  typeTest("has exactly the five reasons", () => {
    expectTypeOf<ModelCallErrorReason>().toEqualTypeOf<
      "no-key" | "offline" | "model-missing" | "model-no-tools" | "refused"
    >();
    expectTypeOf<ModelCallError["reason"]>().toEqualTypeOf<ModelCallErrorReason>();
  });
});
