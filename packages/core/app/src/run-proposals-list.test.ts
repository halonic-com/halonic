import type { Digest } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { proposeRun, setUpProposals } from "./testing/run-proposal-fixtures.ts";

/** SHA-256 from Web Crypto, as the platform's `Digest` adapter gives it. */
const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

verifies("app.run-proposal-list", () => {
  describe("listing the open proposals", () => {
    it("lists them newest first", async () => {
      const setup = setUpProposals(digest);
      await proposeRun(setup, "01JD8Q", (files) => files.set("notes/a.md", "A\n"));
      setup.clock.time = new Date("2026-11-11T10:00:00.000Z");
      await proposeRun(setup, "7KQ2MX", (files) => files.set("notes/b.md", "B\n"));

      const listed = await setup.proposals.list();

      expect(listed.map((record) => record.proposal.runId)).toEqual(["7KQ2MX", "01JD8Q"]);
    });

    it("leaves out a settled proposal", async () => {
      const setup = setUpProposals(digest);
      await proposeRun(setup, "01JD8Q", (files) => files.set("notes/a.md", "A\n"));
      await setup.proposals.reject("01JD8Q", "all");
      expect(await setup.proposals.settle("01JD8Q")).toBe("settled");

      expect(await setup.proposals.list()).toEqual([]);
    });

    it("is empty after a run that changed nothing", async () => {
      const setup = setUpProposals(digest);
      await setup.proposals.open("01JD8Q", setup.startAt);
      await setup.proposals.end("01JD8Q");

      expect(await setup.proposals.list()).toEqual([]);
    });
  });
});
