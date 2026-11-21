import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { type GitAnswer, WorkspaceChanges } from "./workspace-changes.ts";
import { choicesMemory } from "./workspace-merge.ts";

const answer = (stdout: string, code = 0, stderr = ""): GitAnswer => ({ code, stdout, stderr });

/** A history that runs the given git, with files that are never touched. */
function history(git: (args: readonly string[]) => Promise<GitAnswer>) {
  const files = {
    read: async () => null,
    write: async () => ({ status: "written" as const }),
    remove: async () => ({ status: "removed" as const }),
  };
  const never = () => () => undefined;
  const changes = new WorkspaceChanges({
    git,
    files,
    copies: files,
    choices: choicesMemory(undefined, "test"),
    digest: { sha256: async () => new Uint8Array(32) },
    onFocus: never,
    onFilesChanged: never,
  });
  return { changes };
}

verifies("source-control.get-updates", () => {
  // Most of these run real git: two clones and up to five pushes before the test itself, which takes
  // over 5 s on a loaded machine (HAL-14641). Give them the 30 s that CI gives every test.
  describe("WorkspaceChanges.getUpdates", { timeout: 30_000 }, () => {
    const real = (dir: string) =>
      history(async (args) => {
        const run = spawnSync(
          "git",
          ["-c", "user.name=T", "-c", "user.email=t@example.com", ...args],
          { cwd: dir, encoding: "utf8" },
        );
        return { code: run.status, stdout: run.stdout, stderr: run.stderr };
      }).changes;

    /** A shared repository and a clone of it; `sam` is a second clone that can publish versions. */
    function shared() {
      const root = mkdtempSync(join(tmpdir(), "updates-"));
      const run = (cwd: string, ...args: string[]) =>
        execFileSync("git", ["-c", "user.name=T", "-c", "user.email=t@example.com", ...args], {
          cwd,
          encoding: "utf8",
        });
      run(root, "init", "--quiet", "--bare", "origin.git");
      run(root, "clone", "--quiet", "origin.git", "mine");
      const mine = join(root, "mine");
      writeFileSync(join(mine, "a.md"), "one\n");
      run(mine, "add", "--all");
      run(mine, "commit", "-m", "first", "--quiet");
      run(mine, "push", "--quiet", "origin", "HEAD");
      run(root, "clone", "--quiet", "origin.git", "sam");
      const sam = join(root, "sam");
      const publish = (file: string, text: string) => {
        writeFileSync(join(sam, file), text);
        run(sam, "add", "--all");
        run(sam, "commit", "-m", `Sam: ${file}`, "--quiet");
        run(sam, "push", "--quiet", "origin", "HEAD");
      };
      return { root, mine, run, publish };
    }

    it("counts the versions it got and puts the files in the folder", async () => {
      const { root, mine, publish } = shared();
      try {
        publish("b.md", "two\n");
        publish("c.md", "three\n");
        const changes = real(mine);
        expect(await changes.getUpdates()).toEqual({ kind: "got", count: 2 });
        expect(readFileSync(join(mine, "c.md"), "utf8")).toBe("three\n");
        expect(await changes.getUpdates()).toEqual({ kind: "up-to-date" });
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });

    it("changes nothing when both sides have new versions", async () => {
      const { root, mine, run, publish } = shared();
      try {
        publish("b.md", "two\n");
        writeFileSync(join(mine, "c.md"), "mine\n");
        run(mine, "add", "--all");
        run(mine, "commit", "-m", "mine", "--quiet");
        const head = run(mine, "rev-parse", "HEAD");
        expect(await real(mine).getUpdates()).toEqual({ kind: "both-moved" });
        expect(run(mine, "rev-parse", "HEAD")).toBe(head);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });

    it("says that updates would overwrite changes that aren't in a version", async () => {
      const { root, mine, publish } = shared();
      try {
        publish("b.md", "two\n");
        writeFileSync(join(mine, "b.md"), "mine\n");
        await expect(real(mine).getUpdates()).rejects.toThrow("Create a version first");
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });

    it("gets updates from the shared copy's branch of the same name when the branch tracks none", async () => {
      const { root, mine, run, publish } = shared();
      try {
        run(mine, "branch", "--unset-upstream");
        publish("b.md", "two\n");
        expect(await real(mine).getUpdates()).toEqual({ kind: "got", count: 1 });
        expect(readFileSync(join(mine, "b.md"), "utf8")).toBe("two\n");
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });

    it("says it isn't set up to get updates when there is no shared copy", async () => {
      const root = mkdtempSync(join(tmpdir(), "updates-"));
      try {
        execFileSync("git", ["init", "--quiet"], { cwd: root });
        await expect(real(root).getUpdates()).rejects.toThrow("isn't set up to get updates");
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });

    it("says it isn't set up to get updates when the shared copy has no such branch", async () => {
      const { root, mine, run } = shared();
      try {
        run(mine, "switch", "--quiet", "-c", "only-mine");
        await expect(real(mine).getUpdates()).rejects.toThrow("isn't set up to get updates");
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });

    it("says the shared copy can't be reached, never showing git's words", async () => {
      const { changes } = history(async () =>
        answer("", 1, "fatal: unable to access 'https://example.invalid/': Could not resolve host"),
      );
      await expect(changes.getUpdates()).rejects.toThrow("you can't reach the shared copy");
    });

    it("says git is missing when the shell found no git program", async () => {
      const { changes } = history(async () => {
        throw { kind: "git_not_found" };
      });
      await expect(changes.getUpdates()).rejects.toThrow("git isn't on this computer");
    });

    it("has a remote only when git lists one", async () => {
      const lists = (out: string) => history(async () => answer(out)).changes.hasRemote();
      expect(await lists("origin\n")).toBe(true);
      expect(await lists("")).toBe(false);
    });
  });
});
