import type { Vcs } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { MakeVcs } from "./vcs-harness.ts";
import { changesOf, lines } from "./vcs-helpers.ts";
import { vcsHistoryCases } from "./vcs-history.ts";
import { vcsRemoteCases } from "./vcs-remote.ts";

/**
 * The contract every {@link Vcs} adapter passes. The harness builds each
 * folder, and the suite changes the working tree through the harness's
 * `files`, the way the Studio's editors do.
 */
export function vcsContract(name: string, make: MakeVcs): void {
  verifies("contracts.vcs", () => {
    describe(`Vcs contract: ${name}`, () => {
      repositoryCases(make);
      statusCases(make);
      diffCases(make);
      stageCases(make);
      discardCases(make);
      vcsHistoryCases(make);
      vcsRemoteCases(make);
    });
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

  it("refuses to work on a folder that isn't a repository", async () => {
    const { vcs, files } = await make.folder({ "a.yaml": "1\n" });
    await expectNoRepository(vcs);
    expect(await files.read("a.yaml")).toBe("1\n");
  });

  it("makes a folder a repository, with its files untracked and the runtime folder ignored", async () => {
    const { vcs } = await make.folder({ "a.yaml": "1\n" });
    await vcs.init();
    const status = await vcs.status();
    expect(status.isRepo).toBe(true);
    expect(status.changes).toContainEqual({ path: "a.yaml", status: "untracked", staged: false });
    const runtime = status.changes.filter((change) => /^\.studio(?:\/|$)/iu.test(change.path));
    expect(runtime).toEqual([]);
    expect(await vcs.branches()).toEqual([]);
  });

  it("treats a folder inside another repository as no repository, until it is made one", async () => {
    const { vcs, files } = await make.nested({ "a.yaml": "1\n" });
    await expectNoRepository(vcs);
    expect(await files.read("a.yaml")).toBe("1\n");

    // Committed in the parent, the file is untracked in the folder's own repository.
    await vcs.init();
    expect(await changesOf(vcs.status())).toEqual(
      expect.arrayContaining([{ path: "a.yaml", status: "untracked", staged: false }]),
    );
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

/** Every method but `status` and `init` rejects, and `status` reports no repository. */
async function expectNoRepository(vcs: Vcs): Promise<void> {
  const calls: [string, () => Promise<unknown>][] = [
    ["diff", () => vcs.diff("a.yaml", false)],
    ["stage", () => vcs.stage(["a.yaml"])],
    ["unstage", () => vcs.unstage(["a.yaml"])],
    ["discard", () => vcs.discard(["a.yaml"])],
    ["commit", () => vcs.commit("Change a")],
    ["log", () => vcs.log(1)],
    ["branches", () => vcs.branches()],
    ["checkout", () => vcs.checkout("main")],
    ["createBranch", () => vcs.createBranch("feature")],
    ["remotes", () => vcs.remotes()],
    ["pull", () => vcs.pull()],
    ["push", () => vcs.push()],
  ];
  for (const [method, call] of calls) await expect(call(), method).rejects.toThrow();
  expect((await vcs.status()).isRepo).toBe(false);
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

  it("reports a file with a staged change and a further unstaged one twice", async () => {
    const { vcs, files } = await make.repo({ "a.yaml": "1\n" });
    await files.write("a.yaml", "2\n");
    await vcs.stage(["a.yaml"]);
    await files.write("a.yaml", "3\n");
    expect(await changesOf(vcs.status())).toEqual([
      { path: "a.yaml", status: "modified", staged: false },
      { path: "a.yaml", status: "modified", staged: true },
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

  it("diffs a new file and a deleted file against the last commit", async () => {
    const { vcs, files } = await make.repo({ "a.yaml": "1\n" });
    await files.write("b.yaml", "x\ny\n");
    await files.remove("a.yaml");
    await vcs.stage(["a.yaml", "b.yaml"]);
    expect(lines(await vcs.diff("b.yaml", true))).toEqual(
      expect.arrayContaining(["--- /dev/null", "+x", "+y"]),
    );
    expect(lines(await vcs.diff("a.yaml", true))).toEqual(
      expect.arrayContaining(["+++ /dev/null", "-1"]),
    );
  });

  it("gives no working-tree diff for an untracked file", async () => {
    const { vcs, files } = await make.repo({ "a.yaml": "1\n" });
    await files.write("b.yaml", "new\n");
    expect(await vcs.diff("b.yaml", false)).toBe("");
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

  it("unstages a new file, which is untracked again", async () => {
    const { vcs, files } = await make.repo({ "a.yaml": "1\n" });
    await files.write("b.yaml", "new\n");
    await vcs.stage(["b.yaml"]);
    await vcs.unstage(["b.yaml"]);
    expect(await changesOf(vcs.status())).toEqual([
      { path: "b.yaml", status: "untracked", staged: false },
    ]);
  });

  it("refuses to stage a file that is neither in the folder nor tracked, and stages nothing", async () => {
    const { vcs, files } = await make.repo({ "a.yaml": "1\n" });
    await files.write("a.yaml", "2\n");
    await expect(vcs.stage(["a.yaml", "missing.yaml"])).rejects.toThrow();
    expect(await changesOf(vcs.status())).toEqual([
      { path: "a.yaml", status: "modified", staged: false },
    ]);
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
