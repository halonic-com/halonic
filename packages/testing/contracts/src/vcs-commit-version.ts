import type { Vcs, VcsChange } from "@halonicjs/ports";
import { expect, it } from "vitest";
import { type MakeVcs, optionLikeMessages, type VcsHarness } from "./vcs-harness.ts";
import { changesOf, commitHash, sortChanges, stagedDiffs, stateOf } from "./vcs-helpers.ts";

/**
 * The {@link Vcs} contract's cases for Create version (port version 2,
 * plan point 8): `commitVersion` commits the changes on disk, except the
 * ones it is told to leave out, which keep their content at HEAD and stay
 * changes. It never touches the working tree. Its safety cases are in
 * `vcs-commit-version-safety.ts`.
 */
export function vcsCommitVersionCases(make: MakeVcs): void {
  commitCases(make);
  firstCommitAndMessageCases(make);
  excludeCases(make);
  renameAndFolderCases(make);
  includeCases(make);
}

/** The id of the commit HEAD names. */
async function headOf(vcs: Vcs): Promise<string> {
  const [head] = await vcs.log(1);
  if (head === undefined) throw new Error("The repository has no commit.");
  return head.hash;
}

/** Every file's content in the workspace folder, private entries included: a version never changes one. */
export async function filesOf(harness: VcsHarness, privatePaths: readonly string[] = []) {
  const { files } = await stateOf(harness);
  const kept = await Promise.all(
    privatePaths.map(async (path) => [path, await harness.readPrivate(path)]),
  );
  return { ...files, ...Object.fromEntries(kept) };
}

/** The changes that touch one of `paths`, by either side of a rename. */
function changesTo(changes: VcsChange[], paths: readonly string[]): VcsChange[] {
  const touches = (path: string | undefined) =>
    path !== undefined && paths.some((each) => path === each || path.startsWith(`${each}/`));
  return sortChanges(changes.filter((change) => touches(change.path) || touches(change.from)));
}

function commitCases(make: MakeVcs): void {
  it("commits every change on disk, new, changed and deleted files alike, and leaves the files as they were", async () => {
    const harness = await make.repo({ "a.yaml": "1\n", "b.yaml": "1\n", "c.yaml": "1\n" });
    const { vcs, files } = harness;
    const before = await headOf(vcs);
    await files.write("a.yaml", "2\n");
    await files.remove("b.yaml");
    await files.write("d.yaml", "new\n");
    const onDisk = await filesOf(harness);

    const version = await vcs.commitVersion({ message: "Create version", exclude: [] });
    expect(version).toMatch(commitHash);
    const [head] = await vcs.log(2);
    expect(head?.hash).toBe(version);
    expect(head?.message).toBe("Create version");
    expect(await harness.parentsOf(version)).toEqual([before]);
    expect(await vcs.listAt(version)).toEqual(["a.yaml", "c.yaml", "d.yaml"]);
    expect(await vcs.readAt(version, "a.yaml")).toBe("2\n");
    expect(await vcs.readAt(version, "d.yaml")).toBe("new\n");

    // The working tree is never touched, and nothing is left to commit.
    expect(await filesOf(harness)).toEqual(onDisk);
    const status = await vcs.status();
    expect(status.branch).toBe("main");
    expect(status.changes).toEqual([]);
  });

  it("commits what is on disk, not what is staged", async () => {
    const harness = await make.repo({ "a.yaml": "1\n" });
    const { vcs, files } = harness;
    await files.write("a.yaml", "2\n");
    await vcs.stage(["a.yaml"]);
    await files.write("a.yaml", "3\n");

    const version = await vcs.commitVersion({ message: "Create version", exclude: [] });
    expect(await vcs.readAt(version, "a.yaml")).toBe("3\n");
    expect(await files.read("a.yaml")).toBe("3\n");
    expect((await vcs.status()).changes).toEqual([]);
  });
}

function firstCommitAndMessageCases(make: MakeVcs): void {
  it("makes the first commit of a repository with none", async () => {
    const harness = await make.folder({ "a.yaml": "1\n" });
    const { vcs, files } = harness;
    await vcs.init();
    await files.write("b.yaml", "2\n");

    const version = await vcs.commitVersion({ message: "First version", exclude: ["b.yaml"] });
    expect(await harness.parentsOf(version)).toEqual([]);
    // `init` may write an ignore file of its own, which the version then holds too.
    expect(await vcs.listAt(version)).toContain("a.yaml");
    expect(await vcs.listAt(version)).not.toContain("b.yaml");
    expect((await vcs.log(5)).map((commit) => commit.hash)).toEqual([version]);
    expect(await changesOf(vcs.status())).toEqual([
      { path: "b.yaml", status: "untracked", staged: false },
    ]);
  });

  it("commits each message as the message, whatever it starts with", async () => {
    const { vcs, files } = await make.repo({ "a.yaml": "0\n" });
    for (const [index, message] of optionLikeMessages.entries()) {
      await files.write("a.yaml", `${index + 1}\n`);
      const version = await vcs.commitVersion({ message, exclude: [] });
      const [head] = await vcs.log(1);
      expect(head, message).toEqual(expect.objectContaining({ hash: version, message }));
      expect(await vcs.readAt(version, "a.yaml")).toBe(`${index + 1}\n`);
    }
  });

  it("refuses when every change is left out, and changes nothing", async () => {
    // Proposed with the cases (HAL-3317), as `commit` refuses with nothing staged.
    const harness = await make.repo({ "a.yaml": "1\n" });
    const { vcs, files } = harness;
    await files.write("a.yaml", "2\n");
    const before = await stateOf(harness);
    await expect(vcs.commitVersion({ message: "Nothing", exclude: ["a.yaml"] })).rejects.toThrow();
    expect(await stateOf(harness)).toEqual(before);
  });
}

function excludeCases(make: MakeVcs): void {
  it("keeps each excluded change out of the version, at HEAD's content, and still a change", async () => {
    const harness = await make.repo({
      "a.yaml": "1\n",
      "b.yaml": "1\n",
      "c.yaml": "1\n",
      "e.yaml": "1\n",
    });
    const { vcs, files } = harness;
    // `a.yaml` is tracked and changed: `git commit -- .` would take its working-tree text anyway.
    await files.write("a.yaml", "2\n");
    await files.remove("b.yaml");
    await files.write("c.yaml", "2\n");
    await files.write("d.yaml", "new\n");
    // An excluded change that is staged stays staged as it was.
    await files.write("e.yaml", "2\n");
    await vcs.stage(["e.yaml"]);
    await files.write("e.yaml", "3\n");
    const excluded = ["a.yaml", "b.yaml", "d.yaml", "e.yaml"];
    const leftOut = changesTo((await vcs.status()).changes, excluded);
    const staged = await stagedDiffs(harness, excluded);
    const onDisk = await filesOf(harness);

    const version = await vcs.commitVersion({ message: "Create version", exclude: excluded });
    expect(await vcs.readAt(version, "a.yaml")).toBe("1\n");
    expect(await vcs.readAt(version, "b.yaml")).toBe("1\n");
    expect(await vcs.readAt(version, "c.yaml")).toBe("2\n");
    expect(await vcs.readAt(version, "d.yaml")).toBeNull();
    expect(await vcs.readAt(version, "e.yaml")).toBe("1\n");

    // The status afterwards is exactly the excluded changes, staged as before.
    expect(await changesOf(vcs.status())).toEqual(leftOut);
    expect(await stagedDiffs(harness, excluded)).toEqual(staged);
    expect(await filesOf(harness)).toEqual(onDisk);
  });
}

function renameAndFolderCases(make: MakeVcs): void {
  it("keeps a renamed item excluded by both its paths at its old path", async () => {
    const harness = await make.repo({ "old.yaml": "x\n", "from.yaml": "y\n" });
    const { vcs } = harness;
    await vcs.rename("old.yaml", "new.yaml");
    await vcs.rename("from.yaml", "to.yaml");
    const leftOut = changesTo((await vcs.status()).changes, ["old.yaml", "new.yaml"]);
    const onDisk = await filesOf(harness);

    const version = await vcs.commitVersion({
      message: "Create version",
      exclude: ["old.yaml", "new.yaml"],
    });
    expect(await vcs.listAt(version)).toEqual(["old.yaml", "to.yaml"]);
    expect(await vcs.readAt(version, "old.yaml")).toBe("x\n");
    expect(await changesOf(vcs.status())).toEqual(leftOut);
    expect(leftOut).toEqual([
      { path: "new.yaml", status: "renamed", staged: true, from: "old.yaml" },
    ]);
    expect(await filesOf(harness)).toEqual(onDisk);
  });

  it("keeps every file under an excluded folder out of the version", async () => {
    const harness = await make.repo({ "a.yaml": "1\n", "skills/x/skill.yaml": "1\n" });
    const { vcs, files } = harness;
    await files.write("a.yaml", "2\n");
    await files.write("skills/x/skill.yaml", "2\n");
    await files.write("skills/x/notes.md", "new\n");

    const version = await vcs.commitVersion({ message: "Create version", exclude: ["skills/x"] });
    expect(await vcs.listAt(version)).toEqual(["a.yaml", "skills/x/skill.yaml"]);
    expect(await vcs.readAt(version, "skills/x/skill.yaml")).toBe("1\n");
    expect(await changesOf(vcs.status())).toEqual([
      { path: "skills/x/notes.md", status: "untracked", staged: false },
      { path: "skills/x/skill.yaml", status: "modified", staged: false },
    ]);
  });
}

function includeCases(make: MakeVcs): void {
  it("commits only the changes under include, files and folders alike", async () => {
    const harness = await make.repo({
      "agents/a.yaml": "1\n",
      "agents/b.yaml": "1\n",
      "x.yaml": "1\n",
      "y.yaml": "1\n",
    });
    const { vcs, files } = harness;
    await files.write("agents/a.yaml", "2\n");
    await files.remove("agents/b.yaml");
    await files.write("agents/c.yaml", "new\n");
    await files.write("x.yaml", "2\n");
    await files.write("y.yaml", "2\n");
    await files.write("z.yaml", "new\n");
    const onDisk = await filesOf(harness);

    const version = await vcs.commitVersion({
      message: "Create version",
      include: ["agents", "x.yaml"],
      exclude: ["agents/c.yaml"],
    });
    expect(await vcs.listAt(version)).toEqual(["agents/a.yaml", "x.yaml", "y.yaml"]);
    expect(await vcs.readAt(version, "agents/a.yaml")).toBe("2\n");
    expect(await vcs.readAt(version, "x.yaml")).toBe("2\n");
    expect(await vcs.readAt(version, "y.yaml")).toBe("1\n");
    expect(await changesOf(vcs.status())).toEqual([
      { path: "agents/c.yaml", status: "untracked", staged: false },
      { path: "y.yaml", status: "modified", staged: false },
      { path: "z.yaml", status: "untracked", staged: false },
    ]);
    expect(await filesOf(harness)).toEqual(onDisk);
  });
}
