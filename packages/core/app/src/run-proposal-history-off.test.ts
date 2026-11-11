// What only a run with history off does (HAL-3248): copy the workspace,
// within limits, and keep its texts whatever the setting is later. What both
// kinds share is in `run-proposal-texts.test.ts`.

import type { Digest } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { CopyProposalTexts } from "./run-proposal-copy-texts.ts";
import { WorkspaceTooBigToCopyError } from "./run-proposal-types.ts";
import { TestDefinitionStore } from "./testing/memory-definition-store.ts";
import { clerk, proposeRun, setUpProposals } from "./testing/run-proposal-fixtures.ts";
import { TestRunCopies } from "./testing/test-run-copies.ts";

/** SHA-256 from Web Crypto, as the platform's `Digest` adapter gives it. */
const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

const clerkPath = "agents/clerk.agent.yaml";

verifies("app.run-proposal-history-off", () => {
  describe("the copy a run with history off gets", () => {
    it("holds the saved files but nothing under .halonic/ or .git/", async () => {
      const setup = setUpProposals(digest, { ".halonic/settings.yaml": "trusted: false\n" }, "off");
      setup.store.files.set(".git/config", "[core]\n"); // private: the store never serves it
      const { folder } = await setup.proposals.open("01JD8Q", null);
      expect([...setup.filesOf(folder).keys()].sort()).toEqual([
        "README.md",
        clerkPath,
        "agents/old.agent.yaml",
      ]);
      expect(folder).toBe("/data/run-copies/01JD8Q/run");
    });

    it("never proposes a file the run put under .git/: the copy doesn't serve it", async () => {
      const setup = setUpProposals(digest, {}, "off");
      const { folder } = await setup.proposals.open("01JD8Q", null);
      // Julian's case on HAL-3353: the run writes a hook straight into its folder.
      setup.filesOf(folder).set(".git/hooks/post-checkout", "#!/bin/sh\ncurl example.com\n");
      expect(await setup.proposals.end("01JD8Q")).toBeNull();
      expect(setup.store.files.has(".git/hooks/post-checkout")).toBe(false);
    });

    it("keeps only the changed files, on both sides, once the run ended", async () => {
      const setup = setUpProposals(digest, {}, "off");
      await proposeRun(setup, "01JD8Q", (files) => {
        files.set(clerkPath, "name: Clerk\nmodel: smart\n");
      });
      expect([...setup.copies.store("01JD8Q", "base").files]).toEqual([[clerkPath, clerk]]);
      expect([...setup.copies.store("01JD8Q", "run").files]).toEqual([
        [clerkPath, "name: Clerk\nmodel: smart\n"],
      ]);
    });
  });

  describe("a workspace too big to copy", () => {
    const workspace = new TestDefinitionStore({ "a.md": "12345", "b.md": "67890", "c.md": "x" });

    it.each([
      ["files", { files: 2, bytes: 1000 }, "more than 2 files"],
      ["bytes", { files: 100, bytes: 8 }, "more than 8 bytes"],
    ])("fails at start past the limit of %s, and leaves no copy", async (_limit, limits, says) => {
      const copies = new TestRunCopies(digest);
      const texts = new CopyProposalTexts(copies, workspace, digest, limits);
      const opening = texts.open("01JD8Q");
      await expect(opening).rejects.toBeInstanceOf(WorkspaceTooBigToCopyError);
      await expect(opening).rejects.toThrow(says);
      expect(copies.copies.size).toBe(0);
    });
  });

  describe("history turned on or off between a run and Accept", () => {
    it("still accepts each proposal from its own texts", async () => {
      const setup = setUpProposals(digest, {}, "off");
      await proposeRun(setup, "01JD8Q", (files) => {
        files.set("notes/off.md", "With history off.\n");
      });
      // History is on now: the next run starts at a commit.
      const { folder } = await setup.proposals.open("7KQ2MX", setup.version);
      setup.vcs.filesOf(folder).set("notes/on.md", "With history on.\n");
      await setup.proposals.end("7KQ2MX");

      await setup.proposals.accept("01JD8Q", "all");
      await setup.proposals.accept("7KQ2MX", "all");

      expect(setup.store.files.get("notes/off.md")).toBe("With history off.\n");
      expect(setup.store.files.get("notes/on.md")).toBe("With history on.\n");
    });
  });

  describe("leftovers at start", () => {
    it("removes a copy no record names, and keeps one whose record can't be read", async () => {
      const setup = setUpProposals(digest, {}, "off");
      await setup.copies.create("3NP4RT"); // made before a crash, never recorded
      await proposeRun(setup, "01JD8Q", (files) => {
        files.set(clerkPath, "name: Clerk\nmodel: smart\n");
      });
      setup.records.files.set("01JD8Q.json", "{ broken");
      await setup.proposals.removeLeftovers(new Set());
      expect(await setup.copies.list()).toEqual(["01JD8Q"]);
    });
  });
});
