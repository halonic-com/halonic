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

const run = (runId: string): ProposalFolderRun => ({ runId, hubId: "main", workflowId: "triage" });

/** Proposal folders on a fresh proposal service, with every run read at the saved files' commit. */
function setUp() {
  const setup = setUpProposals(digest);
  const asked: ProposalFolderRun[] = [];
  const folders = new ProposalFolders({
    proposals: setup.proposals,
    versionOf: async (asking) => {
      asked.push(asking);
      return setup.version;
    },
  });
  return { ...setup, folders, asked };
}

verifies("app.run-proposal-folders", () => {
  describe("ProposalFolders", () => {
    it("opens a run's folder at the commit its definitions were read from", async () => {
      const { folders, filesOf, asked } = setUp();

      const folder = await folders.open(run("01JD8Q"));

      expect(filesOf(folder).get("agents/clerk.agent.yaml")).toBe(clerk);
      expect(asked).toEqual([run("01JD8Q")]);
      expect(await folders.folderOf("01JD8Q")).toBe(folder);
    });

    it("gives an open run its folder again", async () => {
      const { folders, vcs } = setUp();

      const folder = await folders.open(run("01JD8Q"));

      expect(await folders.open(run("01JD8Q"))).toBe(folder);
      expect(vcs.worktrees.size).toBe(1);
    });

    it("ends a run's folder, keeping what it changed as its proposal", async () => {
      const { folders, filesOf, proposals } = setUp();
      const folder = await folders.open(run("01JD8Q"));
      filesOf(folder).set("notes/today.md", "Step 1.\n");

      await folders.end("01JD8Q");

      expect(await folders.folderOf("01JD8Q")).toBeNull();
      const proposed = await proposals.get("01JD8Q");
      expect(proposed?.proposal.files.map(({ path }) => path)).toEqual(["notes/today.md"]);
    });

    it("at start, ends the folder of a run the engine has ended, and keeps open runs' folders", async () => {
      const { folders, filesOf, proposals, vcs } = setUp();
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
      const { folders, vcs, endFailures } = setUp();
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
