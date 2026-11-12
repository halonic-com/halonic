import { errorKindOf } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { TauriPickedFolders } from "./picked-folders.ts";
import type { TauriShell, TrustRefusalKind } from "./shell.ts";

/** A shell that keeps every call and refuses each with `refusal`, when it is set. */
class FakePickedShell implements TauriShell {
  readonly calls: { command: string; args: Record<string, unknown> | undefined }[] = [];
  refusal: unknown;

  async invoke(command: string, args?: Record<string, unknown>): Promise<unknown> {
    this.calls.push({ command, args });
    if (this.refusal !== undefined) {
      throw this.refusal;
    }
    return null;
  }
}

/** The error a call rejects with. */
async function rejection(action: Promise<unknown>): Promise<unknown> {
  return action.then(
    () => expect.unreachable("the call should have failed"),
    (reason: unknown) => reason,
  );
}

verifies("fs-tauri.picked-folders", () => {
  describe("TauriPickedFolders", () => {
    it("sends the location as given to reopen_folder and forget_folder", async () => {
      const shell = new FakePickedShell();
      const picked = new TauriPickedFolders(shell);
      await picked.reopen("/work/acme");
      await picked.forget("/work/acme/");
      expect(shell.calls).toEqual([
        { command: "reopen_folder", args: { location: "/work/acme" } },
        { command: "forget_folder", args: { location: "/work/acme/" } },
      ]);
    });

    it.each<[TrustRefusalKind, string]>([
      ["folder_missing", "not_found"],
      ["not_picked", "denied"],
      ["folder_changed", "denied"],
      ["folder_unreadable", "denied"],
      ["io", "unavailable"],
    ])("rejects a %s refusal as %s, keeping the shell's message", async (kind, expected) => {
      const shell = new FakePickedShell();
      shell.refusal = { kind, message: `"/work/acme" was refused as ${kind}` };
      const error = await rejection(new TauriPickedFolders(shell).reopen("/work/acme"));
      expect(errorKindOf(error)).toBe(expected);
      expect((error as Error).message).toContain(`refused as ${kind}`);
    });

    it("rejects as unavailable, without its text, what isn't the shell's refusal", async () => {
      const shell = new FakePickedShell();
      shell.refusal = "command forget_folder not allowed by capability desktop-trust";
      const error = await rejection(new TauriPickedFolders(shell).forget("/work/acme"));
      expect(errorKindOf(error)).toBe("unavailable");
      expect((error as Error).message).not.toContain("capability");
    });
  });
});
