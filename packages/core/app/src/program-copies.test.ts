import { describe, expect, it } from "vitest";
import { ProgramCopies, ProgramCopyUnavailableError } from "./program-copies.ts";
import { TestProposalVcs } from "./testing/test-proposal-vcs.ts";

function setUp() {
  const vcs = new TestProposalVcs();
  const version = vcs.commit({ "connectors/echo.mjs": "live" });
  return { vcs, version, copies: new ProgramCopies(vcs) };
}

describe("a copy of the workspace for a run.s programs", () => {
  it("holds the files at the run's version", async () => {
    const { vcs, version, copies } = setUp();
    const folder = await copies.make(version);
    expect(vcs.filesOf(folder).get("connectors/echo.mjs")).toBe("live");
  });

  it("is made once per version, even for calls at the same time", async () => {
    const { vcs, version, copies } = setUp();
    const [first, second] = await Promise.all([copies.make(version), copies.make(version)]);
    expect(first).toBe(second);
    expect(vcs.worktrees.size).toBe(1);
  });

  it("is removed with remove and with removeAll", async () => {
    const { vcs, version, copies } = setUp();
    const other = vcs.commit({ a: "b" });
    await copies.make(version);
    await copies.make(other);
    await copies.remove(version);
    expect(vcs.worktrees.size).toBe(1);
    await copies.removeAll();
    expect(vcs.worktrees.size).toBe(0);
  });

  it("removing a copy that was never made does nothing", async () => {
    const { copies } = setUp();
    await expect(copies.remove("a".repeat(40))).resolves.toBeUndefined();
  });

  it("fails plainly when it can't be made, and can be tried again", async () => {
    const { vcs, version, copies } = setUp();
    const add = vcs.addWorktree.bind(vcs);
    vcs.addWorktree = async () => {
      throw new Error("disk full");
    };
    await expect(copies.make(version)).rejects.toBeInstanceOf(ProgramCopyUnavailableError);
    vcs.addWorktree = add;
    await expect(copies.make(version)).resolves.toContain("/data/worktrees/");
  });

  it("sweeps the copies an earlier engine left behind", async () => {
    const { vcs, version } = setUp();
    await new ProgramCopies(vcs).make(version);
    const restarted = new ProgramCopies(vcs);
    expect(await restarted.sweep()).toBe(1);
    expect(vcs.worktrees.size).toBe(0);
  });
});
