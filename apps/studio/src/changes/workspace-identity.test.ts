import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { type GitAnswer, WorkspaceChanges } from "./workspace-changes.ts";
import { choicesMemory } from "./workspace-merge.ts";

/** A history that runs the given git, with files that are never touched. */
function history(git: (args: readonly string[]) => Promise<GitAnswer>) {
  const files = {
    read: async () => null,
    write: async () => ({ status: "written" as const }),
    remove: async () => ({ status: "removed" as const }),
  };
  const never = () => () => undefined;
  return new WorkspaceChanges({
    git,
    files,
    copies: files,
    choices: choicesMemory(undefined, "test"),
    digest: { sha256: async () => new Uint8Array(32) },
    onFocus: never,
    onFilesChanged: never,
  });
}

verifies("source-control.identity", () => {
  describe("WorkspaceChanges identity", () => {
    it("asks the shell for exactly `config --get` and `config <key> <value>`", async () => {
      const asked: (readonly string[])[] = [];
      const changes = history(async (args) => {
        asked.push(args);
        return { code: 0, stdout: "Sam\n", stderr: "" };
      });
      await changes.readIdentity();
      await changes.setIdentity({ name: "Sam Smith", email: "sam@acme.example" });
      expect(asked).toEqual([
        ["config", "--get", "user.name"],
        ["config", "--get", "user.email"],
        ["config", "user.name", "Sam Smith"],
        ["config", "user.email", "sam@acme.example"],
      ]);
    });

    it("reads a setting git doesn't have as an empty text", async () => {
      const changes = history(async () => ({ code: 1, stdout: "", stderr: "" }));
      expect(await changes.readIdentity()).toEqual({ name: "", email: "" });
    });

    it("saves in the repository's own config and reads it back", async () => {
      const dir = mkdtempSync(join(tmpdir(), "identity-"));
      try {
        // Only this repository's own config counts: not the machine's, not a runner's.
        const env = {
          ...Object.fromEntries(
            Object.entries(process.env).filter(([key]) => !/^(GIT_|XDG_)/.test(key)),
          ),
          HOME: dir,
          GIT_CONFIG_NOSYSTEM: "1",
        };
        const changes = history(async (args) => {
          const run = spawnSync("git", args, { cwd: dir, encoding: "utf8", env });
          return { code: run.status, stdout: run.stdout, stderr: run.stderr };
        });
        spawnSync("git", ["init", "--quiet"], { cwd: dir, env });
        await changes.setIdentity({ name: "Sam Smith", email: "sam@acme.example" });
        expect(await changes.readIdentity()).toEqual({
          name: "Sam Smith",
          email: "sam@acme.example",
        });
        const local = spawnSync("git", ["config", "--local", "--get", "user.email"], {
          cwd: dir,
          encoding: "utf8",
          env,
        });
        expect(local.stdout.trim()).toBe("sam@acme.example");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("says why when git refuses, without git's own words", async () => {
      const changes = history(async () => ({
        code: 255,
        stdout: "",
        stderr: "error: could not lock config file .git/config: File exists",
      }));
      await expect(
        changes.setIdentity({ name: "Sam", email: "sam@acme.example" }),
      ).rejects.toMatchObject({ message: "Git didn't accept this name and email." });
    });
  });
});
