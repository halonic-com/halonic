import { describe, expect, it } from "vitest";
import { type MakeVcs, validBranchNames } from "./vcs-harness.ts";
import { changesOf, commitHash, lines } from "./vcs-helpers.ts";
import { vcsRemoteCases } from "./vcs-remote.ts";
import { vcsSafetyCases } from "./vcs-safety.ts";

/**
 * The contract every {@link Vcs} adapter passes. The harness builds each
 * folder, and the suite changes the working tree through the harness's
 * `files`, the way the Studio's editors do.
 */
export function vcsContract(name: string, make: MakeVcs): void {
  describe(`Vcs contract (contracts.vcs): ${name}`, () => {
    repositoryCases(make);
    statusCases(make);
    diffCases(make);
    stageCases(make);
    discardCases(make);
    commitCases(make);
    logCases(make);
    branchCases(make);
    vcsRemoteCases(make);
  });

  describe(`Vcs safety contract (contracts.vcs-safety): ${name}`, () => {
    vcsSafetyCases(make);
  });
}

function repositoryCases(make: MakeVcs): void {
  it("reports a folder that isn't a repository, and nothing else", async () => {
    const { vcs } = await make.folder({ "a.yaml": "1\n" });
    expect(await vcs.status()).toEqual({
      isRepo: false,
      branch: null,
      upstream: null,
      ahead: 0,
      behind: 0,
      changes: [],
    });
  });

  it("makes a folder a repository, with its files untracked", async () => {
    const { vcs } = await make.folder({ "a.yaml": "1\n" });
    await vcs.init();
    const status = await vcs.status();
    expect(status.isRepo).toBe(true);
    expect(status.changes).toContainEqual({ path: "a.yaml", status: "untracked", staged: false });
  });

  it("reports a clean repository on its branch", async () => {
    const { vcs } = await make.repo({ "a.yaml": "1\n" });
    expect(await vcs.status()).toEqual({
      isRepo: true,
      branch: "main",
      upstream: null,
      ahead: 0,
      behind: 0,
      changes: [],
    });
  });
}

function statusCases(make: MakeVcs): void {
  it("reports modified, deleted and untracked files, then the same files staged", async () => {
    const { vcs, files } = await make.repo({ "a.yaml": "1\n", "b.yaml": "1\n" });
    await files.write("a.yaml", "2\n");
    await files.remove("b.yaml");
    await files.write("c.yaml", "new\n");
    expect(await changesOf(vcs.status())).toEqual([
      { path: "a.yaml", status: "modified", staged: false },
      { path: "b.yaml", status: "deleted", staged: false },
      { path: "c.yaml", status: "untracked", staged: false },
    ]);

    await vcs.stage(["a.yaml", "b.yaml", "c.yaml"]);
    expect(await changesOf(vcs.status())).toEqual([
      { path: "a.yaml", status: "modified", staged: true },
      { path: "b.yaml", status: "deleted", staged: true },
      { path: "c.yaml", status: "added", staged: true },
    ]);
  });

  it("reports a staged move of unchanged content as a rename", async () => {
    const content = "id: x\nname: Example agent\nmodel: scripted\n";
    const { vcs, files } = await make.repo({ "old.yaml": content });
    await files.write("new.yaml", content);
    await files.remove("old.yaml");
    await vcs.stage(["old.yaml", "new.yaml"]);
    expect(await changesOf(vcs.status())).toEqual([
      { path: "new.yaml", status: "renamed", staged: true, from: "old.yaml" },
    ]);
  });
}

function diffCases(make: MakeVcs): void {
  it("diffs the working tree against the index, then the index against the last commit", async () => {
    const { vcs, files } = await make.repo({ "a.yaml": "one\ntwo\n" });
    await files.write("a.yaml", "one\nthree\n");
    const unstaged = await vcs.diff("a.yaml", false);
    expect(unstaged).toContain("a.yaml");
    expect(lines(unstaged)).toEqual(expect.arrayContaining(["-two", "+three", " one"]));
    expect(await vcs.diff("a.yaml", true)).toBe("");

    await vcs.stage(["a.yaml"]);
    expect(await vcs.diff("a.yaml", false)).toBe("");
    expect(lines(await vcs.diff("a.yaml", true))).toEqual(
      expect.arrayContaining(["-two", "+three"]),
    );
  });

  it("gives an empty diff for an unchanged file", async () => {
    const { vcs } = await make.repo({ "a.yaml": "1\n" });
    expect(await vcs.diff("a.yaml", false)).toBe("");
    expect(await vcs.diff("a.yaml", true)).toBe("");
  });
}

function stageCases(make: MakeVcs): void {
  it("stages only the files it is given", async () => {
    const { vcs, files } = await make.repo({ "a.yaml": "1\n", "b.yaml": "1\n" });
    await files.write("a.yaml", "2\n");
    await files.write("b.yaml", "2\n");
    await vcs.stage(["a.yaml"]);
    expect(await changesOf(vcs.status())).toEqual([
      { path: "a.yaml", status: "modified", staged: true },
      { path: "b.yaml", status: "modified", staged: false },
    ]);
  });

  it("unstages a change and keeps it in the working tree", async () => {
    const { vcs, files } = await make.repo({ "a.yaml": "1\n" });
    await files.write("a.yaml", "2\n");
    await vcs.stage(["a.yaml"]);
    await vcs.unstage(["a.yaml"]);
    expect(await changesOf(vcs.status())).toEqual([
      { path: "a.yaml", status: "modified", staged: false },
    ]);
    expect(await files.read("a.yaml")).toBe("2\n");
  });
}

function discardCases(make: MakeVcs): void {
  it("puts tracked files back and deletes untracked ones", async () => {
    const { vcs, files } = await make.repo({ "a.yaml": "1\n", "b.yaml": "1\n" });
    await files.write("a.yaml", "2\n");
    await files.remove("b.yaml");
    await files.write("c.yaml", "new\n");
    await vcs.discard(["a.yaml", "b.yaml", "c.yaml"]);
    expect((await vcs.status()).changes).toEqual([]);
    expect(await files.read("a.yaml")).toBe("1\n");
    expect(await files.read("b.yaml")).toBe("1\n");
    expect(await files.read("c.yaml")).toBeNull();
  });

  it("puts a file back to what is staged, not to the last commit", async () => {
    const { vcs, files } = await make.repo({ "a.yaml": "1\n" });
    await files.write("a.yaml", "2\n");
    await vcs.stage(["a.yaml"]);
    await files.write("a.yaml", "3\n");
    await vcs.discard(["a.yaml"]);
    expect(await files.read("a.yaml")).toBe("2\n");
    expect(await changesOf(vcs.status())).toEqual([
      { path: "a.yaml", status: "modified", staged: true },
    ]);
  });

  it("leaves files it isn't given alone", async () => {
    const { vcs, files } = await make.repo({ "a.yaml": "1\n" });
    await files.write("a.yaml", "2\n");
    await files.write("c.yaml", "new\n");
    await vcs.discard(["a.yaml"]);
    expect(await files.read("c.yaml")).toBe("new\n");
    expect(await changesOf(vcs.status())).toEqual([
      { path: "c.yaml", status: "untracked", staged: false },
    ]);
  });
}

function commitCases(make: MakeVcs): void {
  it("commits what is staged and returns the new commit's hash", async () => {
    const { vcs, files } = await make.repo({ "a.yaml": "1\n" });
    await files.write("a.yaml", "2\n");
    await vcs.stage(["a.yaml"]);
    const hash = await vcs.commit("Change a\n\nThe longer explanation.");
    expect(hash).toMatch(commitHash);
    expect((await vcs.status()).changes).toEqual([]);

    const [latest] = await vcs.log(1);
    expect(latest).toMatchObject({ hash, message: "Change a" });
    expect(latest?.author).not.toBe("");
    expect(Number.isNaN(Date.parse(latest?.date ?? ""))).toBe(false);
  });

  it("commits only what is staged", async () => {
    const { vcs, files } = await make.repo({ "a.yaml": "1\n", "b.yaml": "1\n" });
    await files.write("a.yaml", "2\n");
    await files.write("b.yaml", "2\n");
    await vcs.stage(["a.yaml"]);
    await vcs.commit("Change a");
    expect(await changesOf(vcs.status())).toEqual([
      { path: "b.yaml", status: "modified", staged: false },
    ]);
  });

  it("refuses to commit when nothing is staged", async () => {
    const { vcs, files } = await make.repo({ "a.yaml": "1\n" });
    await files.write("a.yaml", "2\n");
    const before = await vcs.log(10);
    await expect(vcs.commit("Nothing staged")).rejects.toThrow();
    expect(await vcs.log(10)).toEqual(before);
  });
}

function logCases(make: MakeVcs): void {
  it("lists commits newest first, at most `limit` of them", async () => {
    const { vcs, files } = await make.repo({ "a.yaml": "1\n" });
    for (const message of ["second", "third", "fourth"]) {
      await files.write("a.yaml", `${message}\n`);
      await vcs.stage(["a.yaml"]);
      await vcs.commit(message);
    }
    const all = await vcs.log(10);
    expect(all).toHaveLength(4);
    expect(all.slice(0, 3).map((commit) => commit.message)).toEqual(["fourth", "third", "second"]);
    expect(new Set(all.map((commit) => commit.hash)).size).toBe(4);
    expect(await vcs.log(2)).toEqual(all.slice(0, 2));
    expect(await vcs.log(1)).toEqual(all.slice(0, 1));
  });

  it("refuses a limit that isn't a whole number of at least 1", async () => {
    const { vcs } = await make.repo({ "a.yaml": "1\n" });
    for (const limit of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      await expect(vcs.log(limit), String(limit)).rejects.toThrow(RangeError);
    }
  });
}

function branchCases(make: MakeVcs): void {
  it("creates a branch from the current commit and switches to it", async () => {
    const { vcs } = await make.repo({ "a.yaml": "1\n" });
    const [head] = await vcs.log(1);
    await vcs.createBranch("feature/x");
    expect((await vcs.status()).branch).toBe("feature/x");
    expect((await vcs.branches()).sort()).toEqual(["feature/x", "main"]);
    expect(await vcs.log(1)).toEqual([head]);
  });

  it("keeps each branch's commits and files apart", async () => {
    const { vcs, files } = await make.repo({ "a.yaml": "1\n" });
    const [onMain] = await vcs.log(1);
    await vcs.createBranch("feature");
    await files.write("a.yaml", "2\n");
    await vcs.stage(["a.yaml"]);
    const onFeature = await vcs.commit("Change a on feature");

    await vcs.checkout("main");
    expect((await vcs.status()).branch).toBe("main");
    expect(await vcs.log(1)).toEqual([onMain]);
    expect(await files.read("a.yaml")).toBe("1\n");

    await vcs.checkout("feature");
    expect((await vcs.log(1))[0]?.hash).toBe(onFeature);
    expect(await files.read("a.yaml")).toBe("2\n");
  });

  it("refuses to create a branch that already exists", async () => {
    const { vcs } = await make.repo({ "a.yaml": "1\n" });
    await vcs.createBranch("feature");
    await expect(vcs.createBranch("main")).rejects.toThrow();
    expect((await vcs.status()).branch).toBe("feature");
    expect((await vcs.branches()).sort()).toEqual(["feature", "main"]);
  });

  it("refuses to check out a branch that doesn't exist", async () => {
    const { vcs } = await make.repo({ "a.yaml": "1\n" });
    await expect(vcs.checkout("missing")).rejects.toThrow();
    expect((await vcs.status()).branch).toBe("main");
  });

  it("accepts branch names that git accepts, however odd", async () => {
    const { vcs } = await make.repo({ "a.yaml": "1\n" });
    for (const branch of validBranchNames) {
      await vcs.createBranch(branch);
      expect((await vcs.status()).branch, branch).toBe(branch);
    }
    expect((await vcs.branches()).sort()).toEqual(["main", ...validBranchNames].sort());
  });
}
