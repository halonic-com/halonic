import { errorKindOf } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { TauriCommandPaths } from "./command-paths.ts";
import type { TauriShell } from "./shell.ts";

/** A shell that keeps every call and answers or rejects with what it was given. */
class FakePathsShell implements TauriShell {
  readonly calls: { command: string; args: Record<string, unknown> | undefined }[] = [];

  readonly #answer: unknown;
  readonly #rejection: unknown;

  constructor(answer: unknown, rejection?: unknown) {
    this.#answer = answer;
    this.#rejection = rejection;
  }

  async invoke(command: string, args?: Record<string, unknown>): Promise<unknown> {
    this.calls.push({ command, args });
    if (this.#rejection !== undefined) {
      throw this.#rejection;
    }
    return this.#answer;
  }
}

async function rejection(action: Promise<unknown>): Promise<unknown> {
  return action.then(
    () => expect.unreachable("the call should have failed"),
    (reason: unknown) => reason,
  );
}

verifies("fs-tauri.command-paths", () => {
  describe("TauriCommandPaths", () => {
    it("sends the commands as given and gives the paths the shell found", async () => {
      const shell = new FakePathsShell({ npx: "/usr/bin/npx" });
      const found = await new TauriCommandPaths(shell).find(["npx", "uvx"]);
      expect(shell.calls).toEqual([
        { command: "command_paths", args: { commands: ["npx", "uvx"] } },
      ]);
      expect([...found]).toEqual([["npx", "/usr/bin/npx"]]);
    });

    it("leaves out a path for a command it wasn't asked about", async () => {
      const shell = new FakePathsShell({ npx: "/usr/bin/npx", sh: "/bin/sh" });
      const found = await new TauriCommandPaths(shell).find(["npx"]);
      expect([...found.keys()]).toEqual(["npx"]);
    });

    it("doesn't call the shell when there are no commands", async () => {
      const shell = new FakePathsShell({});
      expect((await new TauriCommandPaths(shell).find([])).size).toBe(0);
      expect(shell.calls).toEqual([]);
    });

    it("rejects as unavailable, without the shell's text, when the shell can't answer", async () => {
      const shell = new FakePathsShell(null, "Command command_paths not allowed by ACL");
      const error = await rejection(new TauriCommandPaths(shell).find(["npx"]));
      expect(errorKindOf(error)).toBe("unavailable");
      expect(String(error)).not.toContain("ACL");
    });

    it("rejects as unavailable when the answer isn't an object of paths", async () => {
      for (const answer of [null, ["npx"], "x", { npx: 1 }]) {
        const error = await rejection(
          new TauriCommandPaths(new FakePathsShell(answer)).find(["npx"]),
        );
        expect(errorKindOf(error)).toBe("unavailable");
      }
    });
  });
});
