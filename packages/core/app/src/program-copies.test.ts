import { describe, expect, it } from "vitest";
import { ProgramCopies, ProgramCopyUnavailableError } from "./program-copies.ts";
import { TestProposalVcs } from "./testing/test-proposal-vcs.ts";

function setUp() {
  const vcs = new TestProposalVcs();
  const version = vcs.commit({ "connectors/echo.mjs": "live" });
  return { vcs, version, copies: new ProgramCopies(vcs) };
}

describe("a copy of the workspace for a run's programs", () => {
  it("holds the files at the run's version", async () => {
    const { vcs, version, copies } = setUp();
    const lease = await copies.make(version);
    expect(vcs.filesOf(lease.path).get("connectors/echo.mjs")).toBe("live");
  });

  it("is made once per version, even for calls at the same time", async () => {
    const { vcs, version, copies } = setUp();
    const [first, second] = await Promise.all([copies.make(version), copies.make(version)]);
    expect(first.path).toBe(second.path);
    expect(vcs.worktrees.size).toBe(1);
  });

  it("goes when the last lease is released, not before", async () => {
    const { vcs, version, copies } = setUp();
    const first = await copies.make(version);
    const second = await copies.make(version);
    await first.release();
    await first.release();
    expect(vcs.worktrees.size).toBe(1);
    await second.release();
    expect(vcs.worktrees.size).toBe(0);
  });

  it("is removed with removeAll", async () => {
    const { vcs, version, copies } = setUp();
    await copies.make(version);
    await copies.make(vcs.commit({ a: "b" }));
    await copies.removeAll();
    expect(vcs.worktrees.size).toBe(0);
  });

  it("fails plainly when it can't be made, and can be tried again", async () => {
    const { vcs, version, copies } = setUp();
    const add = vcs.addWorktree.bind(vcs);
    vcs.addWorktree = async () => {
      throw new Error("disk full");
    };
    await expect(copies.make(version)).rejects.toBeInstanceOf(ProgramCopyUnavailableError);
    vcs.addWorktree = add;
    const lease = await copies.make(version);
    expect(lease.path).toContain("/data/worktrees/");
  });

  it("lets a lease go after removeAll without removing the copy twice", async () => {
    const { vcs, version, copies } = setUp();
    const lease = await copies.make(version);
    await copies.removeAll();
    await expect(lease.release()).resolves.toBeUndefined();
    expect(vcs.worktrees.size).toBe(0);
  });

  it("keeps a newer attempt when an older failed one is cleaned up", async () => {
    const { vcs, version, copies } = setUp();
    const add = vcs.addWorktree.bind(vcs);
    let fail: (error: Error) => void = () => {};
    vcs.addWorktree = () => new Promise((_, reject) => (fail = reject));
    const failed = expect(copies.make(version)).rejects.toBeInstanceOf(ProgramCopyUnavailableError);
    // removeAll drops the pending attempt from the engine, then a new one replaces it.
    const removed = copies.removeAll();
    vcs.addWorktree = add;
    const lease = await copies.make(version);
    fail(new Error("disk full"));
    await failed;
    await removed;
    const again = await copies.make(version);
    expect(again.path).toBe(lease.path);
    expect(vcs.worktrees.size).toBe(1);
  });

  it("sweeps the copies an earlier engine left behind", async () => {
    const { vcs, version } = setUp();
    await new ProgramCopies(vcs).make(version);
    const restarted = new ProgramCopies(vcs);
    expect(await restarted.sweep()).toBe(1);
    expect(vcs.worktrees.size).toBe(0);
  });

  it("refuses to sweep while it holds copies", async () => {
    const { version, copies } = setUp();
    await copies.make(version);
    await expect(copies.sweep()).rejects.toThrow("engine start");
  });

  it("keeps sweeping past a copy that can't be removed", async () => {
    const { vcs, copies } = setUp();
    await new ProgramCopies(vcs).make(vcs.commit({ a: "1" }));
    await new ProgramCopies(vcs).make(vcs.commit({ b: "2" }));
    const remove = vcs.removeWorktree.bind(vcs);
    let first = true;
    vcs.removeWorktree = async (id) => {
      if (first) {
        first = false;
        throw new Error("busy");
      }
      await remove(id);
    };
    expect(await copies.sweep()).toBe(1);
    expect(vcs.worktrees.size).toBe(1);
  });
});
