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

const hour = 60 * 60 * 1000;
const day = 24 * hour;

/** Moves the setup's clock on. */
function later(setup: ReturnType<typeof setUpProposals>, by: number) {
  setup.clock.time = new Date(setup.clock.time.getTime() + by);
}

/** Rejects every file of a run's proposal and settles it. */
async function rejectAndSettle(setup: ReturnType<typeof setUpProposals>, runId: string) {
  await setup.proposals.reject(runId, "all");
  expect(await setup.proposals.settle(runId)).toBe("settled");
}

verifies("app.run-proposal-done-list", () => {
  describe("listing what is done", () => {
    it("lists the settled proposals, the one settled last first, with their decisions", async () => {
      const setup = setUpProposals(digest);
      await proposeRun(setup, "01JD8Q", (files) => files.set("notes/a.md", "A\n"));
      await proposeRun(setup, "7KQ2MX", (files) => files.set("notes/b.md", "B\n"));
      await rejectAndSettle(setup, "01JD8Q");
      later(setup, hour);
      await rejectAndSettle(setup, "7KQ2MX");

      const done = await setup.proposals.done();

      expect(done.map((record) => record.proposal.runId)).toEqual(["7KQ2MX", "01JD8Q"]);
      expect(done[1]?.decisions).toEqual({ "notes/a.md": "rejected" });
    });

    it("leaves out a proposal settled 30 days ago or more", async () => {
      const setup = setUpProposals(digest);
      await proposeRun(setup, "01JD8Q", (files) => files.set("notes/a.md", "A\n"));
      await rejectAndSettle(setup, "01JD8Q");
      later(setup, 31 * day);

      expect(await setup.proposals.done()).toEqual([]);
    });

    it("leaves out an open proposal", async () => {
      const setup = setUpProposals(digest);
      await proposeRun(setup, "01JD8Q", (files) => files.set("notes/a.md", "A\n"));

      expect(await setup.proposals.done()).toEqual([]);
    });
  });
});
