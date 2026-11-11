import type { Digest } from "@halonicjs/ports";
import { contentDigest } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { RunProposals } from "./run-proposals.ts";
import { TestDefinitionStore } from "./testing/memory-definition-store.ts";
import { TestProposalVcs } from "./testing/test-proposal-vcs.ts";

/** SHA-256 from Web Crypto, as the platform's `Digest` adapter gives it. */
const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

const clerk = "name: Clerk\nmodel: fast\n";
const old = "name: Old\n";

function setUp() {
  const vcs = new TestProposalVcs();
  const records = new TestDefinitionStore();
  const endFailures: { runId: string; error: unknown }[] = [];
  const proposals = new RunProposals({
    vcs,
    records,
    digest,
    clock: { now: () => new Date("2026-11-11T09:00:00.000Z") },
    onEndFailed: (runId, error) => endFailures.push({ runId, error }),
  });
  const version = vcs.commit({
    "agents/clerk.agent.yaml": clerk,
    "agents/old.agent.yaml": old,
    "README.md": "# Acme\n",
  });
  return { vcs, records, proposals, version, endFailures };
}

verifies("app.run-proposal-worktree", () => {
  describe("opening a run's worktree", () => {
    it("adds it at the run's version, outside the workspace, and records it", async () => {
      const { vcs, records, proposals, version } = setUp();
      const { folder } = await proposals.open("01JD8Q", version);
      expect(folder).toBe("/data/worktrees/wt1");
      expect(vcs.filesOf(folder).get("agents/clerk.agent.yaml")).toBe(clerk);
      expect(JSON.parse(records.files.get("01JD8Q.json") ?? "")).toEqual({
        format: 1,
        state: "running",
        runId: "01JD8Q",
        base: version,
        worktreeId: "wt1",
      });
    });

    it("refuses a second worktree for the same run", async () => {
      const { vcs, proposals, version } = setUp();
      await proposals.open("01JD8Q", version);
      await expect(proposals.open("01JD8Q", version)).rejects.toThrow(
        "Run 01JD8Q already has a worktree or a proposal.",
      );
      expect(vcs.worktrees.size).toBe(1);
    });

    it("refuses a run id that can't name a proposal ref, before adding anything", async () => {
      const { vcs, proposals, version } = setUp();
      await expect(proposals.open("../x", version)).rejects.toThrow(RangeError);
      expect(vcs.worktrees.size).toBe(0);
    });
  });

  describe("finding a run's folder again", () => {
    it("gives the folder open gave, until the run ends", async () => {
      const { proposals, version } = setUp();
      expect(await proposals.folderOf("01JD8Q")).toBeNull();
      const { folder } = await proposals.open("01JD8Q", version);
      expect(await proposals.folderOf("01JD8Q")).toBe(folder);
      await proposals.end("01JD8Q");
      expect(await proposals.folderOf("01JD8Q")).toBeNull();
    });

    it("gives it after a restart, for a run waiting for a person", async () => {
      const { vcs, records, proposals, version } = setUp();
      const { folder } = await proposals.open("01JD8Q", version);
      vcs.filesOf(folder).set("notes/today.md", "Step 1.\n");
      const restarted = new RunProposals({
        vcs,
        records,
        digest,
        clock: { now: () => new Date("2026-11-11T10:00:00.000Z") },
        onEndFailed: () => {},
      });
      await restarted.removeLeftovers(new Set(["01JD8Q"]));
      expect(await restarted.folderOf("01JD8Q")).toBe(folder);
      expect(vcs.filesOf(folder).get("notes/today.md")).toBe("Step 1.\n");
    });

    it("gives null when the worktree is gone", async () => {
      const { vcs, proposals, version } = setUp();
      await proposals.open("01JD8Q", version);
      await vcs.removeWorktree("wt1");
      expect(await proposals.folderOf("01JD8Q")).toBeNull();
    });
  });

  describe("removing leftovers at start", () => {
    it("removes runs that never ended and keeps the proposals of runs that did", async () => {
      const { vcs, records, proposals, version } = setUp();
      const ended = await proposals.open("7KQ2MX", version);
      vcs.filesOf(ended.folder).set("notes/today.md", "Done.\n");
      await proposals.end("7KQ2MX");
      await proposals.open("01JD8Q", version);
      records.files.set("notes.txt", "not a record");
      await proposals.removeLeftovers(new Set());
      expect(vcs.worktrees.size).toBe(0);
      expect(records.files.has("01JD8Q.json")).toBe(false);
      expect(await proposals.get("7KQ2MX")).not.toBeNull();
      expect(records.files.has("notes.txt")).toBe(true);
    });

    it("deletes the ref of a run that committed but closed before its record was saved", async () => {
      const { vcs, proposals, version } = setUp();
      await proposals.open("01JD8Q", version);
      await vcs.commitWorktreeTo("wt1", "refs/halonic/proposals/01JD8Q", { parent: version });
      await proposals.removeLeftovers(new Set());
      expect(vcs.refs.size).toBe(0);
    });

    it("keeps the worktrees of open runs and removes any no record holds", async () => {
      const { vcs, records, proposals, version } = setUp();
      await proposals.open("01JD8Q", version);
      await proposals.open("7KQ2MX", version);
      await vcs.addWorktree(version); // added before a crash, never recorded
      await proposals.removeLeftovers(new Set(["01JD8Q"]));
      expect([...vcs.worktrees.keys()]).toEqual(["wt1"]);
      expect(records.files.has("01JD8Q.json")).toBe(true);
      expect(records.files.has("7KQ2MX.json")).toBe(false);
    });

    it("leaves a record it can't read for get to report", async () => {
      const { records, proposals } = setUp();
      records.files.set("01JD8Q.json", "{");
      await proposals.removeLeftovers(new Set());
      expect(records.files.get("01JD8Q.json")).toBe("{");
      await expect(proposals.get("01JD8Q")).rejects.toThrow(
        "The proposal record of run 01JD8Q can't be read: it isn't valid JSON.",
      );
    });
  });
});

verifies("app.run-proposal-end", () => {
  describe("ending a run that changed files", () => {
    it("commits onto the run's ref with its version as parent and records the proposal", async () => {
      const { vcs, proposals, version } = setUp();
      const { folder } = await proposals.open("01JD8Q", version);
      const files = vcs.filesOf(folder);
      files.set("agents/clerk.agent.yaml", "name: Clerk\nmodel: smart\n");
      files.set("notes/today.md", "Three tickets.\n");
      files.delete("agents/old.agent.yaml");

      const proposal = await proposals.end("01JD8Q");

      const expected = {
        runId: "01JD8Q",
        base: version,
        ref: "refs/halonic/proposals/01JD8Q",
        files: [
          {
            path: "agents/clerk.agent.yaml",
            change: "modified",
            base: { digest: await contentDigest(clerk, digest) },
          },
          {
            path: "agents/old.agent.yaml",
            change: "deleted",
            base: { digest: await contentDigest(old, digest) },
          },
          { path: "notes/today.md", change: "added", base: "absent" },
        ],
        items: ["clerk", "old"],
      };
      expect(proposal).toEqual(expected);
      const commit = vcs.refs.get("refs/halonic/proposals/01JD8Q") ?? "";
      expect(await vcs.readAt(commit, "notes/today.md")).toBe("Three tickets.\n");
      expect(vcs.worktrees.size).toBe(0);
      expect(await proposals.get("01JD8Q")).toEqual({
        state: "proposed",
        proposal: expected,
        finishedAt: "2026-11-11T09:00:00.000Z",
        decisions: {
          "agents/clerk.agent.yaml": "undecided",
          "agents/old.agent.yaml": "undecided",
          "notes/today.md": "undecided",
        },
      });
    });
  });

  describe("ending a run that changed nothing", () => {
    it("removes the worktree and leaves no ref and no record", async () => {
      const { vcs, records, proposals, version } = setUp();
      await proposals.open("7KQ2MX", version);
      expect(await proposals.end("7KQ2MX")).toBeNull();
      expect(vcs.worktrees.size).toBe(0);
      expect(vcs.refs.size).toBe(0);
      expect(records.files.size).toBe(0);
    });

    it("leaves no ref when the run only wrote a file the repository ignores", async () => {
      const { vcs, records, proposals, version } = setUp();
      const { folder } = await proposals.open("7KQ2MX", version);
      vcs.filesOf(folder).set("build/out.log", "log\n");
      vcs.ignored.add("build/out.log");
      expect(await proposals.end("7KQ2MX")).toBeNull();
      expect(vcs.refs.size).toBe(0);
      expect(records.files.size).toBe(0);
      expect(vcs.worktrees.size).toBe(0);
    });
  });

  describe("ending a run without a worktree", () => {
    it("does nothing, for a run never opened or one that already ended", async () => {
      const { vcs, proposals, version, endFailures } = setUp();
      expect(await proposals.end("01JD8Q")).toBeNull();
      const { folder } = await proposals.open("01JD8Q", version);
      vcs.filesOf(folder).set("notes/today.md", "Done.\n");
      const proposal = await proposals.end("01JD8Q");
      expect(await proposals.end("01JD8Q")).toBeNull();
      expect((await proposals.get("01JD8Q"))?.proposal).toEqual(proposal);
      expect(endFailures).toEqual([]);
    });
  });

  describe("an end that can't finish", () => {
    it("reports the error instead of throwing, and the next start clears what it left", async () => {
      const { vcs, records, proposals, version, endFailures } = setUp();
      const { folder } = await proposals.open("01JD8Q", version);
      vcs.filesOf(folder).set("notes/today.md", "Done.\n");
      const failure = new Error("disk full");
      vcs.diffBetween = () => Promise.reject(failure);

      expect(await proposals.end("01JD8Q")).toBeNull();

      expect(endFailures).toEqual([{ runId: "01JD8Q", error: failure }]);
      await proposals.removeLeftovers(new Set());
      expect(vcs.worktrees.size).toBe(0);
      expect(records.files.size).toBe(0);
    });

    it("still gives the proposal when only removing the worktree fails", async () => {
      const { vcs, proposals, version, endFailures } = setUp();
      const { folder } = await proposals.open("01JD8Q", version);
      vcs.filesOf(folder).set("notes/today.md", "Done.\n");
      const failure = new Error("folder in use");
      vcs.removeWorktree = () => Promise.reject(failure);

      const proposal = await proposals.end("01JD8Q");

      expect(proposal?.files).toEqual([
        { path: "notes/today.md", change: "added", base: "absent" },
      ]);
      expect(endFailures).toEqual([{ runId: "01JD8Q", error: failure }]);
      expect(await proposals.get("01JD8Q")).not.toBeNull();
    });
  });
});
