import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { CantTryError, isCantTryError, isRunFailureError } from "./index.ts";

const reason = { kind: "needs-left-out-change", path: "models.yaml", leftOut: "models" } as const;

/** An error as another copy of this package would build it: same name and fields, other class. */
function fromOtherCopy(fields: Record<string, unknown>): Error {
  return Object.assign(new Error("from another copy"), { name: "CantTryError", ...fields });
}

verifies("ports.cant-try-error", () => {
  it("says which item can't be tried and why", () => {
    const error = new CantTryError("workflows/triage.yaml", reason, "Alias smart is new.");
    expect(isCantTryError(error)).toBe(true);
    expect(isRunFailureError(error)).toBe(false);
    expect(error).toMatchObject({
      name: "CantTryError",
      item: "workflows/triage.yaml",
      reason,
      message: "Alias smart is new.",
    });
  });

  it("recognises the error from another copy of the package", () => {
    expect(isCantTryError(fromOtherCopy({ item: "workflows/triage.yaml", reason }))).toBe(true);
  });

  it("turns away anything else", () => {
    expect(isCantTryError(new Error("boom"))).toBe(false);
    expect(isCantTryError(fromOtherCopy({ reason }))).toBe(false);
    expect(isCantTryError(fromOtherCopy({ item: "a.yaml", reason: { kind: "other" } }))).toBe(
      false,
    );
    expect(isCantTryError(fromOtherCopy({ item: "a.yaml", reason: null }))).toBe(false);
    expect(isCantTryError({ name: "CantTryError", item: "a.yaml", reason })).toBe(false);
  });
});
