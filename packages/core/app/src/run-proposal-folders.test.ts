import type { RunVersion } from "@halonicjs/events";
import type { Digest } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { type ProposalFolderRun, ProposalFolders } from "./run-proposal-folders.ts";
import { clerk, setUpProposals } from "./testing/run-proposal-fixtures.ts";

/** SHA-256 from Web Crypto, as the platform's `Digest` adapter gives it. */
const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

/** Proposal folders on a fresh proposal service, with the saved files at a live version's commit. */
function setUp() {
  const setup = setUpProposals(digest);
  const folders = new ProposalFolders({ proposals: setup.proposals });
  const live: RunVersion = {
    reads: "live-version",
    commit: setup.version,
    versionDate: "2026-11-11T08:00:00.000Z",
  };
  /** A top-level run of `triage` that read the live version, or the given one. */
  const run = (runId: string, version: RunVersion | null = live): ProposalFolderRun => ({
    runId,
    hubId: "main",
    workflowId: "triage",
    version,
  });
  return { ...setup, folders, run };
}

verifies("app.run-proposal-folders", () => {
  describe("ProposalFolders", () => {
    it("opens a run's folder at the commit its definitions were read from", async () => {
      const { folders, filesOf, vcs, copies, run } = setUp();

      const folder = await folders.open(run("01JD8Q"));

      expect(filesOf(folder).get("agents/clerk.agent.yaml")).toBe(clerk);
      expect(vcs.worktrees.size).toBe(1);
      expect(copies.copies.size).toBe(0);
      expect(await folders.folderOf("01JD8Q")).toBe(folder);
    });

    it.each([
      ["read the saved files", { reads: "saved-files" } as const],
      ["names no version", null],
    ])("opens a copy of the saved files for a run that %s", async (_, version) => {
      const { folders, vcs, copies, run } = setUp();

      const folder = await folders.open(run("01JD8Q", version));

      expect(copies.filesOf(folder).get("agents/clerk.agent.yaml")).toBe(clerk);
      expect(vcs.worktrees.size).toBe(0);
      expect(copies.copies.size).toBe(1);
    });

    it("gives an open run its folder again", async () => {
      const { folders, vcs, run } = setUp();

      const folder = await folders.open(run("01JD8Q"));

      expect(await folders.open(run("01JD8Q"))).toBe(folder);
      expect(vcs.worktrees.size).toBe(1);
    });

    it("ends a run's folder, keeping what it changed as its proposal", async () => {
      const { folders, filesOf, proposals, run } = setUp();
      const folder = await folders.open(run("01JD8Q"));
      filesOf(folder).set("notes/today.md", "Step 1.\n");

      await folders.end("01JD8Q");

      expect(await folders.folderOf("01JD8Q")).toBeNull();
      const proposed = await proposals.get("01JD8Q");
      expect(proposed?.proposal.files.map(({ path }) => path)).toEqual(["notes/today.md"]);
    });

    it("at start, ends the folder of a run the engine has ended, and keeps open runs' folders", async () => {
      const { folders, filesOf, proposals, vcs, run } = setUp();
      const ended = await folders.open(run("01JD8Q"));
      filesOf(ended).set("notes/today.md", "Step 1.\n");
      const waiting = await folders.open(run("7KQ2MX"));
      filesOf(waiting).set("notes/draft.md", "Half.\n");

      await folders.start(new Set(["7KQ2MX"]));

      expect(await folders.folderOf("01JD8Q")).toBeNull();
      const proposed = await proposals.get("01JD8Q");
      expect(proposed?.proposal.files.map(({ path }) => path)).toEqual(["notes/today.md"]);
      expect(await folders.folderOf("7KQ2MX")).toBe(waiting);
      expect(vcs.filesOf(waiting).get("notes/draft.md")).toBe("Half.\n");
    });

    it("at start, removes a folder whose end can't finish", async () => {
      const { folders, vcs, endFailures, run } = setUp();
      await folders.open(run("01JD8Q"));
      const failure = new Error("disk full");
      vcs.diffBetween = () => Promise.reject(failure);

      await folders.start(new Set());

      expect(endFailures).toEqual([{ runId: "01JD8Q", error: failure }]);
      expect(await folders.folderOf("01JD8Q")).toBeNull();
      expect(vcs.worktrees.size).toBe(0);
    });
  });
});
