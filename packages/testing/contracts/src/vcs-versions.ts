import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { vcsCommitVersionCases } from "./vcs-commit-version.ts";
import { vcsCommitVersionSafetyCases } from "./vcs-commit-version-safety.ts";
import { vcsCommitsHardenedCases } from "./vcs-commits-hardened.ts";
import { vcsVersionHardenedCases } from "./vcs-hardened.ts";
import type { MakeVcs } from "./vcs-harness.ts";
import { changesOf, commitFile, commitHash, stagedDiffs, stateOf } from "./vcs-helpers.ts";
import { vcsProposalRefCases } from "./vcs-proposal-refs.ts";
import { unknownCommit } from "./vcs-version-inputs.ts";
import { vcsVersionSafetyCases } from "./vcs-versions-safety.ts";
import { vcsWorktreeCases } from "./vcs-worktrees.ts";

/**
 * The {@link Vcs} contract for port version 2, under its own requirements so
 * the version 1 ones stay as they were: the behaviour, its safety, and the
 * hardened cases for an adapter that drives git.
 */
export function vcsVersionContracts(name: string, make: MakeVcs): void {
  verifies("contracts.vcs-versions", () => {
    describe(`Vcs versions contract: ${name}`, () => {
      vcsVersionCases(make);
      vcsWorktreeCases(make);
    });
  });

  verifies("contracts.vcs-versions-safety", () => {
    describe(`Vcs versions safety contract: ${name}`, () => {
      vcsVersionSafetyCases(make);
    });
  });

  verifies("contracts.vcs-versions-hardened", () => {
    describe(`Vcs versions hardened contract: ${name}`, () => {
      vcsVersionHardenedCases(make);
    });
  });

  verifies("contracts.vcs-commit-version", () => {
    describe(`Vcs Create version contract: ${name}`, () => {
      vcsCommitVersionCases(make);
      vcsCommitVersionSafetyCases(make);
    });
  });

  verifies("contracts.vcs-proposal-refs", () => {
    describe(`Vcs proposal refs contract: ${name}`, () => {
      vcsProposalRefCases(make);
    });
  });

  verifies("contracts.vcs-commits-hardened", () => {
    describe(`Vcs Create version and proposals hardened contract: ${name}`, () => {
      vcsCommitsHardenedCases(make);
    });
  });
}

/**
 * The {@link Vcs} contract's cases for the save model (port version 2):
 * snapshots, reading at a version and rename. Worktrees and patches are in
 * `vcs-worktrees.ts`.
 */
function vcsVersionCases(make: MakeVcs): void {
  snapshotCases(make);
  readAtCases(make);
  renameCases(make);
}

function snapshotCases(make: MakeVcs): void {
  it("takes a snapshot of the files on disk, new ones included, and changes nothing", async () => {
    const harness = await make.repo({ "a.yaml": "1\n", "b.yaml": "1\n", "c.yaml": "1\n" });
    const { vcs, files } = harness;
    await files.write("a.yaml", "2\n");
    await vcs.stage(["a.yaml"]);
    await files.write("a.yaml", "3\n");
    await files.write("b.yaml", "2\n");
    await files.remove("c.yaml");
    await files.write("d.yaml", "new\n");
    const before = await stateOf(harness);
    const staged = await stagedDiffs(harness, ["a.yaml", "b.yaml", "c.yaml"]);

    const snapshot = await vcs.snapshot();
    expect(snapshot).toMatch(commitHash);
    expect(await stateOf(harness)).toEqual(before);
    expect(await stagedDiffs(harness, ["a.yaml", "b.yaml", "c.yaml"])).toEqual(staged);

    // What is on disk, not what is staged or committed.
    expect(await vcs.readAt(snapshot, "a.yaml")).toBe("3\n");
    expect(await vcs.readAt(snapshot, "b.yaml")).toBe("2\n");
    expect(await vcs.readAt(snapshot, "c.yaml")).toBeNull();
    expect(await vcs.readAt(snapshot, "d.yaml")).toBe("new\n");
    expect(await vcs.listAt(snapshot)).toEqual(["a.yaml", "b.yaml", "d.yaml"]);
  });

  it("takes a new snapshot after the files change, and keeps the old one", async () => {
    const { vcs, files } = await make.repo({ "a.yaml": "1\n" });
    const first = await vcs.snapshot();
    await files.write("a.yaml", "2\n");
    const second = await vcs.snapshot();
    expect(second).not.toBe(first);
    expect(await vcs.readAt(first, "a.yaml")).toBe("1\n");
    expect(await vcs.readAt(second, "a.yaml")).toBe("2\n");
  });

  it("takes a snapshot in a repository with no commits, which still has none", async () => {
    const { vcs } = await make.folder({ "a.yaml": "1\n" });
    await vcs.init();
    const before = await changesOf(vcs.status());
    const snapshot = await vcs.snapshot();
    expect(await vcs.readAt(snapshot, "a.yaml")).toBe("1\n");
    expect(await vcs.branches()).toEqual([]);
    expect(await changesOf(vcs.status())).toEqual(before);
  });
}

function readAtCases(make: MakeVcs): void {
  it("reads a file and lists the files at a commit, not on disk", async () => {
    const harness = await make.repo({ "a.yaml": "1\n", "b.yaml": "1\n" });
    const { vcs, files } = harness;
    const commit = await commitFile(harness, "a.yaml", "2\n", "Change a");
    await files.write("a.yaml", "3\n");
    await files.remove("b.yaml");
    await files.write("c.yaml", "new\n");

    expect(await vcs.readAt(commit, "a.yaml")).toBe("2\n");
    expect(await vcs.readAt(commit, "b.yaml")).toBe("1\n");
    expect(await vcs.readAt(commit, "c.yaml")).toBeNull();
    expect(await vcs.listAt(commit)).toEqual(["a.yaml", "b.yaml"]);
  });

  it("reads an older commit as it was", async () => {
    const harness = await make.repo({ "a.yaml": "1\n" });
    const [first] = await harness.vcs.log(1);
    await commitFile(harness, "a.yaml", "2\n", "Change a");
    expect(await harness.vcs.readAt(String(first?.hash), "a.yaml")).toBe("1\n");
  });

  it("lists a folder at a commit recursively, sorted and relative to the workspace", async () => {
    const { vcs } = await make.repo({
      "agents/b.agent.yaml": "b\n",
      "agents/a.agent.yaml": "a\n",
      "agents/team/c.agent.yaml": "c\n",
      "workflows/w.workflow.yaml": "w\n",
    });
    const [head] = await vcs.log(1);
    const commit = String(head?.hash);
    expect(await vcs.listAt(commit, "agents")).toEqual([
      "agents/a.agent.yaml",
      "agents/b.agent.yaml",
      "agents/team/c.agent.yaml",
    ]);
    expect(await vcs.listAt(commit, "agents/team")).toEqual(["agents/team/c.agent.yaml"]);
  });

  it("gives null for a file or folder the commit doesn't have", async () => {
    const { vcs } = await make.repo({ "agents/a.agent.yaml": "a\n" });
    const [head] = await vcs.log(1);
    const commit = String(head?.hash);
    expect(await vcs.readAt(commit, "missing.yaml")).toBeNull();
    expect(await vcs.readAt(commit, "agents/missing.yaml")).toBeNull();
    expect(await vcs.listAt(commit, "missing")).toBeNull();
  });

  it("refuses a well-formed commit id the repository doesn't have", async () => {
    const { vcs } = await make.repo({ "a.yaml": "1\n" });
    await expect(vcs.readAt(unknownCommit, "a.yaml")).rejects.toThrow(/Unknown version/);
    await expect(vcs.listAt(unknownCommit)).rejects.toThrow(/Unknown version/);
  });
}

function renameCases(make: MakeVcs): void {
  it("renames a tracked file so its history follows it", async () => {
    const content = "id: x\nname: Example agent\nmodel: scripted\n";
    const { vcs, files } = await make.repo({ "agents/old.agent.yaml": content });
    await vcs.rename("agents/old.agent.yaml", "agents/new.agent.yaml");
    expect(await files.read("agents/old.agent.yaml")).toBeNull();
    expect(await files.read("agents/new.agent.yaml")).toBe(content);
    expect(await changesOf(vcs.status())).toEqual([
      {
        path: "agents/new.agent.yaml",
        status: "renamed",
        staged: true,
        from: "agents/old.agent.yaml",
      },
    ]);
  });

  it("renames a folder with every tracked file in it", async () => {
    const { vcs, files } = await make.repo({
      "agents/a.agent.yaml": "id: a\n",
      "agents/b.agent.yaml": "id: b\n",
      "keep.yaml": "1\n",
    });
    await vcs.rename("agents", "team");
    expect((await files.list()).sort()).toEqual([
      "keep.yaml",
      "team/a.agent.yaml",
      "team/b.agent.yaml",
    ]);
    expect(await changesOf(vcs.status())).toEqual([
      { path: "team/a.agent.yaml", status: "renamed", staged: true, from: "agents/a.agent.yaml" },
      { path: "team/b.agent.yaml", status: "renamed", staged: true, from: "agents/b.agent.yaml" },
    ]);
  });

  it("moves an untracked file, which stays untracked", async () => {
    const { vcs, files } = await make.repo({ "a.yaml": "1\n" });
    await files.write("notes.md", "notes\n");
    await vcs.rename("notes.md", "docs/notes.md");
    expect(await files.read("notes.md")).toBeNull();
    expect(await files.read("docs/notes.md")).toBe("notes\n");
    expect(await changesOf(vcs.status())).toEqual([
      { path: "docs/notes.md", status: "untracked", staged: false },
    ]);
  });

  it("refuses to rename onto a file that exists, or a file that doesn't, and changes nothing", async () => {
    const harness = await make.repo({ "a.yaml": "1\n", "b.yaml": "2\n" });
    await harness.files.write("c.yaml", "new\n");
    const before = await stateOf(harness);
    await expect(harness.vcs.rename("a.yaml", "b.yaml")).rejects.toThrow();
    await expect(harness.vcs.rename("c.yaml", "a.yaml")).rejects.toThrow();
    await expect(harness.vcs.rename("missing.yaml", "d.yaml")).rejects.toThrow();
    expect(await stateOf(harness)).toEqual(before);
  });
}
