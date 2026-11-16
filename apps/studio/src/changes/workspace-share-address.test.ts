import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { type GitAnswer, WorkspaceChanges } from "./workspace-changes.ts";

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
    digest: { sha256: async () => new Uint8Array(32) },
    onFocus: never,
    onFilesChanged: never,
  });
}

verifies("source-control.share-address", () => {
  describe("WorkspaceChanges.addRemote", () => {
    it("adds the address as the remote origin, so hasRemote turns true", async () => {
      const dir = mkdtempSync(join(tmpdir(), "share-address-"));
      try {
        const changes = history(async (args) => {
          const run = spawnSync("git", args, { cwd: dir, encoding: "utf8" });
          return { code: run.status, stdout: run.stdout, stderr: run.stderr };
        });
        spawnSync("git", ["init", "--quiet"], { cwd: dir });
        expect(await changes.hasRemote()).toBe(false);
        await changes.addRemote("git@github.com:acme/agents.git");
        expect(await changes.hasRemote()).toBe(true);
        // `config`, not `remote get-url`: the latter applies the machine's own `insteadOf` rewrites.
        const url = spawnSync("git", ["config", "--get", "remote.origin.url"], {
          cwd: dir,
          encoding: "utf8",
        });
        expect(url.stdout.trim()).toBe("git@github.com:acme/agents.git");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("asks the shell for exactly `remote add origin <address>`", async () => {
      const asked: (readonly string[])[] = [];
      const changes = history(async (args) => {
        asked.push(args);
        return { code: 0, stdout: "", stderr: "" };
      });
      await changes.addRemote("https://github.com/acme/agents.git");
      expect(asked).toEqual([["remote", "add", "origin", "https://github.com/acme/agents.git"]]);
    });

    it("says in a sentence when the workspace already has a remote", async () => {
      const changes = history(async () => ({
        code: 3,
        stdout: "",
        stderr: "error: remote origin already exists.",
      }));
      await expect(changes.addRemote("https://github.com/acme/agents.git")).rejects.toThrow(
        "already has a place to share to",
      );
    });

    it("never shows git's own output for any other refusal", async () => {
      const changes = history(async () => ({ code: 1, stdout: "", stderr: "fatal: weird thing" }));
      await expect(changes.addRemote("https://github.com/acme/agents.git")).rejects.toThrow(
        "Git didn't accept this address.",
      );
    });

    it("says git is missing when the shell found no git program", async () => {
      const changes = history(async () => {
        throw { kind: "git_not_found" };
      });
      await expect(changes.addRemote("https://github.com/acme/agents.git")).rejects.toThrow(
        "git isn't on this computer",
      );
    });
  });
});
