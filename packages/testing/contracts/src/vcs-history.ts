import { expect, it } from "vitest";
import { type MakeVcs, validBranchNames } from "./vcs-harness.ts";
import { changesOf, commitHash } from "./vcs-helpers.ts";

/** The {@link Vcs} contract's cases for commits, the log and branches. */
export function vcsHistoryCases(make: MakeVcs): void {
  commitCases(make);
  logCases(make);
  branchCases(make);
  checkoutCases(make);
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
    expect(Date.parse(String(latest?.date))).not.toBeNaN();
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

  it("refuses an empty commit message, and keeps the change staged", async () => {
    const { vcs, files } = await make.repo({ "a.yaml": "1\n" });
    await files.write("a.yaml", "2\n");
    await vcs.stage(["a.yaml"]);
    const before = await vcs.log(10);
    await expect(vcs.commit("")).rejects.toThrow();
    expect(await vcs.log(10)).toEqual(before);
    expect(await changesOf(vcs.status())).toEqual([
      { path: "a.yaml", status: "modified", staged: true },
    ]);
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

  it("refuses a branch inside another branch's name, as git does", async () => {
    const { vcs } = await make.repo({ "a.yaml": "1\n" });
    await vcs.createBranch("feature");
    await expect(vcs.createBranch("feature/x")).rejects.toThrow();
    await vcs.createBranch("fix/a");
    await expect(vcs.createBranch("fix")).rejects.toThrow();
    expect((await vcs.branches()).sort()).toEqual(["feature", "fix/a", "main"]);
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

function checkoutCases(make: MakeVcs): void {
  it("refuses to check out over an untracked file the branch would overwrite, and keeps it", async () => {
    const { vcs, files } = await make.repo({ "a.yaml": "1\n" });
    await vcs.createBranch("feature");
    await files.write("b.yaml", "theirs\n");
    await vcs.stage(["b.yaml"]);
    await vcs.commit("Add b on feature");
    await vcs.checkout("main");
    await files.write("b.yaml", "mine\n");

    await expect(vcs.checkout("feature")).rejects.toThrow();
    expect(await files.read("b.yaml")).toBe("mine\n");
    expect(await changesOf(vcs.status())).toEqual([
      { path: "b.yaml", status: "untracked", staged: false },
    ]);
    expect((await vcs.status()).branch).toBe("main");
  });

  it("refuses to check out a branch that doesn't exist", async () => {
    const { vcs } = await make.repo({ "a.yaml": "1\n" });
    await expect(vcs.checkout("missing")).rejects.toThrow();
    expect((await vcs.status()).branch).toBe("main");
  });
}
