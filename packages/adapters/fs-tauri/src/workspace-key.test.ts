import { errorKindOf } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { ShellCall } from "./fake-shell.test-helper.ts";
import type { TauriShell } from "./shell.ts";
import { readWorkspaceKey } from "./workspace-key.ts";

// Built, not written out, so a secret scanner doesn't take it for a real key.
const key = "ab".repeat(16);

/** A shell that records its calls and answers each with `answer`, or rejects with `refusal`. */
function shellAnswering(answer: unknown, refusal?: unknown): TauriShell & { calls: ShellCall[] } {
  const calls: ShellCall[] = [];
  return {
    calls,
    async invoke(command, args) {
      calls.push({ command, args });
      if (refusal !== undefined) {
        throw refusal;
      }
      return answer;
    },
  };
}

/** The error a call rejects with. */
async function rejection(action: Promise<unknown>): Promise<unknown> {
  return action.then(
    () => expect.unreachable("the call should have failed"),
    (reason: unknown) => reason,
  );
}

verifies("fs-tauri.workspace-key", () => {
  describe("readWorkspaceKey", () => {
    it("asks the shell with the folder only and answers its key", async () => {
      const shell = shellAnswering({ key });
      expect(await readWorkspaceKey(shell, "/work/acme")).toBe(key);
      expect(shell.calls).toEqual([
        { command: "workspace_key", args: { workspace: "/work/acme" } },
      ]);
    });

    it("rejects as denied when the shell says the folder isn't open", async () => {
      const shell = shellAnswering(undefined, {
        kind: "folder_not_open",
        message: "/work/acme is not an opened folder",
      });
      expect(errorKindOf(await rejection(readWorkspaceKey(shell, "/work/acme")))).toBe("denied");
    });

    it.each([
      ["no answer", undefined],
      ["a path instead of a key", { key: "/profile/workspaces/abc" }],
      ["an upper-case key", { key: key.toUpperCase() }],
      ["a short key", { key: "abc" }],
      ["a key that isn't text", { key: 7 }],
    ])("rejects as unavailable for %s", async (_name, answer) => {
      const shell = shellAnswering(answer);
      expect(errorKindOf(await rejection(readWorkspaceKey(shell, "/work/acme")))).toBe(
        "unavailable",
      );
    });

    it("rejects as unavailable when the call itself fails", async () => {
      const shell = shellAnswering(undefined, new Error("no IPC"));
      expect(errorKindOf(await rejection(readWorkspaceKey(shell, "/work/acme")))).toBe(
        "unavailable",
      );
    });
  });
});
