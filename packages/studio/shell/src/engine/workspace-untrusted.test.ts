import { KindedError } from "@halonicjs/std";
import { describe, expect, it } from "vitest";
import { isUntrustedRefusal, WorkspaceUntrusted } from "./workspace-untrusted.ts";

describe("isUntrustedRefusal", () => {
  it("is true for the engine's refusal of a workspace that isn't trusted, as a class or a plain shape", () => {
    expect(isUntrustedRefusal(new WorkspaceUntrusted("This workspace isn't trusted yet."))).toBe(
      true,
    );
    expect(
      isUntrustedRefusal({ kind: "denied", code: "workspace.untrusted", message: "Not trusted." }),
    ).toBe(true);
  });

  it("is false for any other denied, and for the code on another kind", () => {
    expect(isUntrustedRefusal(new KindedError("denied", "Acme isn't an opened folder."))).toBe(
      false,
    );
    expect(
      isUntrustedRefusal({ kind: "denied", code: "workspace.trust-removed", message: "Removed." }),
    ).toBe(false);
    expect(
      isUntrustedRefusal({ kind: "conflict", code: "workspace.untrusted", message: "Held." }),
    ).toBe(false);
    expect(isUntrustedRefusal(undefined)).toBe(false);
  });

  it("keeps the refusal it stands for as its cause", () => {
    const shell = new Error("403 workspace_not_trusted");
    expect(new WorkspaceUntrusted("Not trusted.", { cause: shell }).cause).toBe(shell);
  });
});
