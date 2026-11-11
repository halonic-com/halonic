// One contract for where a run's texts are (HAL-3248): with history on (a
// worktree and a ref) and off (a copy), the proposal service behaves the
// same from open to settle.

import type { Digest } from "@halonicjs/ports";
import { contentDigest } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { ProposalUnavailableError } from "./run-proposal-types.ts";
import { clerk, old, proposeRun, setUpProposals } from "./testing/run-proposal-fixtures.ts";

/** SHA-256 from Web Crypto, as the platform's `Digest` adapter gives it. */
const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

const clerkPath = "agents/clerk.agent.yaml";
const oldPath = "agents/old.agent.yaml";

type Setup = ReturnType<typeof setUpProposals>;

/** What differs between the two kinds, for the contract below. */
const kinds = [
  {
    history: "git" as const,
    /** Deletes the run's texts outside Halonic. */
    deleteTexts: (setup: Setup, runId: string) =>
      setup.vcs.refs.delete(`refs/halonic/proposals/${runId}`),
    /** How many folders and kept texts the runs have. */
    textsLeft: (setup: Setup) => setup.vcs.refs.size + setup.vcs.worktrees.size,
  },
  {
    history: "off" as const,
    deleteTexts: (setup: Setup, runId: string) => setup.copies.copies.delete(runId),
    textsLeft: (setup: Setup) => setup.copies.copies.size,
  },
];

verifies("app.run-proposal-history-off", () => {
  describe.each(kinds)("with history $history", ({ history, deleteTexts, textsLeft }) => {
    const setUp = () => setUpProposals(digest, {}, history);

    it("proposes a file the run modified, with its base digest", async () => {
      const setup = setUp();
      const proposal = await proposeRun(setup, "01JD8Q", (files) => {
        files.set(clerkPath, "name: Clerk\nmodel: smart\n");
      });
      expect(proposal.history).toBe(history);
      expect(proposal.files).toEqual([
        {
          path: clerkPath,
          change: "modified",
          base: { digest: await contentDigest(clerk, digest) },
        },
      ]);
      expect(proposal.items).toEqual(["clerk"]);
    });

    it("proposes a file the run added, with no base", async () => {
      const setup = setUp();
      const proposal = await proposeRun(setup, "01JD8Q", (files) => {
        files.set("notes/today.md", "Three tickets.\n");
      });
      expect(proposal.files).toEqual([{ path: "notes/today.md", change: "added", base: "absent" }]);
    });

    it("proposes a file the run deleted, with its base digest", async () => {
      const setup = setUp();
      const proposal = await proposeRun(setup, "01JD8Q", (files) => {
        files.delete(oldPath);
      });
      expect(proposal.files).toEqual([
        { path: oldPath, change: "deleted", base: { digest: await contentDigest(old, digest) } },
      ]);
    });

    it("proposes nothing and keeps nothing when the run changed nothing", async () => {
      const setup = setUp();
      await setup.proposals.open("01JD8Q", setup.startAt);
      expect(await setup.proposals.end("01JD8Q")).toBeNull();
      expect(textsLeft(setup)).toBe(0);
      expect(setup.records.files.size).toBe(0);
    });

    it("gives the run its folder again until it ends", async () => {
      const setup = setUp();
      const { folder } = await setup.proposals.open("01JD8Q", setup.startAt);
      expect(setup.filesOf(folder).get(clerkPath)).toBe(clerk);
      expect(await setup.proposals.folderOf("01JD8Q")).toBe(folder);
      await setup.proposals.end("01JD8Q");
      expect(await setup.proposals.folderOf("01JD8Q")).toBeNull();
    });

    it("accepts a file, and sends one the person changed since to Compare", async () => {
      const setup = setUp();
      await proposeRun(setup, "01JD8Q", (files) => {
        files.set(clerkPath, "name: Clerk\nmodel: smart\n");
        files.set("notes/today.md", "Three tickets.\n");
      });
      setup.store.files.set(clerkPath, "name: Clerk\nmodel: fast\nrole: triage\n");

      const result = await setup.proposals.accept("01JD8Q", "all");

      expect(result.written).toEqual(["notes/today.md"]);
      expect(result.changedOnDisk).toEqual([clerkPath]);
      expect(setup.store.files.get("notes/today.md")).toBe("Three tickets.\n");
      expect(await setup.proposals.compare("01JD8Q", clerkPath)).toEqual({
        base: clerk,
        saved: "name: Clerk\nmodel: fast\nrole: triage\n",
        run: "name: Clerk\nmodel: smart\n",
      });
    });

    it("refuses a file under .halonic/ on Accept, and writes nothing of it", async () => {
      const setup = setUp();
      await proposeRun(setup, "01JD8Q", (files) => {
        files.set(".halonic/settings.yaml", "trusted: true\n");
      });
      const result = await setup.proposals.accept("01JD8Q", "all");
      expect(result.refused).toEqual([{ path: ".halonic/settings.yaml", why: "under-halonic" }]);
      expect(setup.store.files.has(".halonic/settings.yaml")).toBe(false);
    });

    it("reports the proposal as unavailable once its texts were deleted outside Halonic", async () => {
      const setup = setUp();
      await proposeRun(setup, "01JD8Q", (files) => {
        files.set(clerkPath, "name: Clerk\nmodel: smart\n");
      });
      expect(await setup.proposals.isUnavailable("01JD8Q")).toBe(false);
      deleteTexts(setup, "01JD8Q");
      expect(await setup.proposals.isUnavailable("01JD8Q")).toBe(true);
      await expect(setup.proposals.accept("01JD8Q", "all")).rejects.toBeInstanceOf(
        ProposalUnavailableError,
      );
      expect(setup.store.files.get(clerkPath)).toBe(clerk);
    });

    it("lets the texts go when the proposal is settled", async () => {
      const setup = setUp();
      await proposeRun(setup, "01JD8Q", (files) => {
        files.set(clerkPath, "name: Clerk\nmodel: smart\n");
      });
      expect(textsLeft(setup)).toBe(1);
      await setup.proposals.reject("01JD8Q", "all");
      expect(await setup.proposals.settle("01JD8Q")).toBe("settled");
      expect(textsLeft(setup)).toBe(0);
    });

    it("keeps an open run's folder and a proposal's texts at start, and removes an ended run's", async () => {
      const setup = setUp();
      await proposeRun(setup, "01JD8Q", (files) => {
        files.set(clerkPath, "name: Clerk\nmodel: smart\n");
      });
      await setup.proposals.open("7KQ2MX", setup.startAt); // waits for a person
      await setup.proposals.open("3NP4RT", setup.startAt); // ended by a crash
      await setup.proposals.removeLeftovers(new Set(["7KQ2MX"]));
      expect(await setup.proposals.folderOf("7KQ2MX")).not.toBeNull();
      expect(await setup.proposals.folderOf("3NP4RT")).toBeNull();
      expect(await setup.proposals.isUnavailable("01JD8Q")).toBe(false);
      expect(setup.records.files.has("3NP4RT.json")).toBe(false);
    });
  });
});
