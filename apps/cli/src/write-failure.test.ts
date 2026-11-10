import { errorKindOf } from "@halonicjs/std";
import { describe, expect, it } from "vitest";
import { WriteFailedError, writeFailure } from "./write-failure.ts";

/** An error as Node's file calls throw it, with its code. */
function nodeError(code: string): Error {
  return Object.assign(new Error(`${code}: the details`), { code });
}

describe("writeFailure", () => {
  it("says the disk is full, with the fix, for ENOSPC", () => {
    const error = writeFailure(nodeError("ENOSPC"));

    expect(error).toBeInstanceOf(WriteFailedError);
    expect(error).toMatchObject({
      message: "the disk is full.",
      fix: "Free some space, then run it again.",
      code: "disk-full",
    });
    expect(errorKindOf(error)).toBe("limit_reached");
  });

  it("says the folder can't be written for EACCES, and another app holds the file for EBUSY", () => {
    expect(writeFailure(nodeError("EACCES"))).toMatchObject({
      message: "Halonic can't write to this folder.",
      fix: undefined,
      code: "not-writable",
    });
    expect(writeFailure(nodeError("EBUSY"))).toMatchObject({
      message: "another app is using the file.",
      code: "in-use",
    });
  });

  it("keeps any other error as it is, so it shows as a bug", () => {
    const other = nodeError("EIO");

    expect(writeFailure(other)).toBe(other);
    expect(writeFailure("not an error")).toBe("not an error");
  });
});
