import { expect, it } from "vitest";
import type { MakeVcs } from "./vcs-harness.ts";
import { commitFile } from "./vcs-helpers.ts";

/** The part of the {@link Vcs} contract that needs remotes: listing, pulling and pushing. */
export function vcsRemoteCases(make: MakeVcs): void {
  remoteListCases(make);
  pushPullCases(make);
  upstreamCases(make);
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
