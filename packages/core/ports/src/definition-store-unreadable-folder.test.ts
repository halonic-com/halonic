import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { isUnreadableWorkspaceFolderError, UnreadableWorkspaceFolderError } from "./index.ts";

/** An error as another copy of this package would build it: same name and path, other class. */
function fromOtherCopy(path: unknown): Error {
  return Object.assign(new Error("from another copy"), {
    name: "UnreadableWorkspaceFolderError",
    path,
  });
}

verifies("ports.unreadable-workspace-folder", () => {
  it("names the folder by its workspace path, and keeps its cause", () => {
    const cause = Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" });
    const error = new UnreadableWorkspaceFolderError("hubs/support", "The folder can't be read.", {
      cause,
    });
    expect(isUnreadableWorkspaceFolderError(error)).toBe(true);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("UnreadableWorkspaceFolderError");
    expect(error.path).toBe("hubs/support");
    expect(error.message).toBe("The folder can't be read.");
    expect(error.cause).toBe(cause);
  });

  it("recognises the error from another copy of the package by name and path", () => {
    expect(isUnreadableWorkspaceFolderError(fromOtherCopy("hubs/support"))).toBe(true);
  });

  it("turns away anything else", () => {
    expect(isUnreadableWorkspaceFolderError(new Error("boom"))).toBe(false);
    expect(isUnreadableWorkspaceFolderError(fromOtherCopy(undefined))).toBe(false);
    expect(
      isUnreadableWorkspaceFolderError({
        name: "UnreadableWorkspaceFolderError",
        path: "hubs/support",
        message: "",
      }),
    ).toBe(false);
    expect(isUnreadableWorkspaceFolderError(null)).toBe(false);
  });
});
