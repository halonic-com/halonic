import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { type GitAnswer, WorkspaceChanges } from "./workspace-changes.ts";
import { choicesMemory } from "./workspace-merge.ts";

const sha256 = {
  sha256: async (bytes: Uint8Array) =>
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource)),
};

/** A shared repository, this workspace's clone of it, and Sam's, who can publish versions. */
function shared() {
  const root = mkdtempSync(join(tmpdir(), "merge-"));
  const run = (cwd: string, ...args: string[]) =>
    execFileSync(
      "git",
      [
        "-c",
        "user.name=Sam",
        "-c",
        "user.email=sam@example.com",
        "-c",
        "init.defaultBranch=main",
        ...args,
      ],
      { cwd, encoding: "utf8" },
    );
  const put = (dir: string, file: string, text: string) => {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), text);
  };
  run(root, "init", "--quiet", "--bare", "origin.git");
  run(root, "clone", "--quiet", "origin.git", "mine");
  const mine = join(root, "mine");
  put(mine, "a.md", "one\n");
  put(mine, "notes.md", "notes\n");
  put(mine, "gone.md", "gone\n");
  run(mine, "add", "--all");
  run(mine, "commit", "-m", "first", "--quiet");
  run(mine, "push", "--quiet", "origin", "HEAD");
  run(root, "clone", "--quiet", "origin.git", "sam");
  const sam = join(root, "sam");
  const memory = choicesMemory(undefined, root);
  const open = () =>
    new WorkspaceChanges({
      git: async (args) => {
        const out = spawnSync(
          "git",
          ["-c", "user.name=Me", "-c", "user.email=me@example.com", ...args],
          { cwd: mine, encoding: "utf8" },
        );
        return { code: out.status, stdout: out.stdout, stderr: out.stderr } satisfies GitAnswer;
      },
      files: new FolderDefinitionStore(mine),
      copies: new FolderDefinitionStore(mine),
      choices: memory,
      digest: sha256,
      onFocus: () => () => undefined,
      onFilesChanged: () => () => undefined,
    });
  /** Sam publishes a version that writes `files` (a `null` text deletes the file). */
  const publish = (files: Record<string, string | null>) => {
    for (const [file, text] of Object.entries(files)) {
      if (text === null) rmSync(join(sam, file));
      else put(sam, file, text);
    }
    run(sam, "add", "--all");
    run(sam, "commit", "-m", "Sam's version", "--quiet");
    run(sam, "push", "--quiet", "origin", "HEAD");
  };
  /** A version of this workspace that writes `files`. */
  const commit = (files: Record<string, string | null>) => {
    for (const [file, text] of Object.entries(files)) {
      if (text === null) rmSync(join(mine, file));
      else put(mine, file, text);
    }
    run(mine, "add", "--all");
    run(mine, "commit", "-m", "mine", "--quiet");
  };
  const read = (file: string) => readFileSync(join(mine, file), "utf8");
  return { root, mine, run, publish, commit, open, read };
}

/** Both sides changed `a.md`; Sam alone changed `b.md` (new) and deleted `gone.md`. */
function diverge(s: ReturnType<typeof shared>) {
  s.publish({ "a.md": "sam\n", "b.md": "two\n", "gone.md": null, "notes.md": "sam notes\n" });
  s.commit({ "a.md": "mine\n", "notes.md": "my notes\n" });
}

// Each test runs real git a few dozen times.
const slow = 30_000;

verifies("source-control.get-updates-per-item", () => {
  describe("WorkspaceChanges, getting updates item by item", { timeout: slow }, () => {
    it("brings in what only the shared copy changed and lists what both changed", async () => {
      const s = shared();
      try {
        diverge(s);
        const started = await s.open().startMerge();
        expect(started.kind).toBe("started");
        expect(s.read("b.md")).toBe("two\n");
        expect(existsSync(join(s.mine, "gone.md"))).toBe(false);
        expect(s.read("a.md")).toBe("mine\n");
        if (started.kind !== "started") return;
        expect(
          started.merge.items.map(({ path, mine, theirs }) => ({ path, mine, theirs })),
        ).toEqual([
          { path: "a.md", mine: "mine\n", theirs: "sam\n" },
          { path: "notes.md", mine: "my notes\n", theirs: "sam notes\n" },
        ]);
        expect(started.merge.versions).toBe(1);
        expect(started.merge.people).toEqual(["Sam"]);
        expect(s.read("a.md")).not.toContain("<<<<<<<");
      } finally {
        rmSync(s.root, { recursive: true, force: true });
      }
    });

    it("needs no choosing when one side is ahead", async () => {
      const s = shared();
      try {
        s.publish({ "b.md": "two\n" });
        expect(await s.open().startMerge()).toEqual({ kind: "not-needed" });
        expect(existsSync(join(s.mine, "b.md"))).toBe(false);
      } finally {
        rmSync(s.root, { recursive: true, force: true });
      }
    });

    it("refuses, changing nothing, when a file the shared copy changed has changes not in a version", async () => {
      const s = shared();
      try {
        diverge(s);
        writeFileSync(join(s.mine, "a.md"), "unsaved\n");
        await expect(s.open().startMerge()).rejects.toThrow("Create a version first");
        expect(s.read("a.md")).toBe("unsaved\n");
        expect(() => s.run(s.mine, "rev-parse", "--verify", "--quiet", "MERGE_HEAD")).toThrow();
      } finally {
        rmSync(s.root, { recursive: true, force: true });
      }
    });

    it("makes each choice, takes one back, and finishes as one version with two parents", async () => {
      const s = shared();
      try {
        diverge(s);
        const changes = s.open();
        await changes.startMerge();
        await changes.chooseUpdate("a.md", "theirs", "Sam's");
        expect(s.read("a.md")).toBe("sam\n");
        await changes.undoUpdateChoice("a.md");
        expect(s.read("a.md")).toBe("mine\n");
        expect(s.run(s.mine, "diff", "--cached", "--name-only")).not.toContain("a.md");
        await expect(changes.finishMerge("Merged Sam's updates")).rejects.toThrow("every item");
        await changes.chooseUpdate("a.md", "theirs", "Sam's");
        await changes.chooseUpdate("notes.md", "both", "Sam's");
        expect(s.read("notes.md")).toBe("my notes\n");
        expect(s.read("notes (Sam's).md")).toBe("sam notes\n");
        await changes.finishMerge("Merged Sam's updates");
        expect(
          s.run(s.mine, "log", "-1", "--format=%s|%P").trim().split("|")[1]?.split(" "),
        ).toHaveLength(2);
        expect(s.run(s.mine, "show", "HEAD:a.md")).toBe("sam\n");
        expect(s.run(s.mine, "show", "HEAD:notes.md")).toBe("my notes\n");
        expect(s.run(s.mine, "show", "HEAD:notes (Sam's).md")).toBe("sam notes\n");
        expect(s.run(s.mine, "show", "HEAD:b.md")).toBe("two\n");
        expect(s.run(s.mine, "status", "--porcelain")).toBe("");
        expect(await changes.readMerge()).toBeNull();
      } finally {
        rmSync(s.root, { recursive: true, force: true });
      }
    });

    it("takes Keep both back, and names a second copy when the first name is taken", async () => {
      const s = shared();
      try {
        diverge(s);
        writeFileSync(join(s.mine, "notes (Sam's).md"), "taken\n");
        const changes = s.open();
        await changes.startMerge();
        await changes.chooseUpdate("notes.md", "both", "Sam's");
        expect(s.read("notes (Sam's 2).md")).toBe("sam notes\n");
        await changes.undoUpdateChoice("notes.md");
        expect(existsSync(join(s.mine, "notes (Sam's 2).md"))).toBe(false);
        expect(s.read("notes (Sam's).md")).toBe("taken\n");
      } finally {
        rmSync(s.root, { recursive: true, force: true });
      }
    });

    it("uses the shared copy's deletion, and refuses Keep both where one side deleted", async () => {
      const s = shared();
      try {
        s.publish({ "a.md": null, "notes.md": "sam notes\n" });
        s.commit({ "a.md": "mine\n", "notes.md": null });
        const changes = s.open();
        const started = await changes.startMerge();
        if (started.kind !== "started") throw new Error("not started");
        expect(started.merge.items.map((item) => [item.path, item.mine, item.theirs])).toEqual([
          ["a.md", "mine\n", null],
          ["notes.md", null, "sam notes\n"],
        ]);
        await expect(changes.chooseUpdate("a.md", "both", "Sam's")).rejects.toThrow("twice");
        await changes.chooseUpdate("a.md", "theirs", "Sam's");
        expect(existsSync(join(s.mine, "a.md"))).toBe(false);
        await changes.undoUpdateChoice("a.md");
        expect(s.read("a.md")).toBe("mine\n");
        await changes.chooseUpdate("notes.md", "theirs", "Sam's");
        expect(s.read("notes.md")).toBe("sam notes\n");
        await changes.undoUpdateChoice("notes.md");
        expect(existsSync(join(s.mine, "notes.md"))).toBe(false);
      } finally {
        rmSync(s.root, { recursive: true, force: true });
      }
    });

    it("cancels back to how the files were, keeping changes that aren't in a version", async () => {
      const s = shared();
      try {
        diverge(s);
        const changes = s.open();
        writeFileSync(join(s.mine, "local.md"), "local\n");
        await changes.startMerge();
        await changes.chooseUpdate("notes.md", "both", "Sam's");
        await changes.chooseUpdate("a.md", "theirs", "Sam's");
        await changes.cancelMerge();
        expect(s.read("a.md")).toBe("mine\n");
        expect(existsSync(join(s.mine, "b.md"))).toBe(false);
        expect(existsSync(join(s.mine, "notes (Sam's).md"))).toBe(false);
        expect(s.read("gone.md")).toBe("gone\n");
        expect(s.read("local.md")).toBe("local\n");
        expect(await changes.readMerge()).toBeNull();
      } finally {
        rmSync(s.root, { recursive: true, force: true });
      }
    });

    it("reads a merge left half done as it was left", async () => {
      const s = shared();
      try {
        diverge(s);
        await s.open().startMerge();
        await s.open().chooseUpdate("a.md", "mine", "Sam's");
        await s.open().chooseUpdate("notes.md", "theirs", "Sam's");
        const again = await s.open().readMerge();
        expect(again?.items.map((item) => [item.path, item.choice])).toEqual([
          ["a.md", "mine"],
          ["notes.md", "theirs"],
        ]);
        expect(await s.open().startMerge()).toMatchObject({ kind: "started" });
      } finally {
        rmSync(s.root, { recursive: true, force: true });
      }
    });

    it("leaves Halonic's own folders and private files out of the merge", async () => {
      const s = shared();
      try {
        s.publish({ ".halonic/review/1.json": "{}", ".env": "SAM=1\n", "a.md": "sam\n" });
        s.commit({ ".halonic/review/1.json": "{ }", ".env": "ME=1\n", "a.md": "mine\n" });
        const started = await s.open().startMerge();
        if (started.kind !== "started") throw new Error("not started");
        expect(started.merge.items.map((item) => item.path)).toEqual(["a.md"]);
      } finally {
        rmSync(s.root, { recursive: true, force: true });
      }
    });

    it("doesn't read what only the shared copy changed as changes since the last version", async () => {
      const s = shared();
      try {
        diverge(s);
        writeFileSync(join(s.mine, "local.md"), "local\n");
        const changes = s.open();
        await changes.startMerge();
        const paths = async () => {
          const read = await changes.read();
          return read.kind === "ready" ? read.changes.map((change) => change.path).sort() : [];
        };
        expect(await paths()).toEqual(["local.md"]);
        writeFileSync(join(s.mine, "b.md"), "two, edited\n");
        expect(await paths()).toEqual(["b.md", "b.md", "local.md"]);
      } finally {
        rmSync(s.root, { recursive: true, force: true });
      }
    });
  });
});
