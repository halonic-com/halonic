import { KindedError } from "@halonicjs/std";
import { describe, expect, it } from "vitest";
import { isFolderNotOpen } from "./folder-not-open.ts";
import { WorkspaceUntrusted } from "./workspace-untrusted.ts";

const shellRefusal = {
  kind: "folder_not_open",
  message: "/workspaces/acme is not an opened folder",
};

describe("isFolderNotOpen", () => {
  it("is true for a denied whose cause, or a cause further in, is the shell's folder_not_open", () => {
    const store = new KindedError("denied", "The run store refused the call: …", {
      cause: shellRefusal,
    });
    expect(isFolderNotOpen(store)).toBe(true);
    expect(isFolderNotOpen(new KindedError("denied", "Couldn't start.", { cause: store }))).toBe(
      true,
    );
  });

  it("is false for the untrusted refusal, another denied, another kind, or a cause that loops", () => {
    expect(isFolderNotOpen(new WorkspaceUntrusted("This workspace isn't trusted yet."))).toBe(
      false,
    );
    expect(isFolderNotOpen(new KindedError("denied", "The computer refused the call."))).toBe(
      false,
    );
    expect(isFolderNotOpen(new KindedError("unavailable", "…", { cause: shellRefusal }))).toBe(
      false,
    );
    const looping: { kind: string; cause?: unknown } = { kind: "denied" };
    looping.cause = looping;
    expect(isFolderNotOpen(looping)).toBe(false);
  });
});
