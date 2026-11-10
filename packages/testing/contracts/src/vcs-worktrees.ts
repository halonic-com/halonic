import { expect, it } from "vitest";
import type { MakeVcs } from "./vcs-harness.ts";
import { changesOf, commitFile, lines, stateOf } from "./vcs-helpers.ts";

/**
 * The {@link Vcs} contract's cases for worktrees, the changes in one, and
 * applying or reversing a patch (port version 2).
 */
export function vcsWorktreeCases(make: MakeVcs): void {
  worktreeCases(make);
  worktreeListCases(make);
  diffBetweenCases(make);
  applyPatchCases(make);
}

function worktreeCases(make: MakeVcs): void {
  it("adds a worktree holding a snapshot's files, and leaves the workspace as it was", async () => {
    const harness = await make.repo({ "a.yaml": "1\n", "agents/b.agent.yaml": "b\n" });
    const { vcs, files } = harness;
    await files.write("a.yaml", "2\n");
    await files.write("c.yaml", "new\n");
    const snapshot = await vcs.snapshot();
    const before = await stateOf(harness);

    const worktree = await vcs.addWorktree(snapshot);
    const inWorktree = harness.worktreeFiles(worktree);
    expect(await inWorktree.list()).toEqual(["a.yaml", "agents/b.agent.yaml", "c.yaml"]);
    expect(await inWorktree.read("a.yaml")).toBe("2\n");
    expect(await vcs.listWorktrees()).toEqual([worktree]);
    expect(await stateOf(harness)).toEqual(before);
  });

  it("keeps a worktree's files and the workspace's files apart", async () => {
    const harness = await make.repo({ "a.yaml": "1\n" });
    const { vcs, files } = harness;
    const worktree = await vcs.addWorktree(await vcs.snapshot());
    const inWorktree = harness.worktreeFiles(worktree);

    await inWorktree.write("a.yaml", "from the worktree\n");
    await inWorktree.write("b.yaml", "new\n");
    await files.write("a.yaml", "from the workspace\n");
    expect(await files.read("a.yaml")).toBe("from the workspace\n");
    expect(await files.read("b.yaml")).toBeNull();
    expect(await inWorktree.read("a.yaml")).toBe("from the worktree\n");
    expect(await changesOf(vcs.status())).toEqual([
      { path: "a.yaml", status: "modified", staged: false },
    ]);
  });

  it("adds a worktree at an older commit", async () => {
    const harness = await make.repo({ "a.yaml": "1\n" });
    const [first] = await harness.vcs.log(1);
    await commitFile(harness, "a.yaml", "2\n", "Change a");
    const worktree = await harness.vcs.addWorktree(String(first?.hash));
    expect(await harness.worktreeFiles(worktree).read("a.yaml")).toBe("1\n");
  });
}

function worktreeListCases(make: MakeVcs): void {
  it("gives every worktree its own id and folder, and lists only the ones it added", async () => {
    const harness = await make.repo({ "a.yaml": "1\n" });
    const { vcs } = harness;
    expect(await vcs.listWorktrees()).toEqual([]);
    const snapshot = await vcs.snapshot();
    const first = await vcs.addWorktree(snapshot);
    const second = await vcs.addWorktree(snapshot);
    expect(second.id).not.toBe(first.id);
    expect(second.path).not.toBe(first.path);
    expect(byId(await vcs.listWorktrees())).toEqual(byId([first, second]));
    expect([first.path, second.path]).not.toContain(harness.files.location);
  });

  it("removes a worktree with changed files, and only that one", async () => {
    const harness = await make.repo({ "a.yaml": "1\n" });
    const { vcs } = harness;
    const snapshot = await vcs.snapshot();
    const removed = await vcs.addWorktree(snapshot);
    const kept = await vcs.addWorktree(snapshot);
    await harness.worktreeFiles(removed).write("a.yaml", "2\n");
    await harness.worktreeFiles(removed).write("b.yaml", "new\n");

    await vcs.removeWorktree(removed.id);
    expect(await vcs.listWorktrees()).toEqual([kept]);
    await expect(vcs.diffBetween(snapshot, removed.id)).rejects.toThrow();
    expect(await vcs.diffBetween(snapshot, kept.id)).toEqual([]);
  });

  it("refuses to remove or diff a worktree it doesn't know, and changes nothing", async () => {
    const harness = await make.repo({ "a.yaml": "1\n" });
    const { vcs } = harness;
    const snapshot = await vcs.snapshot();
    const worktree = await vcs.addWorktree(snapshot);
    const before = await stateOf(harness);
    await expect(vcs.removeWorktree("missing")).rejects.toThrow();
    await expect(vcs.diffBetween(snapshot, "missing")).rejects.toThrow();
    expect(await vcs.listWorktrees()).toEqual([worktree]);
    expect(await stateOf(harness)).toEqual(before);
  });
}

function diffBetweenCases(make: MakeVcs): void {
  it("lists the files a worktree added, changed and deleted, sorted, with a diff each", async () => {
    const harness = await make.repo({
      "a.yaml": "one\ntwo\n",
      "c.yaml": "gone\n",
      "d.yaml": "1\n",
    });
    const { vcs } = harness;
    const snapshot = await vcs.snapshot();
    const worktree = await vcs.addWorktree(snapshot);
    const inWorktree = harness.worktreeFiles(worktree);
    await inWorktree.remove("c.yaml");
    await inWorktree.write("b.yaml", "new\n");
    await inWorktree.write("a.yaml", "one\nthree\n");
    const before = await stateOf(harness);

    const changes = await vcs.diffBetween(snapshot, worktree.id);
    expect(changes.map(({ path, status }) => ({ path, status }))).toEqual([
      { path: "a.yaml", status: "modified" },
      { path: "b.yaml", status: "added" },
      { path: "c.yaml", status: "deleted" },
    ]);
    const [changed, added, deleted] = changes.map((change) => lines(change.diff));
    expect(changed).toEqual(expect.arrayContaining(["-two", "+three", " one"]));
    expect(added).toEqual(expect.arrayContaining(["--- /dev/null", "+new"]));
    expect(deleted).toEqual(expect.arrayContaining(["+++ /dev/null", "-gone"]));

    // Asking changes neither the worktree nor the workspace.
    expect(await inWorktree.list()).toEqual(["a.yaml", "b.yaml", "d.yaml"]);
    expect(await vcs.diffBetween(snapshot, worktree.id)).toEqual(changes);
    expect(await stateOf(harness)).toEqual(before);
  });

  it("lists nothing for a worktree with no changes", async () => {
    const harness = await make.repo({ "a.yaml": "1\n" });
    const snapshot = await harness.vcs.snapshot();
    const worktree = await harness.vcs.addWorktree(snapshot);
    expect(await harness.vcs.diffBetween(snapshot, worktree.id)).toEqual([]);
  });

  it("gives diffs that apply to the workspace and give it the worktree's files", async () => {
    const harness = await make.repo({ "a.yaml": "one\ntwo\n", "c.yaml": "gone\n" });
    const { vcs, files } = harness;
    const snapshot = await vcs.snapshot();
    const worktree = await vcs.addWorktree(snapshot);
    const inWorktree = harness.worktreeFiles(worktree);
    await inWorktree.write("a.yaml", "one\nthree\n");
    await inWorktree.write("b.yaml", "new\n");
    await inWorktree.remove("c.yaml");

    for (const change of await vcs.diffBetween(snapshot, worktree.id)) {
      await vcs.applyPatch(change.diff, { reverse: false });
    }
    expect((await files.list()).sort()).toEqual(["a.yaml", "b.yaml"]);
    expect(await files.read("a.yaml")).toBe("one\nthree\n");
    expect(await files.read("b.yaml")).toBe("new\n");
  });
}

/** Ten lines, so two changes to them make two hunks. */
const tenLines = "a\nb\nc\nd\ne\nf\ng\nh\ni\nj\n";

/** The patch header for `a.yaml`, then `hunks`. */
function patchOf(...hunks: string[]): string {
  return `diff --git a/a.yaml b/a.yaml\n--- a/a.yaml\n+++ b/a.yaml\n${hunks.join("")}`;
}

/** Changes line 2 of {@link tenLines} from `b` to `B`. */
const firstHunk = "@@ -1,5 +1,5 @@\n a\n-b\n+B\n c\n d\n e\n";
/** Changes line 9 of {@link tenLines} from `i` to `I`. */
const secondHunk = "@@ -6,5 +6,5 @@\n f\n g\n h\n-i\n+I\n j\n";

function applyPatchCases(make: MakeVcs): void {
  it("applies one hunk to the working tree only, and reversing it gives the file back", async () => {
    const harness = await make.repo({ "a.yaml": tenLines });
    const { vcs, files } = harness;
    await vcs.applyPatch(patchOf(secondHunk), { reverse: false });
    expect(await files.read("a.yaml")).toBe(tenLines.replace("i\n", "I\n"));
    expect(await changesOf(vcs.status())).toEqual([
      { path: "a.yaml", status: "modified", staged: false },
    ]);
    expect(await vcs.diff("a.yaml", true)).toBe("");

    await vcs.applyPatch(patchOf(secondHunk), { reverse: true });
    expect(await files.read("a.yaml")).toBe(tenLines);
    expect((await vcs.status()).changes).toEqual([]);
  });

  it("reverses one hunk of two, and keeps the other", async () => {
    const { vcs, files } = await make.repo({ "a.yaml": tenLines });
    await files.write("a.yaml", tenLines.replace("b\n", "B\n").replace("i\n", "I\n"));
    await vcs.applyPatch(patchOf(secondHunk), { reverse: true });
    expect(await files.read("a.yaml")).toBe(tenLines.replace("b\n", "B\n"));
  });

  it("applies a patch of two hunks in one go", async () => {
    const { vcs, files } = await make.repo({ "a.yaml": tenLines });
    await vcs.applyPatch(patchOf(firstHunk, secondHunk), { reverse: false });
    expect(await files.read("a.yaml")).toBe(tenLines.replace("b\n", "B\n").replace("i\n", "I\n"));
  });

  it("refuses to reverse a hunk that isn't there, and changes nothing", async () => {
    const harness = await make.repo({ "a.yaml": tenLines });
    const before = await stateOf(harness);
    await expect(harness.vcs.applyPatch(patchOf(secondHunk), { reverse: true })).rejects.toThrow();
    expect(await stateOf(harness)).toEqual(before);
  });
}

/** The worktrees sorted by id, because the port doesn't promise an order. */
function byId<T extends { id: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.id === b.id) return 0;
    return a.id < b.id ? -1 : 1;
  });
}
