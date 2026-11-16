import { expect, it } from "vitest";
import type { MakeVcs } from "./vcs-harness.ts";
import { commitFile, stateOf } from "./vcs-helpers.ts";

/** The part of the {@link Vcs} contract that needs remotes: listing, pulling and pushing. */
export function vcsRemoteCases(make: MakeVcs): void {
  remoteListCases(make);
  pushPullCases(make);
  upstreamCases(make);
  divergedCases(make);
}

function remoteListCases(make: MakeVcs): void {
  it("lists the remotes", async () => {
    expect(await (await make.repo({ "a.yaml": "1\n" })).vcs.remotes()).toEqual([]);
    const [clone] = await make.clones({ "a.yaml": "1\n" });
    expect(await clone.vcs.remotes()).toEqual(["origin"]);
  });
}

function pushPullCases(make: MakeVcs): void {
  it("pushes commits, and the other clone pulls them in", async () => {
    const [first, second] = await make.clones({ "a.yaml": "1\n" });
    const hash = await commitFile(first, "a.yaml", "2\n", "Change a");
    expect(await first.vcs.status()).toMatchObject({
      branch: "main",
      upstream: "origin/main",
      ahead: 1,
      behind: 0,
    });

    await first.vcs.push();
    expect(await first.vcs.status()).toMatchObject({ ahead: 0, behind: 0 });

    await second.vcs.pull();
    expect((await second.vcs.log(1))[0]?.hash).toBe(hash);
    expect(await second.files.read("a.yaml")).toBe("2\n");
    expect(await second.vcs.status()).toMatchObject({ ahead: 0, behind: 0, changes: [] });
  });

  it("refuses to pull when both sides have moved on, and merges nothing", async () => {
    const [first, second] = await make.clones({ "a.yaml": "1\n" });
    await commitFile(first, "a.yaml", "2\n", "Change a");
    await first.vcs.push();
    const own = await commitFile(second, "b.yaml", "1\n", "Add b");

    await expect(second.vcs.pull()).rejects.toThrow();
    expect((await second.vcs.log(1))[0]?.hash).toBe(own);
    expect(await second.files.read("a.yaml")).toBe("1\n");
    // The refused pull still fetched, so the branch is one commit ahead and one behind.
    expect(await second.vcs.status()).toMatchObject({ ahead: 1, behind: 1, changes: [] });
  });

  it("refuses to pull over an untracked file the upstream would overwrite, and keeps it", async () => {
    const [first, second] = await make.clones({ "a.yaml": "1\n" });
    await commitFile(first, "b.yaml", "theirs\n", "Add b");
    await first.vcs.push();
    const [own] = await second.vcs.log(1);
    await second.files.write("b.yaml", "mine\n");

    await expect(second.vcs.pull()).rejects.toThrow();
    expect(await second.files.read("b.yaml")).toBe("mine\n");
    expect(await second.vcs.log(1)).toEqual([own]);
  });

  it("refuses to push over commits the branch doesn't have", async () => {
    const [first, second] = await make.clones({ "a.yaml": "1\n" });
    const pushed = await commitFile(first, "a.yaml", "2\n", "Change a");
    await first.vcs.push();
    await commitFile(second, "b.yaml", "1\n", "Add b");

    await expect(second.vcs.push()).rejects.toThrow();
    // The remote still ends at the first clone's commit: pulling changes nothing there.
    await first.vcs.pull();
    expect((await first.vcs.log(1))[0]?.hash).toBe(pushed);
  });
}

function upstreamCases(make: MakeVcs): void {
  it("pushes a new branch to the first remote, which becomes its upstream", async () => {
    const [first, second] = await make.clones({ "a.yaml": "1\n" });
    await first.vcs.createBranch("feature");
    await commitFile(first, "a.yaml", "2\n", "Change a");
    expect((await first.vcs.status()).upstream).toBeNull();

    await first.vcs.push();
    expect(await first.vcs.status()).toMatchObject({
      upstream: "origin/feature",
      ahead: 0,
      behind: 0,
    });
    // The other clone's main is untouched.
    await second.vcs.pull();
    expect(await second.files.read("a.yaml")).toBe("1\n");
  });

  it("refuses to pull without an upstream", async () => {
    const { vcs } = await make.repo({ "a.yaml": "1\n" });
    await expect(vcs.pull()).rejects.toThrow();
  });

  it("refuses to push without a remote", async () => {
    const harness = await make.repo({ "a.yaml": "1\n" });
    await commitFile(harness, "a.yaml", "2\n", "Change a");
    await expect(harness.vcs.push()).rejects.toThrow();
  });
}

function divergedCases(make: MakeVcs): void {
  it("lists the files both sides changed since they parted, and changes nothing", async () => {
    const [first, second] = await make.clones({
      "a.yaml": "1\n",
      "b.yaml": "1\n",
      "c.yaml": "1\n",
      "d.yaml": "1\n",
    });
    const [base] = await first.vcs.log(1);
    await first.files.write("a.yaml", "theirs\n");
    await first.files.write("b.yaml", "theirs\n");
    await first.files.write("c.yaml", "same\n");
    await first.files.write("e.yaml", "theirs\n");
    await first.vcs.stage(["a.yaml", "b.yaml", "c.yaml", "e.yaml"]);
    const theirs = await first.vcs.commit("Their changes");
    await first.vcs.push();

    await second.files.write("a.yaml", "mine\n");
    await second.files.write("c.yaml", "same\n");
    await second.files.write("d.yaml", "mine\n");
    await second.files.write("e.yaml", "mine\n");
    await second.vcs.stage(["a.yaml", "c.yaml", "d.yaml", "e.yaml"]);
    const ours = await second.vcs.commit("My changes");
    const before = await stateOf(second);

    // b.yaml and d.yaml only one side changed; c.yaml both, the same way; e.yaml both added it differently.
    expect(await second.vcs.diverged()).toEqual({
      ours,
      theirs,
      base: base?.hash,
      items: ["a.yaml", "e.yaml"],
    });
    expect(await second.vcs.readAt(theirs, "a.yaml")).toBe("theirs\n");
    // Only the fetch shows: the branch now knows it is one version behind.
    const after = await stateOf(second);
    expect(after).toEqual({ ...before, status: { ...before.status, behind: 1 } });
  });

  it("lists a file one side deleted and the other changed", async () => {
    const [first, second] = await make.clones({ "a.yaml": "1\n", "b.yaml": "1\n" });
    await first.files.remove("a.yaml");
    await first.vcs.stage(["a.yaml"]);
    await first.vcs.commit("Delete a");
    await first.vcs.push();
    await commitFile(second, "a.yaml", "mine\n", "Change a");

    expect((await second.vcs.diverged())?.items).toEqual(["a.yaml"]);
  });

  it("gives nothing unless both sides have new versions", async () => {
    const [first, second] = await make.clones({ "a.yaml": "1\n" });
    expect(await second.vcs.diverged()).toBeNull();

    await commitFile(first, "a.yaml", "2\n", "Change a");
    await first.vcs.push();
    // Only the shared copy moved: Get updates can fast-forward.
    expect(await second.vcs.diverged()).toBeNull();

    await second.vcs.pull();
    await commitFile(second, "a.yaml", "3\n", "Change a again");
    // Only this side moved.
    expect(await second.vcs.diverged()).toBeNull();
  });

  it("refuses without an upstream", async () => {
    const { vcs } = await make.repo({ "a.yaml": "1\n" });
    await expect(vcs.diverged()).rejects.toThrow();
  });
}
