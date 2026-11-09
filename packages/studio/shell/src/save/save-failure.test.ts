import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { type SaveReason, saveFailureFor } from "./save-failure.ts";

function writeError(code: string, message = `${code}: write failed`): Error {
  return Object.assign(new Error(message), { code });
}

verifies("shell.save-reasons", () => {
  it.each<[string, SaveReason]>([
    ["ENOSPC", "disk-full"],
    ["EDQUOT", "disk-full"],
    ["EACCES", "not-writable"],
    ["EPERM", "not-writable"],
    ["EROFS", "not-writable"],
    ["EBUSY", "in-use"],
    ["ERROR_SHARING_VIOLATION", "in-use"],
    ["ERROR_LOCK_VIOLATION", "in-use"],
  ])("maps %s to %s and keeps the details", (code, reason) => {
    expect(saveFailureFor(writeError(code))).toEqual({
      reason,
      code,
      detail: `${code}: write failed`,
    });
  });

  it("calls any other code a failed save, with its code and message kept", () => {
    expect(saveFailureFor(writeError("EIO", "i/o error"))).toEqual({
      reason: "failed",
      code: "EIO",
      detail: "i/o error",
    });
  });

  it("doesn't match a code inherited from Object, such as toString", () => {
    expect(saveFailureFor(writeError("toString")).reason).toBe("failed");
  });

  it("calls an error without a code a failed save", () => {
    expect(saveFailureFor(new Error("the bridge closed"))).toEqual({
      reason: "failed",
      detail: "the bridge closed",
    });
    expect(saveFailureFor(writeError("")).code).toBeUndefined();
    expect(saveFailureFor(Object.assign(new Error("odd"), { code: 28 })).reason).toBe("failed");
  });

  it("reads errors that cross the desktop bridge as plain objects or text", () => {
    expect(saveFailureFor({ code: "EROFS", message: "read-only file system" })).toEqual({
      reason: "not-writable",
      code: "EROFS",
      detail: "read-only file system",
    });
    expect(saveFailureFor("disk said no")).toEqual({ reason: "failed", detail: "disk said no" });
    expect(saveFailureFor(undefined)).toEqual({ reason: "failed", detail: "undefined" });
    expect(saveFailureFor(null)).toEqual({ reason: "failed", detail: "null" });
  });
});
